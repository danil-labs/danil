/** Copia explícita por relay y envío tras cancelar o sin copiar. Monta dist-web/. */
import assert from "node:assert/strict";
import test from "node:test";
import { engine, fleet } from "../helpers/fake-relay.mjs";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const SAME = { id: "w", name: "W", context_root: null, provider: "github", remote: "danil/panel" };
const folder = (id, name) => ({ id, name, working_directory: `/lab/${id}`, kind: "git", portfolio: null, sources: [], remote_url: "https://github.com/danil/notas" });
const PAYLOAD = Buffer.alloc(700 * 1024, 7).toString("base64");
const STATUS = {
  branch: "feat/notas", head: "a1", upstream: "origin/feat/notas", remoteBase: "9f", remoteUrl: "https://github.com/danil/notas",
  ahead: 2, changed: 1, untracked: 0, largeUntracked: [], ignored: [{ path: ".env.local", bytes: 812, suggested: true }],
  ignoredSkipped: [], lfs: false, submodules: false, takenAt: 1_760_000_000,
};

function table(projects, extra = {}) {
  return {
    ...engine,
    list_workspaces: { workspaces: [SAME], active: "w" },
    workspaces_startup: { workspaces: [SAME], active: "w" },
    list_projects: projects,
    list_live_sessions: [],
    project_base_branches: { branches: [], selected: null },
    ...extra,
  };
}

async function until(check, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return true;
    await sleep(100);
  }
  return false;
}

const VM = { computer_id: "cmp_vm", name: "Danil VM", state: "online", provider: "aws-ec2" };
const MAC = { computer_id: "cmp_mac", name: "Mac de Ana", state: "online", provider: "self", kind: "physical" };

for (const mode of ["copy", "cancel", "existing"]) test(`web: ${mode} mantiene separadas la tarea y la copia`, async () => {
  const bytes = Buffer.from(PAYLOAD, "base64");
  const f = fleet({
    cmp_mac: { table: table([folder("pm", "Notas")], {
      list_live_sessions: ({ project }) => project === "pm" ? [{ id: "local-task", title: "Local", provider: "codex", refs: [], created_at: 0, updated_at: 0, turns: 1, parent: null }] : [],
      work_status: STATUS,
      work_export: ({ operation }) => ({ transfer: operation, bytes: bytes.length, sha256: "abc", head: "a1", wip: "w1", base: "9f" }),
      work_read_part: ({ offset, size }) => ({ data: bytes.subarray(offset, offset + size).toString("base64"), eof: offset + size >= bytes.length }),
    }) },
    cmp_vm: { table: table(mode === "existing" ? [folder("pm", "Notas")] : [], {
      work_key: { publicKey: "vm-key" },
      // El proyecto ya existe en destino: se usa sin volver a clonarlo.
      start_project_clone: ({ operation }) => ({ operation }),
      project_clone_status: ({ operation }) => ({ workspace: "w", operation, phase: "done", percent: null, done: true, project: folder("pm", "Notas") }),
      work_write_part: ({ offset, data }) => ({ received: offset + Buffer.from(data, "base64").length }),
      work_import: ({ probe }) => (probe ? { head: "", base: "", branch: null, files: [], snapshot: false } : { head: "a1", base: "w1", branch: null, files: [".env.local"], snapshot: true }),
      send_message: () => "r1",
    }) },
  });
  const app = await boot("listo", `web-carry-${mode}`, {}, undefined, { "harness.layout.machines.run_on": JSON.stringify({ w: "cmp_vm" }), "harness.layout.sidebar.view.w": JSON.stringify({ folders: [], agent: null, group: "folder" }) }, {
    web: true,
    beforeImport: (w) => {
      globalThis.WebSocket = f.Socket;
      w.terminusWeb = { endpoint: "https://relay.test", computers: [VM, MAC], getToken: async () => "tok" };
    },
  });
  await sleep(2500);
  const doc = app.w.document;
  const calls = (id, command) => f.relays[id].calls.filter((c) => c.command === command);
  doc.querySelector('[aria-label="Ejecutar en"]').click();
  assert.ok(await until(() => doc.querySelector('[data-machine-option="cmp_mac"]')));
  doc.querySelector('[data-machine-option="cmp_mac"]').click();
  await sleep(300);
  doc.querySelector('[aria-label="Proyecto"]').click();
  assert.ok(await until(() => [...doc.querySelectorAll("button")].some((b) => b.textContent.includes("Notas") && b.textContent.includes("tarea"))));
  [...doc.querySelectorAll("button")].find((b) => b.textContent.includes("Notas") && b.textContent.includes("tarea")).click();
  await sleep(300);
  doc.querySelector('[aria-label="Ejecutar en"]').click();
  assert.ok(await until(() => doc.querySelector('[data-machine-option="cmp_vm"]')));
  doc.querySelector('[data-machine-option="cmp_vm"]').click();
  await sleep(300);
  if (mode !== "existing") {
    const group = doc.querySelector('[data-folder-group="pm"]');
    assert.ok(group, JSON.stringify([...doc.querySelectorAll("[data-folder-group]")].map(g => ({ id: g.dataset.folderGroup, machine: g.dataset.folderMachine, text: g.textContent }))));
    group.querySelector('[aria-haspopup="menu"]').click();
    assert.ok(await until(() => doc.querySelector("[data-carry-folder]")));
    doc.querySelector("[data-carry-folder]").click();
    assert.ok(await until(() => doc.querySelector("[data-carry-sheet]")));
  }
  const field = doc.querySelector("textarea");
  field.value = "sigue en la VM";
  field.dispatchEvent(new app.w.Event("input", { bubbles: true }));
  if (mode === "existing") {
    field.closest("form").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
    assert.ok(await until(() => calls("cmp_vm", "send_message").length === 1));
    assert.equal(calls("cmp_mac", "work_status").length, 0);
    assert.equal(calls("cmp_mac", "work_export").length, 0);
    assert.equal(doc.querySelector("[data-carry-sheet]"), null);
    assert.deepEqual(app.failures, []);
    return;
  }

  assert.ok(await until(() => doc.querySelector('[data-carry-sheet="carry"]')), "no se abrió la hoja");
  assert.equal(calls("cmp_mac", "work_status").length, 1, "el estado no se pidió a la Mac");
  assert.ok(doc.querySelector("[data-carry-sealed]"), "no dice que viaja sellado");
  assert.equal(app.w.localStorage.getItem("harness.layout.machines.carry_keys"), JSON.stringify({ cmp_vm: "vm-key" }), "la llave no se fijó la primera vez");
  assert.equal(doc.querySelector('[data-carry-ignored=".env.local"]').checked, true, "sellado, el .env puede viajar");
  assert.ok(await until(() => doc.querySelector("[data-carry-confirm]")?.disabled === false));
  assert.equal(calls("cmp_mac", "work_export").at(-1).args.recipientKey, "vm-key", "el export no salió sellado");
  if (mode === "cancel") {
    [...doc.querySelectorAll("[role=dialog] button")].find(b => b.textContent.trim() === "Cancelar").click();
    assert.equal(doc.querySelector("textarea").value, "sigue en la VM");
    field.closest("form").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
    assert.ok(await until(() => calls("cmp_vm", "send_message").length === 1), "cancelar atrapó el envío en otra transferencia");
    assert.equal(doc.querySelector("[data-carry-sheet]"), null);
    assert.equal(calls("cmp_vm", "work_write_part").length, 0);
    assert.deepEqual(app.failures, []);
    return;
  }
  doc.querySelector("[data-carry-confirm]").click();

  assert.ok(await until(() => calls("cmp_vm", "send_message").length === 1), "la tarea no nació en la VM");
  assert.equal(calls("cmp_vm", "start_project_clone")[0]?.args.id, "pm", "no clonó con el mismo id");
  assert.deepEqual(calls("cmp_mac", "work_read_part").map((c) => c.args.size), [524288, 524288], "las partes no son de 512 KiB");
  assert.equal(calls("cmp_vm", "work_write_part").length, 2);
  const sent = calls("cmp_vm", "send_message")[0].args;
  assert.deepEqual([sent.baseRef, sent.unwrapSnapshot], ["w1", true]);
  assert.equal(calls("cmp_mac", "send_message").length, 0);
  assert.deepEqual(app.failures, []);
});
