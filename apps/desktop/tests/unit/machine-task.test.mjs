/**
 * Una tarea que corre en otra máquina, apagada: abre con lo último que se leyó, dice que
 * la máquina está apagada y lleva su chip; mandarle un mensaje la enciende, sale una vez y
 * la tarea se vuelve a leer. Un archivo que nombra su chat se lee en esa máquina. El proxy
 * (`features/machines/router.ts`) se simula con sus respuestas. Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const turn = (n, text) => (n % 2 === 0
  ? { role: "user", id: `u${n}`, at: n, text }
  : { role: "agent", id: `a${n}`, at: n, text });
const row = (id, extra) => ({ id, title: `Tarea ${id}`, last_message: "", provider: "codex", model: "gpt-5.6", refs: [], created_at: 0, updated_at: 0, turns: 2, parent: null, esperando: false, ...extra });
const session = (id, turns, extra) => ({ id, provider: "codex", sources: [], model: "gpt-5.6", effort: null, permission_mode: null, turns, ...extra });

function responses(overrides) {
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
    service_poll: () => sleep(40).then(() => ({ cursor: 1, gap: false, replay: false, runtime: "lab", reset: false })),
    machine_list: [
      { id: "local", local: true, active: true, on: true, hosts: true },
      { id: "vm", local: false, active: false, on: false, hosts: true },
    ],
    ...overrides,
  };
}

const text = (app) => app.w.document.body.textContent ?? "";
async function openTask(app, id) {
  const el = app.w.document.querySelector(`[data-sesion="${id}"]`);
  assert.ok(el, `no está la fila de ${id}`);
  el.click();
  await sleep(400);
}
async function send(app, message) {
  const field = app.w.document.querySelector("textarea");
  field.value = message;
  field.dispatchEvent(new app.w.Event("input", { bubbles: true }));
  field.closest("form").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(50);
}

test("una tarea de una máquina apagada abre sin fallo y mandarle algo la enciende una vez", async () => {
  let awake = false;
  const sends = [];
  const reads = [];
  const app = await boot("listo", "machine-task", responses({
    list_live_sessions: ({ project }) => (project === "p1"
      ? [row("t1"), row("r1", { machine: "vm", machine_on: awake })]
      : []),
    load_session: ({ id }) => {
      reads.push({ id, awake });
      if (id !== "r1") return session(id, [turn(0, "Hola local"), turn(1, "Respuesta local")]);
      return awake
        ? session(id, [turn(0, "Pregunta guardada"), turn(1, "Respuesta guardada"), turn(2, "sigue"), turn(3, "Respuesta despierta")])
        : session(id, [turn(0, "Pregunta guardada"), turn(1, "Respuesta guardada")], { offline: { machine: "vm" } });
    },
    send_message: async (args) => {
      sends.push(args);
      await sleep(300);
      awake = true;
      return args.session;
    },
  }));
  await sleep(600);
  const doc = app.w.document;
  assert.ok(doc.querySelector('[data-sesion="r1"]'), "la tarea de la máquina apagada no sale en el sidebar");
  // La tarjeta del riel ya no lleva la máquina: la dice su tarjeta flotante.
  assert.equal(doc.querySelector('[data-sesion="r1"] [data-machine]'), null, "la tarjeta del sidebar no lleva chip de máquina");

  await openTask(app, "r1");
  assert.ok(text(app).includes("Respuesta guardada"), "no enseña la copia guardada");
  assert.equal(doc.querySelector("[data-machine-notice]")?.textContent, "vm está apagada: se enciende cuando envíes un mensaje.");
  const location = doc.querySelector('[data-conversacion] [data-task-location][data-task-location-on="false"]');
  assert.equal(location?.querySelector("[data-task-location-machine]")?.textContent, "vm", "la ventana no dice en qué máquina corre");

  await send(app, "sigue");
  assert.equal(doc.querySelector("[data-machine-notice]")?.textContent, "Encendiendo vm…");
  await sleep(700);
  assert.equal(sends.length, 1, "el mensaje salió más de una vez");
  assert.equal(sends[0].session, "r1");
  assert.equal(doc.querySelector("[data-machine-notice]"), null, "el aviso sigue tras encenderla");
  assert.ok(doc.querySelector('[data-task-location][data-task-location-on="true"]'), "la ventana sigue diciendo que está apagada");
  assert.ok(reads.some((r) => r.id === "r1" && r.awake), "no se volvió a leer la tarea");
  assert.ok(text(app).includes("Respuesta despierta"));
  assert.deepEqual(app.failures, []);
});

test("la ventana de una tarea local dice su máquina, su proyecto y su rama", async () => {
  const app = await boot("listo", "machine-task-location", responses({
    list_live_sessions: ({ project }) => (project === "p1" ? [row("t1")] : []),
    load_session: ({ id }) => session(id, [turn(0, "Hola local"), turn(1, "Respuesta local")]),
    task_history: { history: { archived: false, events: [], recovery: null }, branch: "feat/task-location", path: "/lab/wt/t1", available: true, owned: true, restorable: false, recreatable: false, incomplete: false },
  }));
  await sleep(600);
  await openTask(app, "t1");
  const doc = app.w.document;
  const location = doc.querySelector('[data-conversacion] [data-task-location][data-task-location-on="true"]');
  assert.ok(location, "la ventana no dice dónde corre");
  assert.match(location.querySelector("[data-task-location-machine]")?.textContent ?? "", /^Esta (Mac|computadora)$/);
  assert.equal(location.querySelector("[data-task-location-project]")?.textContent, "P1");
  assert.equal(location.querySelector("[data-task-location-branch]")?.textContent, "feat/task-location");
  assert.deepEqual(app.failures, []);
});

test("la tarea nueva lleva la barra de una tarea: ubicación, herramientas apagadas con su porqué y carpeta apagada, sin columna derecha", async () => {
  const app = await boot("listo", "machine-task-draft-bar", responses({
    list_live_sessions: ({ project }) => (project === "p1" ? [row("t1")] : []),
    load_session: ({ id }) => session(id, [turn(0, "Hola local"), turn(1, "Respuesta local")]),
  }));
  await sleep(600);
  const doc = app.w.document;
  const boton = (label) => doc.querySelector(`button[aria-label="${label}"]`);
  boton("Nueva tarea en P1").click();
  await sleep(400);
  assert.equal(doc.querySelector("[data-task-location-project]")?.textContent, "P1");
  const buscar = doc.querySelector('button[aria-label="Buscar en esta tarea"][aria-keyshortcuts]');
  assert.equal(buscar?.getAttribute("aria-disabled"), "true");
  assert.equal(buscar.title, "Buscar estará disponible cuando la tarea tenga mensajes");
  buscar.click();
  await sleep(50);
  assert.equal(doc.querySelector('[role="search"]'), null, "la búsqueda se abrió sin nada que buscar");
  const delegadas = doc.querySelector('[data-delegated-trigger="toolbar"]');
  assert.equal(delegadas?.getAttribute("aria-disabled"), "true");
  assert.equal(delegadas.title, "Aún no hay tareas delegadas");
  // La carpeta existe: su icono abre el panel con los archivos base, sin columna aparte.
  const carpeta = boton("Archivos de la tarea");
  assert.equal(carpeta?.disabled, false, "la carpeta existe: su icono no se apaga");
  assert.equal(carpeta.getAttribute("aria-pressed"), "false");
  carpeta.click();
  await sleep(300);
  assert.equal(boton("Archivos de la tarea")?.getAttribute("aria-pressed"), "true", "el panel de la carpeta no abrió");
  assert.ok(doc.querySelector("[data-task-location]"), "la barra de ubicación desapareció con el panel abierto");
  boton("Archivos de la tarea").click();
  await sleep(100);
  // Una tarea real sin delegadas conserva el hueco, y su búsqueda sí funciona.
  await openTask(app, "t1");
  assert.equal(doc.querySelector('[data-delegated-trigger="toolbar"]')?.getAttribute("aria-disabled"), "true");
  assert.equal(doc.querySelector('button[aria-label="Buscar en esta tarea"][aria-keyshortcuts]')?.getAttribute("aria-disabled"), null);
  assert.deepEqual(app.failures, []);
});

test("el PDF que nombra el chat de una tarea de otra máquina se lee en esa máquina", async () => {
  const PDF = "/Users/alberto/exchange/Propuesta%20Chemara.pdf";
  const reads = [];
  // El motor de la ventana no tiene el archivo: solo contesta la máquina de la tarea.
  const there = (command, value) => (args, options) => {
    const machine = options?.headers?.["x-terminus-machine"] ?? null;
    reads.push({ command, path: args.path, machine });
    if (machine !== "vm") throw new Error("not_found");
    return value;
  };
  const app = await boot("listo", "machine-task-file", responses({
    list_live_sessions: ({ project }) => (project === "p1" ? [row("r1", { machine: "vm", machine_on: true })] : []),
    load_session: ({ id }) => session(id, [turn(0, "hazme la propuesta"), turn(1, `Lista:

![Propuesta Danil para Chemara](${PDF})`)]),
    file_size: there("file_size", 2048),
    preview_file: there("preview_file", { kind: "pdf", text: null, data_url: null, pdf: null, bytes: 2048, truncated: false }),
  }), undefined, {}, {
    beforeImport: (w) => {
      globalThis.IntersectionObserver = w.IntersectionObserver = class {
        constructor(callback) { this.callback = callback; }
        observe(target) { setTimeout(() => this.callback([{ isIntersecting: true, target }], this), 0); }
        unobserve() {}
        disconnect() {}
        takeRecords() { return []; }
      };
    },
  });
  await sleep(600);
  await openTask(app, "r1");
  await sleep(300);
  const path = decodeURIComponent(PDF);
  assert.ok(text(app).includes("PDF · 2 KB"), "la tarjeta no tiene el tamaño del archivo");
  for (const command of ["file_size", "preview_file"]) {
    const asked = reads.filter((r) => r.command === command && r.path === path);
    assert.ok(asked.length > 0, `no pidió ${command}`);
    assert.deepEqual(asked.map((r) => r.machine), asked.map(() => "vm"), `${command} fue al motor de la ventana`);
  }
});

test("el composer consulta la máquina elegida y descarta respuestas tardías", async () => {
  const app = await boot("listo", "machine-composer-accounts", responses({
    list_live_sessions: ({ project }) => project === "p1" ? [row("r1", { machine: "vm", machine_on: true })] : [],
    load_session: ({ id }) => session(id, [turn(0, "Hola"), turn(1, "Respuesta")]),
  }));
  await sleep(600);
  const doc = app.w.document;
  const original = app.w.__TAURI_INTERNALS__.invoke;
  const calls = [];
  let finishVm;
  app.w.__TAURI_INTERNALS__.invoke = (command, args, options) => {
    const machine = options?.headers?.["x-terminus-machine"];
    calls.push({ command, machine });
    if (command === "list_surfaces") {
      if (machine === "vm") return new Promise((resolve) => { finishVm = resolve; });
      return Promise.resolve([{ id: "codex", provider: "codex", label: "Codex", catalogo: "todo", usable: true, marca: null, porque: null }]);
    }
    if (command === "list_models") return Promise.resolve({ provider: args.provider, models: [{ id: machine === "vm" ? "vm-model" : "local-model", label: machine === "vm" ? "VM model" : "Local model", efforts: [], default_effort: null }], fallback: false });
    return original(command, args, options);
  };
  const pick = async (id) => {
    doc.querySelector('[aria-label="Ejecutar en"]').click();
    await sleep(100);
    doc.querySelector(`[data-machine-option="${id}"]`).click();
    await sleep(150);
  };
  await pick("vm");
  assert.ok(calls.some((c) => c.command === "list_surfaces" && c.machine === "vm"), "no consulta las credenciales de la máquina elegida");
  await pick("local");
  assert.ok(calls.some((c) => c.command === "list_models" && c.machine === undefined), "no relee el catálogo al volver a la máquina local");
  finishVm([{ id: "claude", provider: "claude", label: "Claude Code", catalogo: "todo", usable: true, marca: null, porque: null }]);
  await sleep(150);
  assert.ok(doc.querySelector('[aria-label*="Local model"]'), "la respuesta tardía de la VM reemplazó el catálogo local");
  await openTask(app, "r1");
  assert.equal(calls.filter((c) => c.command === "list_surfaces").at(-1).machine, "vm", "abrir la tarea no sigue la máquina donde corre");
  finishVm([{ id: "codex", provider: "codex", label: "Codex", catalogo: "todo", usable: true, marca: null, porque: null }]);
  await sleep(150);
  assert.ok(doc.querySelector('[aria-label*="VM model"]'), "la tarea remota conserva los modelos locales");
  assert.deepEqual(app.failures, []);
});

test("reopening a live permission sends the observed durable id and revision", async () => {
  let waiting = true;
  const decisions = [];
  const pending = { id: "durable-7", request_id: "provider-1", revision: 7, tool: "Bash", target: "echo permission-proof" };
  const app = await boot("listo", "durable-permission", responses({
    list_live_sessions: () => [row("t1")],
    list_active_turns: ["t1"],
    load_session: ({ id }) => session(id, [turn(0, "Waiting for approval")]),
    pending_requests: () => ({ permissions: waiting ? [pending] : [], questions: [], records: { permissions: [{ ...pending, id: "old-delivery", state: "delivery_unknown" }] } }),
    respond_permission: args => {
      decisions.push(args);
      waiting = false;
      return { id: "decision", role: "user", text: "", permission: { request_id: "provider-1", tool: "Bash", target: pending.target, allow: args.allow, when: 1 } };
    },
  }));
  await sleep(600);
  await openTask(app, "t1");
  const approve = [...app.w.document.querySelectorAll("button")].find(button => button.textContent?.trim() === "Aprobar y ejecutar");
  assert.ok(approve, "pending permission must be restored without a live event");
  approve.click();
  await sleep(200);
  assert.deepEqual(decisions, [{ session: "t1", requestId: "durable-7", revision: 7, allow: true }]);
  assert.equal([...app.w.document.querySelectorAll("button")].some(button => button.textContent?.trim() === "Aprobar y ejecutar"), false);
  assert.deepEqual(app.failures, []);
});

for (const state of ["delivery_unknown", "owner_lost"]) test(`a missing live permission retains its durable ${state} outcome without resending`, async () => {
  let waiting = true;
  let sent = 0;
  const pending = { id: "durable-lost", request_id: "provider-lost", revision: 7, tool: "Bash", target: "echo proof" };
  const app = await boot("listo", `permission-${state}`, responses({
    list_live_sessions: () => [row("t1")], list_active_turns: ["t1"],
    load_session: ({ id }) => session(id, [turn(0, "Waiting")]),
    pending_requests: () => ({ permissions: waiting ? [pending] : [], questions: [], records: { permissions: [{ ...pending, state: waiting ? "waiting" : state === "owner_lost" ? "closed" : state, closed: !waiting && state === "owner_lost" ? "owner_lost" : null }] } }),
    respond_permission: () => { sent++; waiting = false; throw { what: "Transport failed", detail: "io" }; },
  }));
  await sleep(600);
  await openTask(app, "t1");
  const approve = [...app.w.document.querySelectorAll("button")].find(b => b.textContent?.trim() === "Aprobar y ejecutar");
  assert.ok(approve);
  approve.click();
  await sleep(300);
  assert.equal(sent, 1);
  assert.ok(app.w.document.body.textContent.includes(state), "durable outcome remains in the conversation diagnostic");
  if (state === "owner_lost") assert.ok(app.w.document.body.textContent.includes("El proceso que esperaba la respuesta"));
  assert.equal([...app.w.document.querySelectorAll("button")].some(b => b.textContent?.trim() === "Aprobar y ejecutar"), false);
  assert.deepEqual(app.failures, []);
});
