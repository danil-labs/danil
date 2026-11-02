/**
 * El razonamiento del agente no es su respuesta.
 *
 * Un `chat` con `kind: "reasoning"` se pinta en su bloque, plegado y aparte; un
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
  assert.ok(!text(app).includes("pienso el problemaLa respuesta."), "el razonamiento se pegó a la respuesta");
  assert.ok(!text(app).includes("no debería verse"), "un kind desconocido llegó al hilo");
  assert.ok(!text(app).includes("pienso el problema"), "el razonamiento nace desplegado");

  const boton = [...app.w.document.querySelectorAll("button[aria-expanded]")]
    .find((b) => /Pensando|Razonamiento/.test(b.textContent ?? ""));
  assert.ok(boton, "no hay bloque de razonamiento");
  assert.equal(boton.getAttribute("aria-expanded"), "false");
  boton.click();
  await sleep(100);
  assert.equal(boton.getAttribute("aria-expanded"), "true");
  assert.ok(text(app).includes("pienso el problema"), "abrir no muestra el razonamiento");
  assert.deepEqual(app.failures, []);
});
