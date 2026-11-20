/**
 * Por carpeta, una carpeta con tareas en esta máquina y en otra se parte en un
 * grupo por máquina: en disco son clones distintos. Cada grupo se pliega solo y
 * su «+» empieza la tarea en su máquina. El proxy (`features/machines/router.ts`) se simula con sus
 * respuestas. Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { sleep } from "../helpers/jsdom-app.mjs";
import { open } from "../helpers/desktop-account.mjs";
import { engine } from "../helpers/fake-relay.mjs";

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
  const machine = "lima:vm";
  const folder = { id: "p1", name: "P1", working_directory: "/lab/p1", kind: "folder", portfolio: null, sources: [] };
  const { app } = await open("sidebar-folder-machines", {
    status: { state: "disconnected" },
    extra: responses({
      list_live_sessions: ({ project }) => (project === "p1" || project === "" ? [row("t1")] : []),
      guest_channels: ["lima"],
      guest_children: [{ id: machine, channel: "lima", distro: "vm", name: "vm", user: "u", home: "/home/u", online: true, features: [], contract: null, version: "0.3.1" }],
      guest_events: () => sleep(40).then(() => ({ cursor: 1, events: [], gap: false })),
      guest_sync_spaces: null,
      guest_call: ({ machine: target, command, args }) => {
        if (command === "list_projects") return [folder];
        if (command === "list_live_sessions") return [row("r1")];
        if (command === "send_message") { sends.push({ args, machine: target }); return "nueva"; }
        const value = engine[command];
        return typeof value === "function" ? value(args ?? {}) : (value ?? null);
      },
    }),
  });
  await sleep(600);
  const doc = app.w.document;

  const aqui = header(doc, "p1", "");
  const vm = header(doc, "p1", machine);
  assert.ok(aqui && vm, "la carpeta en dos máquinas no se partió");
  assert.match(aqui.textContent ?? "", /^P1 · Esta (Mac|computadora)/);
  assert.match(vm.textContent ?? "", /^P1 · vm/);
  assert.ok(aqui.compareDocumentPosition(vm) & app.w.Node.DOCUMENT_POSITION_FOLLOWING, "la de esta máquina no va primero");

  // Plegar el de la VM no pliega el de esta máquina.
  vm.querySelector("button[aria-expanded]").click();
  await sleep(100);
  assert.equal(header(doc, "p1", machine).querySelector("button[aria-expanded]").getAttribute("aria-expanded"), "false");
  assert.equal(header(doc, "p1", "").querySelector("button[aria-expanded]").getAttribute("aria-expanded"), "true");
  assert.ok(doc.querySelector('[data-sesion="t1"]'), "se plegó también la tarea de esta máquina");

  header(doc, "p1", machine).querySelector('[aria-label^="Nueva tarea en"]').click();
  await sleep(300);
  const field = doc.querySelector("textarea");
  field.value = "hola";
  field.dispatchEvent(new app.w.Event("input", { bubbles: true }));
  field.closest("form").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(400);
  assert.equal(sends.length, 1, "no salió el primer turno");
  assert.equal(sends[0].args.project, "p1");
  assert.equal(sends[0].machine, machine, "la tarea no se lanzó en la máquina del grupo");
  assert.deepEqual(app.failures, []);
});
