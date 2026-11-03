/**
 * Un agente que no recibe mensajes a mitad del turno —OpenCode 2.x contesta
 * «Session already has an active ACP prompt»— deja el mensaje en la cola y se
 * explica una vez. Lo que no puede pasar es lo que pasaba: la clave interna del
 * ejecutor (`executor_acceptance_unknown`) pintada en el hilo con un
 * «Reintentar» que repetía el mismo rechazo, y una flecha que seguía
 * ofreciendo un gesto que el motor ya negó.
 *
 * Monta `dist/`, como el resto de las pruebas del chat.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const TEXTO = "pero qué ibas a hacer";
const AGENTE = "opencode";
const row = (id) => ({ id, title: `Tarea ${id}`, last_message: "", provider: AGENTE, model: "deepseek", refs: [], updated_at: 0, turns: 1, parent: null, esperando: false });
const session = (id) => ({ id, provider: AGENTE, sources: [], model: "deepseek", effort: null, permission_mode: null, turns: [{ role: "user", id: "u0", at: 0, text: "hola" }] });

function responses(overrides) {
  return {
    window_ready: null,
    window_vitals: null,
    setup_required: false,
    service_poll: { cursor: 0, gap: false, replay: false, runtime: "lab", reset: false },
    list_providers: [{ id: AGENTE, label: "OpenCode", available: true, driver: true }],
    list_workspaces: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
    workspaces_startup: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
    list_projects: () => [{ id: "p1", name: "P1", working_directory: "/lab/p1", kind: "git", portfolio: null, sources: [] }],
    list_portfolios: [],
    list_sources: [],
    list_live_sessions: ({ project }) => (project === "" || project === "p1" ? [row("t1")] : []),
    list_agents: { agents: [], rechazados: [] },
    list_agent_status: [],
    list_mentions: { fuentes: [], archivos: [] },
    list_models: { provider: AGENTE, models: [{ id: "deepseek", label: "DeepSeek", gratis: null, note: null, efforts: [], default_effort: null }], fallback: false },
    list_surfaces: [{ id: AGENTE, provider: AGENTE, label: "OpenCode", catalogo: "todo", usable: true, marca: null, porque: null }],
    session_folder: "/tmp",
    list_task_trees: [],
    watch_task_tree: "watch",
    unwatch_task_tree: null,
    task_history: { history: { archived: false, events: [], recovery: null }, branch: null, path: "/lab", available: true, owned: false, restorable: false, recreatable: false, incomplete: false },
    list_live_turns: [],
    list_active_turns: [],
    load_queue: [],
    save_queue: null,
    queue_ready: true,
    session_usage: null,
    list_session_git: {},
    load_session: ({ id }) => session(id),
    ...overrides,
  };
}

/** Encola un mensaje con el turno vivo y devuelve la caja. */
async function encolar(app) {
  const campo = app.w.document.querySelector("textarea");
  assert.ok(campo, "no está la caja de escribir");
  campo.value = TEXTO;
  campo.dispatchEvent(new app.w.Event("input", { bubbles: true }));
  await sleep(50);
  campo.dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await sleep(150);
}

const flecha = (app) => app.w.document.querySelector('button[title="Mandar ahora"]');
const texto = (app) => app.w.document.body.textContent;

for (const [caso, codigo, aviso] of [
  ["no admite mensajes a medias", "chat.steer.unsupported", /no recibe mensajes a mitad del turno/],
  ["la entrega quedó sin confirmar", "executor_acceptance_unknown", /No se pudo confirmar la entrega del mensaje/],
]) {
  test(`«mandar ahora» contra un agente que lo rechaza: ${caso}`, async () => {
    const intentos = [];
    const app = await boot("listo", `chat-steer-refused-${codigo}`, responses({
      inject_message: (args) => {
        intentos.push(args);
        return Promise.reject(codigo);
      },
    }));
    try {
      await sleep(600);
      const fila = app.w.document.querySelector('[data-sesion="t1"]');
      assert.ok(fila, "no está la fila de t1");
      fila.click();
      await sleep(400);
      app.emit("chat", { kind: "started", session: "t1", workspace: "w" });
      await sleep(200);

      await encolar(app);
      assert.ok(flecha(app), "sin flecha de «Mandar ahora» antes de intentarlo");

      flecha(app).click();
      await sleep(400);

      assert.equal(intentos.length, 1, "se intentó meter más de una vez");
      assert.match(texto(app), aviso, "no se explicó qué pasó con el mensaje");
      assert.ok(texto(app).includes(TEXTO), "el mensaje salió de la cola sin haber entrado");
      assert.equal(flecha(app), null, "la flecha sigue ofreciendo un gesto que el motor negó");
      assert.doesNotMatch(texto(app), /Reintentar/, "un rechazo del steer no es un fallo que reintentar");
      assert.doesNotMatch(texto(app), /executor_acceptance_unknown/, "la clave interna llegó al hilo");
    } finally {
      app.w.close();
    }
  });
}
