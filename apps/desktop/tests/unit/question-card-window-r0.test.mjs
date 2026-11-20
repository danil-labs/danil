/**
 * R0 de la tarjeta de pregunta, con la ventana montada (`dist/`) y un `invoke`
 * falso: el mismo camino que recorre la persona (clic en la opción →
 * `pending_requests` → `answer_question` → `appendPersisted`), y luego los
 * eventos `chat` del agente que reanuda.
 *
 * Invariante (B1): tras el acuse, la tarjeta no vuelve con los repintados
 * siguientes. H2 registra el comportamiento actual de un fallo.
 * Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";


const PREGUNTA = { id: "q", question: "¿Qué base de datos?", header: null, options: [{ value: "pg", label: "Postgres" }, { value: "sqlite", label: "SQLite" }], multiple: false, free_text: false };
const RESPUESTA = { turn: "a1", question: "q", question_text: PREGUNTA.question, chosen: ["pg"], text: "Postgres", source: "persona", when: 2 };
const USER = { role: "user", id: "u1", at: 0, text: "Arma la app" };
const ASK = { role: "agent", id: "a1", at: 1, text: "", questions: [PREGUNTA] };
const ANSWER_TURN = { role: "user", id: "u2", at: 2, text: "Postgres", answers: [RESPUESTA] };
const row = (id) => ({ id, title: `Tarea ${id}`, last_message: "", provider: "claude", model: null, refs: [], updated_at: 0, turns: 2, parent: null, esperando: true });
const session = (id, turns) => ({ id, provider: "claude", sources: [], model: null, effort: null, permission_mode: null, turns });

function responses(overrides) {
  return {
    window_ready: null,
    window_vitals: null,
    setup_required: false,
    service_poll: { cursor: 0, gap: false, replay: false, runtime: "lab", reset: false },
    list_providers: [{ id: "claude", label: "Claude", available: true, driver: true }],
    list_workspaces: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
    workspaces_startup: { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" },
    list_projects: () => [{ id: "p1", name: "P1", working_directory: "/lab/p1", kind: "git", portfolio: null, sources: [] }],
    list_portfolios: [],
    list_sources: [],
    list_live_sessions: ({ project }) => (project === "" || project === "p1" ? [row("t1")] : []),
    list_agents: { agents: [], rechazados: [] },
    list_agent_status: [],
    list_mentions: { fuentes: [], archivos: [] },
    list_models: { provider: "claude", models: [], fallback: false },
    list_surfaces: [{ id: "claude", provider: "claude", label: "Claude", catalogo: "todo", usable: true, marca: null, porque: null }],
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
    pending_requests: { questions: [{ id: "r1", request_id: "r1", revision: 1, turn: "a1" }], permissions: [] },
    ...overrides,
  };
}

const card = (app) => app.w.document.querySelector('[data-interruption="question"]');
const text = (app) => app.w.document.body.textContent ?? "";
async function openTask(app, id) {
  const el = app.w.document.querySelector(`[data-sesion="${id}"]`);
  assert.ok(el, `no está la fila de ${id}`);
  el.click();
  await sleep(400);
}
async function choose(app, value) {
  const option = card(app)?.querySelector(`[data-option="${value}"]`);
  assert.ok(option, `no está la opción ${value} en la tarjeta`);
  option.click();
  await sleep(400);
}
/** Lo que pide la ventana tras arrancar, para saber si un evento provocó una lectura. */
const since = (app, from) => app.commands.slice(from).filter((c) => !c.startsWith("plugin:event|"));

test("control: la tarea con una pregunta sin contestar abre con la tarjeta", async () => {
  const app = await boot("listo", "question-card-open", responses({ load_session: ({ id }) => session(id, [USER, ASK]) }));
  await sleep(600);
  await openTask(app, "t1");
  assert.ok(card(app), "no se pintó la tarjeta de la pregunta");
});

test("control: con el acuse de answer_question la tarjeta se va", async () => {
  const answered = [];
  const app = await boot("listo", "question-card-ack", responses({
    load_session: ({ id }) => session(id, [USER, ASK]),
    answer_question: (args) => { answered.push(args); return ANSWER_TURN; },
  }));
  await sleep(600);
  await openTask(app, "t1");
  await choose(app, "pg");
  assert.equal(answered.length, 1, "no llamó a answer_question");
  assert.equal(answered[0].requestId, "r1");
  assert.equal(card(app), null, "la tarjeta sigue tras el acuse");
});

test("regresión (ventana): tras contestar con acuse, la tarjeta no reaparece con el siguiente segment_saved", async () => {
  // El disco ya trae la respuesta: si la ventana releyera, la tarjeta no volvería.
  let disk = [USER, ASK];
  const app = await boot("listo", "question-card-segment", responses({
    load_session: ({ id }) => session(id, disk),
    answer_question: () => { disk = [USER, ASK, ANSWER_TURN]; return ANSWER_TURN; },
  }));
  await sleep(600);
  await openTask(app, "t1");
  const beforeAnswer = app.commands.length;
  await choose(app, "pg");
  assert.equal(card(app), null, "precondición: el acuse quitó la tarjeta");
  if (process.env.R0_TRACE) console.log("tras contestar:", JSON.stringify(since(app, beforeAnswer)));
  const before = app.commands.length;
  // La pregunta viva de Claude no cierra el turno: tras la respuesta no llega `started`, solo lo que el agente escribe.
  app.emit("chat", { kind: "delta", session: "t1", workspace: "w", text: "Perfecto, uso Postgres." });
  await sleep(100);
  app.emit("chat", { kind: "segment_saved", session: "t1", workspace: "w", id: "a2", text: "" });
  await sleep(300);
  if (process.env.R0_TRACE) console.log("tras segment_saved:", JSON.stringify(since(app, before)));
  const reads = since(app, before).filter((c) => c === "load_session" || c === "load_history");
  assert.equal(card(app), null, `la tarjeta reapareció tras segment_saved (lecturas entre medias: ${JSON.stringify(reads)})`);
});

test("control (ventana): si un `started` relee antes del segment_saved y el disco ya trae la respuesta, la tarjeta no vuelve", async () => {
  let disk = [USER, ASK];
  const app = await boot("listo", "question-card-started", responses({
    load_session: ({ id }) => session(id, disk),
    answer_question: () => { disk = [USER, ASK, ANSWER_TURN]; return ANSWER_TURN; },
  }));
  await sleep(600);
  await openTask(app, "t1");
  await choose(app, "pg");
  const before = app.commands.length;
  app.emit("chat", { kind: "started", session: "t1", workspace: "w" });
  app.emit("chat", { kind: "delta", session: "t1", workspace: "w", text: "Perfecto, uso Postgres." });
  await sleep(100);
  app.emit("chat", { kind: "segment_saved", session: "t1", workspace: "w", id: "a2", text: "" });
  await sleep(300);
  assert.ok(since(app, before).includes("load_session"), "`started` no provocó una lectura");
  assert.equal(card(app), null, "la tarjeta volvió aunque la lectura traía la respuesta");
});

test("H2 (comportamiento actual): answer_question falla aunque el motor guardó la respuesta", async () => {
  let disk = [USER, ASK];
  const cancelled = [];
  // `Questions.tsx` llama `void responder(...)` y `App.tsx` relanza el error: el rechazo queda sin atender.
  const escaped = [];
  const onUnhandled = (reason) => escaped.push(reason);
  // node:test atribuye cualquier rechazo sin atender a la prueba: se le quita la escucha solo aquí.
  const runner = process.listeners("unhandledRejection");
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", onUnhandled);
  try {
    const app = await boot("listo", "question-card-h2", responses({
      load_session: ({ id }) => session(id, disk),
      // El motor persiste antes de entregar (`durable_pending.rs:206-286`) y devuelve Err si la entrega falla.
      answer_question: () => { disk = [USER, ASK, ANSWER_TURN]; return Promise.reject({ detail: "unknown" }); },
      // Omitir con la respuesta ya guardada devuelve ese mismo turno (`permissions.rs:1386-1392`).
      cancel_question: (args) => { cancelled.push(args); return ANSWER_TURN; },
    }));
    await sleep(600);
    await openTask(app, "t1");
    const before = text(app);
    await choose(app, "pg");
    const after = text(app);
    const added = after.startsWith(before.slice(0, 200)) ? after.replace(before, "«…»") : after.slice(-300);
    console.log("H2 tras el error:", JSON.stringify({ card: !!card(app), escaped, added }));
    assert.ok(card(app), "H2: con el error, la tarjeta sigue");
    assert.deepEqual(escaped, [{ detail: "unknown" }], "H2: el rechazo de answer_question sale sin atender");
    const skip = [...card(app).querySelectorAll("button")].find((b) => /omitir|skip/i.test(b.textContent ?? ""));
    assert.ok(skip, "no está «Omitir»");
    skip.click();
    await sleep(400);
    console.log("H2 tras Omitir:", JSON.stringify({ card: !!card(app), cancel_question: cancelled }));
    assert.equal(cancelled.length, 1, "Omitir no llamó a cancel_question");
    assert.equal(card(app), null, "H2: Omitir quita la tarjeta con el turno guardado");
  } finally {
    await sleep(0);
    process.off("unhandledRejection", onUnhandled);
    for (const listener of runner) process.on("unhandledRejection", listener);
  }
});
