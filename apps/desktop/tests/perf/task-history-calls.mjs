#!/usr/bin/env node
/**
 * Cuántas veces pide la ventana `task_history`, `list_live_sessions` y `list_agents`: al arrancar,
 * ante los avisos del CLI con la ventana quieta y mientras un turno largo transmite.
 *
 *   node tests/perf/task-history-calls.mjs              guarda: compara con task-history-calls-baseline.json
 *   node tests/perf/task-history-calls.mjs --update    baja el techo a lo que cuesta hoy
 *
 * Cada `task_history` corre git en el servicio y su respuesta cruza a la vista: en la Mac de la
 * persona llegaron a 30–40 por segundo con varias pestañas abiertas. Un techo solo baja.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const BASELINE = join(import.meta.dirname, "task-history-calls-baseline.json");
const ADJUST = process.argv.includes("--update");
const DELTAS = 400;

const TASKS = Array.from({ length: 10 }, (_, n) => `t${n}`);
// Carpetas en el riel, una dentro de un portafolio: el riel las pinta con `For`, que reconcilia por referencia.
const FOLDERS = ["p1", "p2"];
const PER_FOLDER = 8;
const MUTATIONS = 10;
// Una tarea cuyo árbol no se puede leer: su `task_history` falla siempre.
const BROKEN = "t9";
const TABS = TASKS.slice(0, 6);
// Lo que mueve `updated_at` en el servicio: guardar un turno (`sessions::push_turn`).
const saved = new Map();
const row = (id) => ({
  id, title: `Tarea ${id}`, last_message: "", provider: "codex", model: "gpt-5.6", refs: [],
  updated_at: saved.get(id) ?? 0, turns: 4, parent: null, esperando: false,
});
const folderRows = (folder) => Array.from({ length: PER_FOLDER }, (_, n) => row(`${folder}t${n}`));
const folder = (id, n) => ({ id, name: id.toUpperCase(), working_directory: `/lab/${id}`, kind: "git", portfolio: n === 0 ? "g" : null, sources: [] });
// Por IPC cada respuesta llega con objetos nuevos; un stub que devuelve los mismos esconde el remontaje.
const fresh = (value) => structuredClone(value);
const history = (id) => [
  { role: "user", id: `${id}u`, at: 0, text: `Pregunta de ${id}` },
  { role: "agent", id: `${id}a`, at: 1, text: `Respuesta de ${id}.` },
];

const active = new Set();
const work = { history: { archived: false, events: [], recovery: null }, branch: null, path: "/lab", available: true, owned: false, restorable: false, recreatable: false, incomplete: false };
const responses = {
  window_ready: null,
  window_vitals: null,
  setup_required: false,
  list_providers: [{ id: "codex", label: "Codex", available: true, driver: true }],
  list_workspaces: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
  workspaces_startup: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
  list_projects: () => fresh(FOLDERS.map(folder)),
  list_portfolios: () => fresh([{ id: "g", name: "G", created_at: 0, updated_at: 0 }]),
  list_sources: [],
  list_live_sessions: ({ project }) => fresh(project === "" ? TASKS.map(row) : FOLDERS.includes(project) ? folderRows(project) : []),
  list_agents: () => fresh({ agents: [], rechazados: [] }),
  list_agent_status: [],
  list_mentions: { fuentes: [], archivos: [] },
  list_models: {
    provider: "codex",
    models: [{ id: "gpt-5.6", label: "GPT-5.6", gratis: null, note: null, efforts: [], default_effort: null }],
    fallback: false,
  },
  list_surfaces: [{ id: "codex", provider: "codex", label: "Codex", catalogo: "todo", usable: true, marca: null, porque: null }],
  session_folder: "/tmp",
  list_task_trees: [],
  watch_task_tree: "watch",
  unwatch_task_tree: null,
  list_live_turns: () => [...active].map((session) => ({ session, workspace: "w", started_at: 0, background: false })),
  list_active_turns: () => [...active],
  service_poll: { cursor: 0, gap: false, replay: false, runtime: "bench", reset: false },
  // Lo que tarda git en el servicio: una respuesta que llega después del siguiente delta.
  task_history: ({ id }) => sleep(40).then(() => (id === BROKEN ? Promise.reject(new Error("sin árbol")) : work)),
  load_session: ({ id }) => ({ id, provider: "codex", sources: [], model: "gpt-5.6", effort: null, permission_mode: null, turns: history(id) }),
  load_queue: [],
  save_queue: null,
  session_usage: null,
  list_session_git: {},
  send_message: (a) => a.session,
  inject_message: null,
};

const app = await boot("listo", "task-history-calls", responses);
const doc = app.w.document;
const count = (cmd) => app.commands.filter((c) => c === cmd).length;
const chat = (session, kind, extra = {}) => {
  if (kind === "started" || kind === "done") saved.set(session, (saved.get(session) ?? 0) + 1);
  app.emit("chat", { kind, session, workspace: "w", ...extra });
};

await sleep(1500);
const startup = { task_history: count("task_history"), list_live_sessions: count("list_live_sessions") };
// La vista de agentes del riel pide la lista de encargados de cada carpeta una vez.
doc.querySelector('div[role=group] button[aria-pressed="false"]')?.click();
await sleep(500);
const quiet = { task_history: count("task_history"), list_live_sessions: count("list_live_sessions"), list_agents: count("list_agents") };
// Lo que emite el servicio por cada mutación del CLI (`cli::server::notify`), con la ventana quieta.
for (let n = 0; n < MUTATIONS; n++) {
  app.emit("session", { instance: "cli", workspace: "w", project: FOLDERS[0], session: `${FOLDERS[0]}t0`, seq: n, when: n });
  app.emit("cli-changed", { workspace: "w", folder: FOLDERS[0], command: "task.send" });
  await sleep(300);
}
await sleep(500);
const idle = {
  task_history: count("task_history") - quiet.task_history,
  list_live_sessions: count("list_live_sessions") - quiet.list_live_sessions,
  list_agents: count("list_agents") - quiet.list_agents,
};

for (const id of TABS) {
  const el = doc.querySelector(`[data-sesion="${id}"]`);
  if (!el) throw new Error(`No está la fila de ${id}.`);
  el.click();
  await sleep(150);
  doc.querySelector('[data-preview-header] [role="button"]')
    ?.dispatchEvent(new app.w.MouseEvent("dblclick", { bubbles: true }));

}
await sleep(500);

const before = { task_history: count("task_history"), list_live_sessions: count("list_live_sessions") };
// Un turno largo en la abierta y otro de fondo; a mitad, otra tarea cierra el suyo y mueve su `updated_at`.
const shown = TABS.at(-1);
const hidden = TABS[1];
for (const id of [shown, hidden]) {
  active.add(id);
  chat(id, "started");
}
await sleep(200);
for (let n = 0; n < DELTAS; n++) {
  chat(n % 3 === 0 ? hidden : shown, "delta", { text: `palabra ${n} ` });
  if (n === DELTAS / 2) {
    chat(TASKS[0], "started");
    chat(TASKS[0], "done", { ok: true });
  }
  if (n % 4 === 0) await sleep(10);
}
for (const id of [shown, hidden]) {
  active.delete(id);
  chat(id, "done", { ok: true });
}
await sleep(1500);

if (app.failures.length > 0) {
  console.error(app.failures.slice(0, 3).map((f) => String(f).split("\n").slice(0, 4).join("\n  ")).join("\n"));
  process.exit(1);
}
const measured = {
  "startup.task_history": startup.task_history,
  "startup.list_live_sessions": startup.list_live_sessions,
  "cli.task_history": idle.task_history,
  "cli.list_live_sessions": idle.list_live_sessions,
  "cli.list_agents": idle.list_agents,
  task_history: count("task_history") - before.task_history,
  list_live_sessions: count("list_live_sessions") - before.list_live_sessions,
};
console.log(`${TASKS.length + FOLDERS.length * PER_FOLDER} tareas, ${TABS.length} pestañas, ${MUTATIONS} mutaciones del CLI, ${DELTAS} deltas: ${JSON.stringify(measured)}`);

const ceiling = JSON.parse(readFileSync(BASELINE, "utf8"));
if (ADJUST) {
  const lowered = Object.fromEntries(Object.keys(measured).map((k) => [k, Math.min(ceiling[k] ?? Infinity, measured[k])]));
  writeFileSync(BASELINE, `${JSON.stringify(lowered, null, 2)}\n`);
  console.log(`techo: ${JSON.stringify(lowered)}`);
  process.exit(0);
}
const over = Object.keys(measured).filter((k) => measured[k] > (ceiling[k] ?? 0));
if (over.length > 0) {
  console.error("La ventana pide más que el techo de task-history-calls-baseline.json:");
  for (const k of over) console.error(`  ${k}: ${measured[k]} > ${ceiling[k] ?? 0}`);
  process.exit(1);
}
process.exit(0);
