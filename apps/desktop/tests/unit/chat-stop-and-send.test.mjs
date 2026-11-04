/**
 * «Detener y enviar»: el gesto que la persona hace a mano cuando el agente no
 * recibe mensajes a mitad del turno —parar y mandar lo encolado—, en un clic y
 * sin perder el texto. El turno se corta de verdad: solo se ofrece cuando el
 * motor ya negó el steer, y el mensaje sale solo al cerrar. Si la interrupción
 * retuviera la cola, el gesto quedaría a medias.
 *
 * Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const TEXTO = "mejor detente y hazlo así";
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

const porTitulo = (app, titulo) => app.w.document.querySelector(`button[title="${titulo}"]`);

async function encolar(app) {
  const campo = app.w.document.querySelector("textarea");
  assert.ok(campo, "no está la caja de escribir");
  campo.value = TEXTO;
  campo.dispatchEvent(new app.w.Event("input", { bubbles: true }));
  await sleep(50);
  campo.dispatchEvent(new app.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await sleep(150);
}

test("«detener y enviar» corta el turno y deja salir lo encolado, sin perderlo", async () => {
  const intentos = [];
  const enviados = [];
  let vivos = ["t1"];
  let paradas = 0;
  const app = await boot("listo", "chat-stop-and-send", responses({
    // El agente rechaza el steer, como OpenCode 2.x sobre ACP.
    inject_message: (args) => {
      intentos.push(args);
      return Promise.reject("executor_acceptance_unknown");
    },
    list_active_turns: () => vivos,
    stop_turn: () => {
      paradas += 1;
      return null;
    },
    send_message: (args) => {
      enviados.push(args);
      return "nuevo-turno";
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
    const mandar = porTitulo(app, "Mandar ahora");
    assert.ok(mandar, "sin flecha de «Mandar ahora» antes de intentarlo");

    // Primer gesto: el motor dice que no. Ahí se aprende y aparece el otro.
    mandar.click();
    await sleep(400);
    const detenerYEnviar = porTitulo(app, "Detener el turno y enviar");
    assert.ok(detenerYEnviar, "no se ofreció «detener y enviar» tras el rechazo");

    detenerYEnviar.click();
    await sleep(300);
    assert.equal(paradas, 1, "no se detuvo el turno");

    // El turno cortado cierra como interrumpido: `ok: false`.
    vivos = [];
    app.emit("chat", { kind: "done", session: "t1", workspace: "w", ok: false });
    await sleep(800);

    assert.equal(enviados.length, 1, "lo encolado no salió al cerrar el turno");
    assert.equal(enviados[0].prompt, TEXTO, "salió otro texto");
    assert.equal(enviados[0].session, "t1", "salió a otra tarea");
    assert.equal(intentos.length, 1, "se intentó meter en el turno además de detenerlo");
    assert.ok(!app.w.document.body.textContent.includes("en cola"), "el mensaje se quedó en la cola");
  } finally {
    app.w.close();
  }
});
