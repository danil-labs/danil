/**
 * Por carpeta, una carpeta con tareas en esta máquina y en otra se parte en un
 * grupo por máquina: en disco son clones distintos. Cada grupo se pliega solo y
 * su «+» empieza la tarea en su máquina. El proxy (`features/machines/router.ts`) se simula con sus
 * respuestas. Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const row = (id, extra) => ({ id, title: `Tarea ${id}`, last_message: "", provider: "codex", model: "gpt-5.6", refs: [], created_at: 0, updated_at: 0, turns: 2, parent: null, esperando: false, ...extra });

function responses(overrides) {
  return {
    window_ready: null,
    window_vitals: null,
    setup_required: false,
    list_providers: [{ id: "codex", label: "Codex", available: true, driver: true }],
    list_workspaces: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
    workspaces_startup: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
    list_projects: () => [
      { id: "p1", name: "P1", working_directory: "/lab/p1", kind: "folder", portfolio: null, sources: [] },
    ],
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
      { id: "vm", local: false, active: false, on: true, hosts: true },
    ],
    ...overrides,
  };
}

const header = (doc, folder, machine) =>
  doc.querySelector(machine === undefined
    ? `[data-folder-group="${folder}"]:not([data-folder-machine])`
    : `[data-folder-group="${folder}"][data-folder-machine="${machine}"]`);

test("una carpeta en dos máquinas son dos grupos, y el «+» del de la VM empieza la tarea en la VM", async () => {
  const sends = [];
  const app = await boot("listo", "sidebar-folder-machines", responses({
    list_live_sessions: ({ project }) => (project === "p1"
      ? [row("r1", { machine: "vm", machine_on: true }), row("t1")]
      : []),
    send_message: (args, options) => {
      sends.push({ args, machine: options?.headers?.["x-terminus-machine"] ?? null });
      return "nueva";
    },
  }));
  await sleep(600);
  const doc = app.w.document;

  const aqui = header(doc, "p1", "");
  const vm = header(doc, "p1", "vm");
  assert.ok(aqui && vm, "la carpeta en dos máquinas no se partió");
  assert.match(aqui.textContent ?? "", /^P1 · Esta (Mac|computadora)/);
  assert.match(vm.textContent ?? "", /^P1 · vm/);
  assert.ok(aqui.compareDocumentPosition(vm) & app.w.Node.DOCUMENT_POSITION_FOLLOWING, "la de esta máquina no va primero");

  // Plegar el de la VM no pliega el de esta máquina.
  vm.querySelector("button[aria-expanded]").click();
  await sleep(100);
  assert.equal(header(doc, "p1", "vm").querySelector("button[aria-expanded]").getAttribute("aria-expanded"), "false");
  assert.equal(header(doc, "p1", "").querySelector("button[aria-expanded]").getAttribute("aria-expanded"), "true");
  assert.ok(doc.querySelector('[data-sesion="t1"]'), "se plegó también la tarea de esta máquina");

  header(doc, "p1", "vm").querySelector('[aria-label^="Nueva tarea en"]').click();
  await sleep(300);
  const field = doc.querySelector("textarea");
  field.value = "hola";
  field.dispatchEvent(new app.w.Event("input", { bubbles: true }));
  field.closest("form").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(400);
  assert.equal(sends.length, 1, "no salió el primer turno");
  assert.equal(sends[0].args.project, "p1");
  assert.equal(sends[0].machine, "vm", "la tarea no se lanzó en la máquina del grupo");
  assert.deepEqual(app.failures, []);
});
