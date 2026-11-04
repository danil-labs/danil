/**
 * El árbol de archivos de una tarea que corre en otra máquina se lee en esa
 * máquina: la carpeta, su kn y lo que el agente creó. Sin la cabecera
 * `x-terminus-machine` el router manda la orden al motor de la ventana, que no
 * tiene la tarea (`features/machines/router.ts`). Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const row = (id, extra) => ({ id, title: `Tarea ${id}`, last_message: "", provider: "codex", model: "gpt-5.6", refs: [], created_at: 0, updated_at: 0, turns: 2, parent: null, esperando: false, ...extra });
const turns = [{ role: "user", id: "u0", at: 0, text: "crea un md hablando de danil" }, { role: "agent", id: "a1", at: 1, text: "Creé DANIL.md." }];

function responses(there) {
  return {
    window_ready: null,
    window_vitals: null,
    setup_required: false,
    list_providers: [{ id: "codex", label: "Codex", available: true, driver: true }],
    list_workspaces: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
    workspaces_startup: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
    list_projects: () => [{ id: "p1", name: "prueba", working_directory: "/home/alberto/code/prueba", kind: "folder", portfolio: null, sources: [] }],
    list_portfolios: [],
    list_sources: [],
    list_agents: { agents: [], rechazados: [] },
    list_agent_status: [],
    list_mentions: { fuentes: [], archivos: [] },
    list_models: { provider: "codex", models: [{ id: "gpt-5.6", label: "GPT-5.6", gratis: null, note: null, efforts: [], default_effort: null }], fallback: false },
    list_surfaces: [{ id: "codex", provider: "codex", label: "Codex", catalogo: "todo", usable: true, marca: null, porque: null }],
    session_folder: "/tmp",
    task_history: { history: { archived: false, events: [], recovery: null }, branch: null, path: "/home/alberto/.kn/sessions/x/oenone-261023", available: true, owned: false, restorable: false, recreatable: false, incomplete: false },
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
    list_live_sessions: ({ project }) => (project === "p1" ? [row("r1", { machine: "vm", machine_on: true })] : []),
    load_session: ({ id }) => ({ id, provider: "codex", sources: [], model: "gpt-5.6", effort: null, permission_mode: null, turns }),
    list_task_trees: there("list_task_trees", [{
      cloud: null, key: ".proyecto", name: "prueba", path: "/home/alberto/.kn/sessions/x/oenone-261023", origin: "externa",
      kind: "kn", source: null, remote: null, branch: "", alias: "oenone-261023", missing: false, dirty_before: null, changed: 0,
      base_drift: { status: "current", behind: null, recent_subjects: [] },
    }]),
    tree_files: there("tree_files", { paths: ["DANIL.md"], folders: [], truncated: false }),
    tree_folder: there("tree_folder", { paths: ["DANIL.md"], folders: [], next: null, total: 1 }),
    kn_status: there("kn_status", []),
    kn_cloud_state: there("kn_cloud_state", null),
    kn_pending: there("kn_pending", { files: [], folder_updated: false }),
  };
}

test("el árbol de una tarea de otra máquina se pide a esa máquina y enseña lo que creó el agente", async () => {
  const asked = [];
  // El motor de la ventana no tiene la tarea: solo contesta la máquina donde corre.
  const there = (command, value) => (args, options) => {
    const machine = options?.headers?.["x-terminus-machine"] ?? null;
    asked.push({ command, machine });
    if (machine !== "vm") throw { what: { clave: "development.error.task_folder_open" }, detail: "not_found" };
    return value;
  };
  const values = responses(there);
  let external = 0;
  values.open_external = () => { external++; return null; };
  const app = await boot("listo", "machine-task-tree", values, undefined, { "harness.layout.shell.right.open": "false" });
  await sleep(600);
  const doc = app.w.document;
  const fila = doc.querySelector('[data-sesion="r1"]');
  assert.ok(fila, "no está la fila de la tarea de la VM");
  fila.click();
  await sleep(800);

  const files = doc.querySelector("[data-task-location-project]")?.closest("button");
  assert.ok(files, "la carpeta de la tarea debe abrir archivos dentro de Terminus");
  assert.match(files.getAttribute("aria-label"), /vm/i);
  files.click();
  await sleep(800);

  for (const command of ["list_task_trees", "tree_files", "kn_status"]) {
    const calls = asked.filter((c) => c.command === command);
    assert.ok(calls.length > 0, `no pidió ${command}`);
    assert.deepEqual(calls.map((c) => c.machine), calls.map(() => "vm"), `${command} fue al motor de la ventana`);
  }
  assert.ok(doc.querySelector('[data-ruta="DANIL.md"]'), "el árbol no enseña el archivo que creó el agente");
  assert.equal(external, 0, "la ruta remota no debe abrirse en el explorador local");
});
