/** Lo que comparten los guardas `mount-*`: las respuestas del IPC stubeado y los gestos que varios repiten. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { boot as mount, sleep } from "./jsdom-app.mjs";

export { mount };

/**
 * Lo que el arranque pregunta, contestado con lo mínimo creíble.
 *
 * No pretende ser el backend: es el **primer arranque de un workspace recién
 * creado**, que es el estado más pobre que la app tiene que aguantar —sin
 * proyectos, sin fuentes, sin sesiones—. La primera superficie no sirve y la
 * segunda sí: el arranque tiene que elegir la usable, no la primera fila.
 */
export const RESPONSES = {
  // La ventana ya tiene motor: el lanzador deja pasar a la app.
  launcher_state: { phase: "ready", blank_0274: false },
  // La medida de arranque: la manda `App` en cuanto monta, en todos los casos.
  window_ready: null,
  // Lo que crece en la ventana: se manda al montar y cada pocos minutos.
  window_vitals: null,
  // Si otra versión quedó instalada sobre la ventana: se mira cada minuto.
  update_pending: false,
  // La compuerta del primer pintado. `false` monta la app sin esperar nada.
  setup_required: false,
  list_providers: [
    { id: "claude", label: "Claude Code", available: true, driver: true },
    { id: "codex", label: "Codex", available: true, driver: true },
  ],
  list_workspaces: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
  machine_list: [{ id: "local", local: true, active: true, on: true, hosts: true }],
  workspaces_startup: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
  list_projects: [],
  list_sources: [],
  list_live_sessions: [],
  list_mentions: { fuentes: [], archivos: [] },
  list_models: {
    provider: "codex",
    models: [
      {
        id: "gpt-5.6", label: "GPT-5.6", gratis: null, efforts: [], default_effort: null,
        note: { clave: "chat.model.note.local_loaded", datos: { engine: "Ollama" } },
      },
    ],
    fallback: false,
  },
  // La primera coincide con el agente que trae el estado inicial, pero no se
  // puede usar. Codex sí: el selector y su modelo tienen que arrancar ahí.
  list_surfaces: [
    { id: "claude", provider: "claude", label: "Claude Code", catalogo: "todo", usable: false, marca: "sin conectar", porque: "Falta conectar la cuenta." },
    { id: "codex", provider: "codex", label: "Codex", catalogo: "todo", usable: true, marca: null, porque: null },
  ],
  send_message: "sesion-1",
  session_folder: "/tmp",
  list_task_trees: [],
  watch_task_tree: "watch-test",
  unwatch_task_tree: null,
  preview_file: {
    rel: "informe.md",
    kind: "text",
    text: "# Hola",
    data_url: null,
    bytes: 7,
    truncated: false,
  },
  artifact_history: { current: null, versions: [] },
  publications_of: [],
  list_live_turns: [],
  service_poll: { cursor: 0, gap: false, replay: false, runtime: "test-service", reset: false },
};

/**
 * **Un workspace con una tarea ya hecha**, que es el estado que hace falta para
 * ejercitar la columna derecha y la tira del centro: sin tarea abierta no hay
 * carpeta de trabajo, así que no hay nada que listar ni que abrir.
 *
 * Va aparte y no dentro de `RESPUESTAS` porque aquel describe el **primer**
 * arranque —sin proyectos, sin fuentes, sin sesiones— y es lo que hace que este
 * guarda pruebe el estado más pobre que la app tiene que aguantar.
 */
export const WITH_TASK = {
  ...RESPONSES,
  list_live_sessions: [
    {
      id: "s1",
      title: "Una tarea",
      last_message: "La última respuesta de esta tarea",
      provider: "codex",
      model: "gpt-5.6",
      refs: [],
      updated_at: 0,
      turns: 1,
      parent: null,
      esperando: false,
    },
  ],
  task_history: { history: { archived: false, events: [], recovery: null }, branch: null, path: "/lab", available: true, owned: false, restorable: false, incomplete: false },
  load_session: {
    id: "s1",
    provider: "codex",
    sources: [],
    model: "gpt-5.6",
    effort: null,
    permission_mode: null,
    // Un turno que entregó algo: la tarjeta de entrega del hilo es por donde
    // se abre un artefacto en la tira del centro (abajo).
    turns: [
      {
        role: "assistant",
        text: "Listo.",
        artifacts: [{ rel: "informe.md", bytes: 7, revision: false }],
      },
    ],
  },
  load_queue: [],
  session_usage: null,
};

export const NO_USABLE = {
  ...RESPONSES,
  list_models: { provider: "claude", models: [], fallback: false },
  list_surfaces: [RESPONSES.list_surfaces[0]],
};

export const boot = (environment, version, responses = RESPONSES, userAgent) =>
  mount(environment, version, responses, userAgent);

export const keepActiveView = (app) => {
  const header = app.w.document.querySelector('[data-preview-header] [role="button"]');
  header?.dispatchEvent(new app.w.MouseEvent("dblclick", { bubbles: true }));
};

/** El riel agrupado por carpeta, que es su vista por omisión: una carpeta tiene cabecera y se abre su vista. */
export const UNGROUPED = { "harness.layout.sidebar.view.w": JSON.stringify({ group: "none" }) };
export const bootByFolder = async (environment, version, responses = RESPONSES) => {
  const app = await mount(environment, version, responses);
  // La cabecera de carpeta llega en su propio trozo: se espera a que pinte.
  for (let i = 0; i < 80 && !app.w.document.querySelector("[data-folder-open]"); i++) await sleep(25);
  return app;
};

/** El buscador global, abierto desde la lupa de la franja y con `texto` escrito. */
export async function searchWindow(app, textValue) {
  const doc = app.w.document;
  if (!doc.querySelector("[data-global-search]")) doc.querySelector("[data-title-bar] [data-global-search-open]").click();
  await sleep(80);
  const inputField = doc.querySelector('[data-global-search] input[role="combobox"]');
  inputField.value = textValue;
  inputField.dispatchEvent(new app.w.Event("input", { bubbles: true }));
  await sleep(80);
  return inputField;
}

/** Abre una tarea desde el buscador global, el mismo gesto que su fila del riel. */
export async function openFromSearch(app, textValue, id) {
  await searchWindow(app, textValue);
  app.w.document.querySelector(`[data-global-search] [data-search-key="task:${id}"]`).click();
  await sleep(160);
}

/** Añadir un proyecto se abre desde el selector de la caja de una tarea nueva. */
export async function openAddProject(app) {
  const doc = app.w.document;
  doc.querySelector('button[aria-label="Nueva tarea"]').click();
  await sleep(50);
  doc.querySelector('button[aria-label="Proyecto"]').click();
  await sleep(50);
  [...doc.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Añadir un proyecto…")).click();
  await sleep(50);
}

/** Abre la vista de la carpeta desde su cabecera y empieza a hablar con uno de sus agentes. */
export async function talkFromFolder(app, folder, nameText) {
  const doc = app.w.document;
  for (let i = 0; i < 80 && !doc.querySelector(`[data-folder-group="${folder}"] [data-folder-open]`); i++) await sleep(25);
  doc.querySelector(`[data-folder-group="${folder}"] [data-folder-open]`).click();
  await sleep(120);
  const settings = [...doc.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent.trim() === "Configuración");
  settings.dispatchEvent(new app.w.MouseEvent("mousedown", { bubbles: true, button: 0 }));
  settings.click();
  await sleep(120);
  const agentEntry = [...doc.querySelectorAll("li > button")].find((b) => b.querySelector(".astro-face") && b.textContent.trim().startsWith(nameText));
  assert.ok(agentEntry, `la vista de la carpeta lista a ${nameText}`);
  agentEntry.click();
  await sleep(100);
}

/**
 * `CON_TAREA` después de la cola de `mount-task-composer`: dos turnos, carpeta
 * ocupada por otra tarea y cola lista. Es el estado que pisan los guardas que siguen.
 */
export const TASK_AFTER_QUEUE = {
  ...WITH_TASK,
  send_message: () => "s1",
  folder_holder: { project: "", session: "other-task", title: "Other task" },
  queue_ready: () => true,
  save_queue: null,
  load_session: {
    ...WITH_TASK.load_session,
    turns: [...WITH_TASK.load_session.turns, { role: "agent", id: "second", text: "Otra respuesta" }],
  },
  list_live_sessions: [{
    ...WITH_TASK.list_live_sessions[0],
    result_revision: createHash("sha256").update("1:second:Otra respuesta").digest("hex"),
  }],
};

export const task = (id, parent, outcome) => ({ id, parent, title: `Tarea ${id}`, outcome,
  provider: "codex", model: null, refs: [], stage: null, esperando: false, updated_at: 1, created_at: 1, turns: 1 });

export const gitRow = (branch, overrides = {}) => ({ kind: "branch", branch, head: "abc", shared_with: null,
  pull: null, pull_known: false, checked_at: null, stale: false, has_remote: true, merged_locally: false, ...overrides });
