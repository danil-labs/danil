/**
 * El razonamiento del agente no es su respuesta.
 *
 * Un `chat` con `kind: "reasoning"` se pinta en su bloque, aparte; un
 * kind que la ventana no conoce se ignora en vez de caer al texto del agente.
 * Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const turn = (n) => (n % 2 === 0
  ? { role: "user", id: `u${n}`, at: n, text: `Pregunta ${n}` }
  : { role: "agent", id: `a${n}`, at: n, text: `Respuesta ${n}` });
const turns = (from, to) => Array.from({ length: to - from }, (_, i) => turn(from + i));
const row = (id) => ({ id, title: `Tarea ${id}`, last_message: "", provider: "codex", model: "gpt-5.6", refs: [], updated_at: 0, turns: 4, parent: null, esperando: false });
const session = (id, list) => ({ id, provider: "codex", sources: [], model: "gpt-5.6", effort: null, permission_mode: null, turns: list });

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
    list_live_sessions: ({ project }) => (project === "" || project === "p1" ? ["t1", "t2"].map(row) : []),
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
/** Los pliegues de razonamiento, en el orden del hilo. */
const razonamientos = (app) => [...app.w.document.querySelectorAll("button[aria-expanded]")]
  .filter((b) => /^(Pensando|Razonamiento)/.test((b.textContent ?? "").trim()));
/** El de la fila de trabajo, que es el que guarda lo hecho antes de responder. */
async function openWork(app) {
  const fila = [...app.w.document.querySelectorAll("button[aria-expanded]")]
    .find((b) => /Trabaj/.test(b.textContent ?? ""));
  assert.ok(fila, "no hay fila de trabajo que abrir");
  fila.click();
  await sleep(150);
}

test("el razonamiento no se pega a la respuesta y un kind desconocido se ignora", async () => {
  const app = await boot("listo", "reasoning-stream", responses({
    service_poll: () => ({ cursor: 0, gap: false, replay: false, runtime: "lab", reset: false }),
    load_session: ({ id }) => session(id, turns(0, 4)),
  }));
  await sleep(600);
  await openTask(app, "t1");
  app.emit("chat", { kind: "started", session: "t1", workspace: "w" });
  app.emit("chat", { kind: "reasoning", session: "t1", workspace: "w", text: "pienso el problema" });
  app.emit("chat", { kind: "delta", session: "t1", workspace: "w", text: "La respuesta." });
  app.emit("chat", { kind: "misterio", session: "t1", workspace: "w", text: "no debería verse" });
  await sleep(300);

  assert.ok(text(app).includes("La respuesta."), "la respuesta no llegó al hilo");
  assert.ok(!text(app).includes("no debería verse"), "un kind desconocido llegó al hilo");
  assert.ok(text(app).includes("pienso el problema"), "el razonamiento vivo no está desplegado");

  const boton = [...app.w.document.querySelectorAll("button[aria-expanded]")]
    .find((b) => /Pensando|Razonamiento/.test(b.textContent ?? ""));
  assert.ok(boton, "no hay bloque de razonamiento");
  const panel = app.w.document.getElementById(boton.getAttribute("aria-controls"));
  assert.ok(panel?.textContent.includes("pienso el problema"));
  assert.ok(!panel.textContent.includes("La respuesta."), "la respuesta quedó dentro del razonamiento");
  assert.equal(boton.getAttribute("aria-expanded"), "true");
  boton.click();
  await sleep(100);
  assert.equal(boton.getAttribute("aria-expanded"), "false");
  assert.ok(!text(app).includes("pienso el problema"), "plegar no oculta el razonamiento");
  assert.deepEqual(app.failures, []);
});

/** Un turno guardado con su orden: texto, herramienta, texto, con una ráfaga antes de cada texto. */
const conRazonamiento = {
  role: "agent",
  id: "a2",
  at: 2,
  text: "Voy a leer el archivo.\n\nYa lo leí.",
  tools: [{ name: "Read", target: "/lab/a.ts", ok: true }],
  pieces: [{ text: "Voy a leer el archivo." }, { tool: 0 }, { text: "Ya lo leí." }],
  reasoning: [
    { text: "Primero miro qué hay en el archivo.", before_piece: 0 },
    { text: "Ya sé qué hace.", before_piece: 2 },
  ],
  duration_ms: 1200,
};

test("una ráfaga antes de una herramienta conserva su fila dentro del pliegue", async () => {
  const app = await boot("listo", "reasoning-fold", responses({
    service_poll: () => ({ cursor: 0, gap: false, replay: false, runtime: "lab", reset: false }),
    load_session: ({ id }) => session(id, [{ role: "user", id: "u1", at: 1, text: "Pregunta" }, conRazonamiento]),
  }));
  await sleep(600);
  await openTask(app, "t1");

  // La última ráfaga va con la respuesta; la primera queda dentro del pliegue.
  assert.equal(razonamientos(app).length, 1, "la ráfaga del cierre no tiene su fila");
  assert.ok(!text(app).includes("Primero miro"), "el razonamiento se pinta como prosa suelta");

  await openWork(app);
  const filas = razonamientos(app);
  assert.equal(filas.length, 2, "la ráfaga anterior a la herramienta se quedó sin fila");
  const dentro = filas[0];
  assert.equal(dentro.getAttribute("aria-expanded"), "false");
  assert.ok(!text(app).includes("Primero miro"), "la ráfaga del pliegue nace desplegada");
  dentro.click();
  await sleep(100);
  assert.equal(dentro.getAttribute("aria-expanded"), "true");
  assert.ok(text(app).includes("Primero miro qué hay en el archivo."), "abrir no muestra la ráfaga");
  // Una sola vez: ni duplicada ni fundida con la respuesta.
  assert.equal((text(app).match(/Primero miro/g) ?? []).length, 1);
  assert.deepEqual(app.failures, []);
});

test("el bloque vive desde el primer fragmento y sobrevive al cierre sin duplicarse", async () => {
  let guardado = false;
  const cierre = {
    role: "agent",
    id: "a2",
    at: 2,
    text: "La respuesta.",
    pieces: [{ text: "La respuesta." }],
    reasoning: [{ text: "pienso el problema", before_piece: 0 }],
    duration_ms: 900,
  };
  const app = await boot("listo", "reasoning-live", responses({
    service_poll: () => ({ cursor: 0, gap: false, replay: false, runtime: "lab", reset: false }),
    load_session: ({ id }) => session(id, guardado
      ? [{ role: "user", id: "u1", at: 1, text: "Pregunta" }, cierre]
      : [{ role: "user", id: "u1", at: 1, text: "Pregunta" }]),
  }));
  await sleep(600);
  await openTask(app, "t1");
  app.emit("chat", { kind: "started", session: "t1", workspace: "w" });
  app.emit("chat", { kind: "reasoning", session: "t1", workspace: "w", text: "pienso el problema" });
  await sleep(200);

  const vivo = razonamientos(app);
  assert.equal(vivo.length, 1, "el bloque no existe con el primer fragmento");
  assert.equal(vivo[0].textContent.trim(), "Pensando…", "el resumen vivo no dice «Pensando…»");
  assert.equal(vivo[0].getAttribute("aria-expanded"), "true");
  assert.ok(text(app).includes("pienso el problema"), "el bloque vivo no muestra su texto");

  app.emit("chat", { kind: "delta", session: "t1", workspace: "w", text: "La respuesta." });
  guardado = true;
  app.emit("chat", { kind: "done", session: "t1", workspace: "w", ok: true });
  await sleep(900);

  const cerrado = razonamientos(app);
  assert.equal(cerrado.length, 1, "al cerrar salieron dos filas para la misma ráfaga");
  assert.equal(cerrado[0].textContent.trim(), "Razonamiento", "al cerrar no cambió el resumen");
  assert.equal(cerrado[0].getAttribute("aria-expanded"), "false", "al terminar no se plegó");
  cerrado[0].click();
  await sleep(100);
  assert.equal((text(app).match(/pienso el problema/g) ?? []).length, 1, "la ráfaga se duplicó");
  assert.ok(text(app).includes("La respuesta."), "la respuesta no sobrevivió al cierre");
  assert.deepEqual(app.failures, []);
});

test("un turno guardado sin razonamiento se pinta como siempre", async () => {
  const viejo = {
    role: "agent",
    id: "a2",
    at: 2,
    text: "Voy a leer el archivo.\n\nYa lo leí.",
    tools: [{ name: "Read", target: "/lab/a.ts", ok: true }],
    pieces: [{ text: "Voy a leer el archivo." }, { tool: 0 }, { text: "Ya lo leí." }],
    duration_ms: 1200,
  };
  const app = await boot("listo", "reasoning-old", responses({
    service_poll: () => ({ cursor: 0, gap: false, replay: false, runtime: "lab", reset: false }),
    load_session: ({ id }) => session(id, [{ role: "user", id: "u1", at: 1, text: "Pregunta" }, viejo]),
  }));
  await sleep(600);
  await openTask(app, "t1");
  assert.equal(razonamientos(app).length, 0, "un turno sin razonamiento trajo una fila");
  assert.ok(text(app).includes("Ya lo leí."), "la respuesta no se pintó");
  await openWork(app);
  assert.equal(razonamientos(app).length, 0, "el pliegue inventó una fila de razonamiento");
  assert.ok(text(app).includes("Voy a leer el archivo."), "el avance del turno no se pinta");
  assert.deepEqual(app.failures, []);
});
