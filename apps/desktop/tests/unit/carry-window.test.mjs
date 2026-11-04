/** Copia explícita de carpetas, reintento, cancelación y creación remota sin copia. Monta dist/. */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const PAYLOAD = Buffer.from("bundle y archivos de la foto").toString("base64");
const STATUS = {
  branch: "feat/run-on-bundle", head: "a1", upstream: "origin/feat/run-on-bundle", remoteBase: "9f",
  remoteUrl: "https://github.com/danil-labs/p1.git", ahead: 3, changed: 5, untracked: 2,
  largeUntracked: [{ path: "data/big.csv", bytes: 300 * 1024 * 1024 }],
  ignored: [{ path: ".env.local", bytes: 812, suggested: true }, { path: ".claude/settings.local.json", bytes: 1100, suggested: false }],
  ignoredSkipped: ["node_modules/"], lfs: false, submodules: true, takenAt: 1_760_000_000,
};

const machineOf = (options) => new Headers(options?.headers).get("x-terminus-machine") ?? "local";

function responses(log, overrides = {}) {
  const at = (name, fn) => (args, options) => {
    log.push({ name, machine: machineOf(options), args });
    return fn(args, options);
  };
  return {
    window_ready: null,
    window_vitals: null,
    setup_required: false,
    list_providers: [{ id: "codex", label: "Codex", available: true, driver: true }],
    list_workspaces: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
    workspaces_startup: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
    list_projects: () => [{ id: "p1", name: "P1", working_directory: "/lab/p1", kind: "git", portfolio: null, sources: [] }],
    list_portfolios: [],
    list_sources: [],
    list_agents: { agents: [], rechazados: [] },
    list_agent_status: [],
    list_mentions: { fuentes: [], archivos: [] },
    list_models: { provider: "codex", models: [{ id: "gpt-5.6", label: "GPT-5.6", gratis: null, note: null, efforts: [], default_effort: null }], fallback: false },
    list_surfaces: [{ id: "codex", provider: "codex", label: "Codex", catalogo: "todo", usable: true, marca: null, porque: null }],
    session_folder: "/tmp",
    list_task_trees: [],
    list_live_sessions: [],
    watch_task_tree: "watch",
    unwatch_task_tree: null,
    task_history: { history: { archived: false, events: [], recovery: null }, branch: null, path: "/lab", available: true, owned: false, restorable: false, recreatable: false, incomplete: false },
    list_live_turns: [],
    list_active_turns: [],
    load_queue: [],
    save_queue: null,
    session_usage: null,
    list_session_git: {},
    turn_authors: { person: null, agent: null },
    service_filter: null,
    project_base_branches: { branches: [], selected: null },
    load_session: ({ id }) => ({ id, provider: "codex", sources: [], model: "gpt-5.6", effort: null, permission_mode: null, turns: [] }),
    service_poll: () => sleep(40).then(() => ({ cursor: 1, gap: false, replay: false, runtime: "lab", reset: false })),
    machine_list: [
      { id: "local", local: true, active: true, on: true, hosts: true },
      { id: "vm", local: false, active: false, on: true, hosts: true },
    ],
    work_status: at("work_status", () => STATUS),
    work_export: at("work_export", ({ operation }) => ({ transfer: `t-${operation}`, bytes: Buffer.from(PAYLOAD, "base64").length, sha256: "abc", head: "a1", wip: "w1", base: "9f" })),
    work_read_part: at("work_read_part", () => ({ data: PAYLOAD, eof: true })),
    work_write_part: at("work_write_part", () => ({ received: 1 })),
    work_import: at("work_import", ({ probe }) => (probe ? { head: "", base: "", branch: null, files: [], snapshot: false } : { head: "a1", base: "w1", branch: null, files: [".env.local"], snapshot: true })),
    work_cancel: at("work_cancel", () => null),
    // Todo va por el relay de la cuenta: siempre se sella para el motor de destino.
    work_key: { publicKey: "S0VZLWRFLUxBLVZN" },
    send_message: at("send_message", () => "r1"),
    ...overrides,
  };
}

const until = async (check, ms = 4000) => {
  for (let waited = 0; waited < ms; waited += 50) {
    if (check()) return true;
    await sleep(50);
  }
  return false;
};

async function start(name, log, overrides, explicit = true) {
  const app = await boot("listo", name, responses(log, {
    list_live_sessions: () => [{ id: "local-task", title: "Local", provider: "codex", refs: [], created_at: 0, updated_at: 0, turns: 1, parent: null }],
    ...overrides,
  }), undefined, { "harness.layout.sidebar.view.w": JSON.stringify({ folders: [], agent: null, group: "folder" }) });
  await sleep(600);
  const doc = app.w.document;
  const button = (label) => [...doc.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(label));
  doc.querySelector('button[aria-label="Proyecto"]').click();
  // Dentro del selector: la barra lateral también tiene un botón «P1» (el grupo de la carpeta).
  const opcion = () => [...doc.querySelectorAll("[role=dialog] button")].find((b) => b.textContent?.trim().startsWith("P1"));
  assert.ok(await until(() => opcion()), "no se abre el selector de proyecto");
  opcion().click();
  await sleep(300);
  doc.querySelector('[aria-label="Ejecutar en"]').click();
  assert.ok(await until(() => doc.querySelector('[data-machine-option="vm"]')));
  doc.querySelector('[data-machine-option="vm"]').click();
  await sleep(300);
  if (explicit) {
    doc.querySelector('[data-folder-group="p1"] [aria-haspopup="menu"]').click();
    assert.ok(await until(() => doc.querySelector("[data-carry-folder]")));
    doc.querySelector("[data-carry-folder]").click();
    assert.ok(await until(() => doc.querySelector("[data-carry-sheet]")));
  }
  return { app, doc, button };
}

async function write(app, message) {
  const field = app.w.document.querySelector("textarea");
  field.value = message;
  field.dispatchEvent(new app.w.Event("input", { bubbles: true }));
  field.closest("form").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
}

test("llevar explícitamente a la VM copia por partes y crea la tarea sobre la foto", async () => {
  const log = [];
  const { app, doc } = await start("carry-window", log);
  await write(app, "arregla el login");
  assert.ok(await until(() => doc.querySelector("[data-carry-sheet]")), "no se abrió la hoja de llevar");
  const sheet = doc.querySelector("[data-carry-sheet]");
  assert.ok(sheet.textContent.includes("3 commits sin push en feat/run-on-bundle"), sheet.textContent);
  assert.equal(doc.querySelector('[data-carry-ignored=".env.local"]').checked, true, "el .env no sale marcado");
  assert.equal(doc.querySelector('[data-carry-ignored=".claude/settings.local.json"]').checked, false);
  assert.equal(doc.querySelector('[data-carry-large="data/big.csv"]').checked, false, "el archivo nuevo grande sale marcado (D2)");
  assert.ok(doc.querySelector('[data-carry-notice="submodules"]'), "no avisa de los submódulos");
  assert.equal(doc.querySelector("textarea").value, "arregla el login", "el mensaje no espera en la caja");
  assert.equal(log.filter((c) => c.name === "send_message").length, 0, "se envió antes de decidir");
  assert.deepEqual(log.find((c) => c.name === "work_status"), { name: "work_status", machine: "local", args: { project: "p1", task: null } });

  assert.ok(await until(() => doc.querySelector("[data-carry-confirm]")?.disabled === false), "la hoja no supo el tamaño");
  const exported = log.filter((c) => c.name === "work_export").at(-1);
  assert.equal(exported.machine, "local");
  assert.deepEqual([exported.args.files, exported.args.exclude, exported.args.includeWork], [[".env.local"], ["data/big.csv"], true]);
  assert.equal(exported.args.recipientKey, "S0VZLWRFLUxBLVZN", "el escritorio no selló para el destino");
  assert.ok(doc.querySelector("[data-carry-sealed]"), "no dice que viaja sellado");
  doc.querySelector("[data-carry-confirm]").click();

  assert.ok(await until(() => log.some((c) => c.name === "send_message")), "la tarea no se creó");
  const order = log.filter((c) => c.name !== "work_status" && c.name !== "work_export").map((c) => `${c.name}@${c.machine}${c.args.probe ? ":probe" : ""}`);
  assert.deepEqual(order, ["work_import@vm:probe", "work_read_part@local", "work_write_part@vm", "work_import@vm", "send_message@vm"]);
  const sent = log.find((c) => c.name === "send_message").args;
  assert.deepEqual([sent.baseRef, sent.unwrapSnapshot, sent.prompt], ["w1", true, "arregla el login"]);
  assert.equal(log.find((c) => c.name === "work_write_part").args.transfer, exported.args.operation ? `t-${exported.args.operation}` : undefined, "se copió otra transferencia");
  assert.equal(doc.querySelector("[data-carry-sheet]"), null);
  assert.ok(await until(() => doc.querySelector("[data-carry-origin]")?.textContent.includes("feat/run-on-bundle")), "la tarea no dice que es una copia");
  assert.deepEqual(app.failures, []);
});

test("si la copia se corta el mensaje vuelve a la caja y reintentar sigue sin volver a exportar", async () => {
  const log = [];
  // Un corte suelto se repite solo; tres seguidos en la misma parte ya se le dicen a la persona.
  let fails = 3;
  const { app, doc } = await start("carry-window-retry", log, {
    work_write_part: (args, options) => {
      log.push({ name: "work_write_part", machine: machineOf(options), args });
      if (fails > 0) {
        fails -= 1;
        return Promise.reject({ what: { clave: "shell.service.unreachable" }, detail: "machine_lost" });
      }
      return { received: 1 };
    },
  });
  await write(app, "sigue");
  assert.ok(await until(() => doc.querySelector("[data-carry-confirm]")?.disabled === false));
  doc.querySelector("[data-carry-confirm]").click();
  assert.ok(await until(() => doc.querySelector("[data-carry-failure]")), "no dice que se cortó");
  assert.equal(doc.querySelector("[data-carry-failure]").textContent, "Se cortó la copia en 1 de 1 partes.");
  assert.equal(doc.querySelector("textarea").value, "sigue", "el mensaje no volvió a la caja");
  assert.equal(log.filter((c) => c.name === "send_message").length, 0);
  const exports = log.filter((c) => c.name === "work_export").length;

  doc.querySelector("[data-carry-fix]").click();
  assert.ok(await until(() => log.some((c) => c.name === "send_message")), "reintentar no creó la tarea");
  assert.equal(log.filter((c) => c.name === "work_export").length, exports, "reintentar volvió a exportar");
  assert.equal(log.filter((c) => c.name === "work_write_part").length, 4);
  assert.equal(doc.querySelector("[data-carry-progress]"), null, "el avance sigue a la vista");
  assert.deepEqual(app.failures, []);
});

test("sin nada sin subir y con el proyecto en la VM se manda como siempre, sin hoja", async () => {
  const log = [];
  const { app, doc } = await start("carry-window-clean", log, {
    work_status: (args, options) => {
      log.push({ name: "work_status", machine: machineOf(options), args });
      return { ...STATUS, ahead: 0, changed: 0, untracked: 0 };
    },
    list_projects: (_args, options) => [{ id: "p1", name: "P1", working_directory: machineOf(options) === "vm" ? "/home/vm/p1" : "/lab/p1", kind: "git", portfolio: null, sources: [] }],
  }, false);
  await write(app, "hola");
  assert.ok(await until(() => log.some((c) => c.name === "send_message")), "no se mandó");
  assert.equal(doc.querySelector("[data-carry-sheet]"), null);
  const sent = log.find((c) => c.name === "send_message");
  assert.equal(sent.machine, "vm");
  assert.equal(sent.args.unwrapSnapshot, undefined);
  assert.equal(log.filter((c) => c.name.startsWith("work_") && c.name !== "work_status").length, 0, "copió algo sin hoja");
  assert.deepEqual(app.failures, []);
});

test("traer a esta Mac una tarea de la VM: la rama llega aquí y la tarea nueva sigue sobre ella con un resumen corto", async () => {
  const log = [];
  const row = { id: "r1", title: "Arreglar login", last_message: "", provider: "codex", model: "gpt-5.6", refs: [], created_at: 0, updated_at: 0, turns: 2, parent: null, esperando: false, machine: "vm", machine_on: true };
  const app = await boot("listo", "carry-window-bring", responses(log, {
    list_live_sessions: ({ project }) => (project === "p1" ? [row] : []),
    load_session: ({ id }) => ({ id, provider: "codex", sources: [], model: "gpt-5.6", effort: null, permission_mode: null, turns: id === "r1" ? [{ role: "user", id: "u0", at: 0, text: "arregla el login" }, { role: "agent", id: "a1", at: 1, text: "Listo: el redirect vuelve a /home." }] : [] }),
    work_import: (args, options) => {
      log.push({ name: "work_import", machine: machineOf(options), args });
      return args.probe ? { head: "", base: "", branch: null, files: [], snapshot: false } : { head: "a1", base: "w1", branch: "feat/run-on-bundle-vm", files: [], snapshot: true };
    },
    send_message: (args, options) => {
      log.push({ name: "send_message", machine: machineOf(options), args });
      return "l1";
    },
  }));
  await sleep(600);
  const doc = app.w.document;
  doc.querySelector('[data-sesion="r1"]').click();
  assert.ok(await until(() => doc.querySelector("[data-bring-here]")), "la tarea de la VM no ofrece traerla");
  assert.match(doc.querySelector("[data-bring-here]").textContent, /^Traer a esta (Mac|PC)$/);
  doc.querySelector("[data-bring-here]").click();
  assert.ok(await until(() => doc.querySelector('[data-carry-sheet="bring"]')), "no se abrió la hoja de traer");
  assert.deepEqual(log.slice(0, 2).map((c) => `${c.name}@${c.machine}${c.args.probe ? ":probe" : ""}`), ["work_import@vm:probe", "work_status@vm"], "no despertó la VM antes de preguntar");
  assert.deepEqual(log.find((c) => c.name === "work_status").args, { project: "p1", task: "r1" });
  assert.equal(doc.querySelector("[data-carry-branch-as]").textContent, "rama feat/run-on-bundle");
  assert.equal(doc.querySelector('[data-carry-ignored=".env.local"]').checked, false, "al traer se marcó un ignorado");
  assert.equal(doc.querySelector('[data-carry-next="continue"]').checked, true);

  assert.ok(await until(() => doc.querySelector("[data-carry-confirm]")?.disabled === false));
  doc.querySelector("[data-carry-confirm]").click();
  assert.ok(await until(() => doc.querySelector("textarea")?.value.includes("Viene de «Arreglar login» en vm")), "no se abrió la tarea nueva con el resumen");
  const summary = doc.querySelector("textarea").value;
  assert.ok(summary.includes("Listo: el redirect vuelve a /home.") && summary.includes("3 commits en feat/run-on-bundle-vm (hasta a1)"), summary);
  const order = log.filter((c) => c.name !== "work_status").map((c) => `${c.name}@${c.machine}${c.args.probe ? ":probe" : ""}`);
  assert.deepEqual(order.slice(order.lastIndexOf("work_import@local:probe")), ["work_import@local:probe", "work_read_part@vm", "work_write_part@local", "work_import@local"]);
  assert.equal(log.filter((c) => c.name === "work_export").at(-1).args.task, "r1");
  assert.equal(log.filter((c) => c.name === "work_import").at(-1).args.branchAs, "feat/run-on-bundle");

  doc.querySelector("textarea").closest("form").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
  assert.ok(await until(() => log.some((c) => c.name === "send_message")), "la tarea de aquí no se creó");
  const sent = log.find((c) => c.name === "send_message");
  assert.deepEqual([sent.machine, sent.args.baseRef, sent.args.unwrapSnapshot], ["local", "w1", true]);
  assert.ok(await until(() => doc.querySelector("[data-carry-origin]")?.textContent.includes("Viene de «Arreglar login» en vm")), "la tarea nueva no dice de dónde viene");
  assert.ok(doc.querySelector("[data-carry-open-original]"), "sin enlace a la original");
  assert.deepEqual(app.failures, []);
});

test("una carpeta sin remoto se lleva desde su menú: viaja entera y la VM crea el proyecto con el mismo id", async () => {
  const log = [];
  const local = { id: "t1", title: "Tarea local", last_message: "", provider: "codex", model: "gpt-5.6", refs: [], created_at: 0, updated_at: 0, turns: 2, parent: null, esperando: false };
  const app = await boot("listo", "carry-window-no-remote", responses(log, {
    list_projects: (_args, options) => (machineOf(options) === "vm" ? [] : [{ id: "p1", name: "P1", working_directory: "/lab/p1", kind: "git", portfolio: null, sources: [], remote_url: null }]),
    list_live_sessions: ({ project }) => (project === "p1" ? [local] : []),
    work_status: (args, options) => {
      log.push({ name: "work_status", machine: machineOf(options), args });
      return { ...STATUS, upstream: null, remoteBase: null, remoteUrl: null, ahead: 12 };
    },
  }), undefined, { "harness.layout.sidebar.view.w": JSON.stringify({ folders: [], agent: null, group: "folder" }) });
  await sleep(600);
  const doc = app.w.document;
  doc.querySelector('[data-folder-group="p1"] [aria-haspopup="menu"]').click();
  assert.ok(await until(() => doc.querySelector("[data-carry-folder]")), "el menú de la carpeta no ofrece llevarla");
  doc.querySelector("[data-carry-folder]").click();
  assert.ok(await until(() => doc.querySelector('[data-carry-sheet="carry"]')), "no se abrió la hoja");
  assert.equal(doc.querySelector("[data-carry-target-project]").dataset.carryTargetProject, "create");
  assert.equal(app.w.localStorage.getItem("harness.layout.machines.run_on"), JSON.stringify({ w: "vm" }), "la tarea nueva no se fue a la VM");
  assert.ok(await until(() => doc.querySelector("[data-carry-confirm]")?.disabled === false));
  assert.equal(log.filter((c) => c.name === "work_export").at(-1).args.full, true, "sin remoto no viaja entera");
  doc.querySelector("[data-carry-confirm]").click();
  await write(app, "sigue en la VM");
  assert.ok(await until(() => log.some((c) => c.name === "send_message")), "no se creó la tarea");
  const imported = log.filter((c) => c.name === "work_import" && !c.args.probe).at(-1);
  assert.deepEqual([imported.machine, imported.args.create], ["vm", { name: "P1", id: "p1" }]);
  assert.equal(log.filter((c) => c.name === "start_project_clone").length, 0, "intentó clonar sin remoto");
  assert.deepEqual(app.failures, []);
});


test("a same-named destination folder with another id does not bypass repository resolution", async () => {
  const log = [];
  const { app, doc } = await start("carry-window-same-label", log, {
    list_projects: (_args, options) => [{ id: machineOf(options) === "vm" ? "other" : "p1", name: "P1", working_directory: "/lab/repo", kind: "git", portfolio: null, sources: [] }],
    work_status: () => ({ ...STATUS, ahead: 0, changed: 0, untracked: 0, ignored: [], largeUntracked: [] }),
  });
  try {
    await write(app, "start on the VM");
    assert.ok(await until(() => doc.querySelector("[data-carry-sheet]")), "same label skipped destination resolution");
    assert.equal(doc.querySelector("[data-carry-target-project]").dataset.carryTargetProject, "clone");
    assert.equal(log.filter((c) => c.name === "send_message").length, 0);
  } finally {
    app.w.close();
  }
});


test("cancelar la copia explícita permite enviar en la VM sin copiar", async () => {
  const log = [];
  const { app, doc } = await start("carry-cancel-send", log);
  assert.ok(await until(() => doc.querySelector("[data-carry-sheet]")));
  const field = doc.querySelector("textarea");
  field.value = "usa lo que ya existe en la VM";
  field.dispatchEvent(new app.w.Event("input", { bubbles: true }));
  [...doc.querySelectorAll("[role=dialog] button")].find(b => b.textContent.trim() === "Cancelar").click();
  assert.equal(doc.querySelector("textarea").value, "usa lo que ya existe en la VM");
  await write(app, "usa lo que ya existe en la VM");
  assert.ok(await until(() => log.some(c => c.name === "send_message")), "cancelar dejó el envío atrapado en la transferencia");
  assert.equal(doc.querySelector("[data-carry-sheet]"), null);
  assert.equal(log.find(c => c.name === "send_message").machine, "vm");
  assert.equal(log.filter(c => c.name === "work_write_part").length, 0);
  assert.deepEqual(app.failures, []);
});

for (const sourceOn of [true, false]) test(`crear en una VM no consulta ni copia desde la Mac (${sourceOn ? "encendida" : "apagada"})`, async () => {
  const log = [];
  const { app, doc } = await start(`carry-dirty-no-auto-${sourceOn}`, log, {
    machine_list: [
      { id: "local", local: true, active: true, on: sourceOn, hosts: true },
      { id: "vm", local: false, active: false, on: true, hosts: true },
    ],
  }, false);
  await write(app, "usa el proyecto de la VM");
  assert.ok(await until(() => log.some(c => c.name === "send_message")), "enviar abrió una transferencia implícita");
  assert.equal(doc.querySelector("[data-carry-sheet]"), null);
  assert.equal(log.filter(c => c.name.startsWith("work_")).length, 0);
  assert.deepEqual(app.failures, []);
});
