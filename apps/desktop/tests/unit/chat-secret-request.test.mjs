/**
 * La tarjeta «Secreto solicitado» en el chat de su tarea: guardar va por
 * `env_secret_set` en el slot de la solicitud y solo después se contesta `saved`,
 * sin el valor; `not_saved` deja la tarjeta abierta con su error; rechazar y
 * vencer cierran sin formulario; un motor sin la extensión no pinta nada. Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const VALUE = "sk_test_value_that_never_travels_42";
const request = (id = "r1", over = {}) => ({ request_id: id, workspace: "w", task: "t1", folder: "p1", name: "STRIPE_KEY", reason: "Necesito la llave de prueba\npara el checkout.", reason_author: "agent", replace: false, created_at: "2026-11-05T20:00:00Z", expires_at: "2026-11-05T20:15:00Z", ...over });
const row = (id) => ({ id, title: `Tarea ${id}`, last_message: "", provider: "claude", model: "opus", refs: [], updated_at: 0, turns: 1, parent: null, esperando: false });

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
    list_models: { provider: "claude", models: [{ id: "opus", label: "Opus", gratis: null, note: null, efforts: [], default_effort: null }], fallback: false },
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
    load_session: ({ id }) => ({ id, provider: "claude", sources: [], model: "opus", effort: null, permission_mode: null, turns: [{ role: "user", id: "u0", at: 0, text: "hola" }] }),
    ...overrides,
  };
}

/** Cada argumento de cada orden, para buscar el valor donde no debe estar. */
function recordArgs(sent) {
  return (w) => {
    const inner = w.__TAURI_INTERNALS__;
    const original = inner.invoke;
    inner.invoke = (cmd, args, options) => {
      sent.push([cmd, JSON.stringify(args ?? null)]);
      return original(cmd, args, options);
    };
  };
}

async function openTask(app) {
  await sleep(600);
  const el = app.w.document.querySelector('[data-sesion="t1"]');
  assert.ok(el, "no está la fila de t1");
  el.click();
  await sleep(400);
  const field = app.w.document.querySelector("textarea");
  assert.ok(field, "no está el campo");
  return field;
}


const card = (app, id = "r1") => app.w.document.querySelector(`[data-secret-request="${id}"]`);

function type(app, field, text) {
  field.value = text;
  field.dispatchEvent(new app.w.Event("input", { bubbles: true }));
}

test("saving goes to the request's slot first, then answers saved without the value", async () => {
  const sent = [];
  const order = [];
  const app = await boot("listo", "chat-secret-request-save", responses({
    secret_requests_list: { requests: [request()] },
    env_secrets_list: { secrets: [] },
    env_secret_set: (args) => {
      order.push(["env_secret_set", args]);
      return null;
    },
    secret_request_answer: (args) => {
      order.push(["secret_request_answer", args]);
      return { request_id: args.requestId, outcome: "fulfilled" };
    },
  }), undefined, {}, { beforeImport: recordArgs(sent) });
  try {
    await openTask(app);
    await sleep(300);
    const c = card(app);
    assert.ok(c, "the card shows in its task");
    assert.equal(c.querySelector("[data-secret-request-reason]").getAttribute("data-author"), "agent");
    assert.ok(c.querySelector("[data-secret-request-reason]").textContent.includes("Necesito la llave de prueba"));
    const input = c.querySelector('input[type="password"]');
    assert.ok(input, "a write-only field");
    type(app, input, VALUE);
    await sleep(30);
    c.querySelector("[data-secret-request-save]").click();
    await sleep(400);
    assert.deepEqual(order.map(([cmd]) => cmd), ["env_secret_set", "secret_request_answer"], "saved is answered after saving");
    assert.deepEqual(order[0][1], { folder: "p1", name: "STRIPE_KEY", value: VALUE, replace: false });
    assert.deepEqual(order[1][1], { requestId: "r1", outcome: "saved" });
    assert.ok(card(app).querySelector('[data-secret-request-state="saved"]'), "Guardado");
    assert.equal(card(app).querySelector("form"), null, "no form once resolved");
    const leaks = sent.filter(([cmd, args]) => cmd !== "env_secret_set" && args.includes(VALUE)).map(([cmd]) => cmd);
    assert.deepEqual(leaks, []);
  } finally {
    app.w.close();
  }
});

test("not_saved keeps the card open with a short error; decline closes it", async () => {
  let answers = 0;
  const app = await boot("listo", "chat-secret-request-retry", responses({
    secret_requests_list: { requests: [request()] },
    env_secrets_list: { secrets: [] },
    env_secret_set: null,
    secret_request_answer: (args) => {
      answers += 1;
      if (args.outcome === "saved") return Promise.reject({ what: { clave: "credentials.error.secret_request_not_saved" }, detail: "secret_request_not_saved" });
      return { request_id: args.requestId, outcome: "declined" };
    },
  }));
  try {
    await openTask(app);
    await sleep(300);
    type(app, card(app).querySelector('input[type="password"]'), VALUE);
    await sleep(30);
    card(app).querySelector("[data-secret-request-save]").click();
    await sleep(400);
    assert.ok(card(app).querySelector("form"), "still open");
    assert.ok(card(app).querySelector("[data-secret-request-error]").textContent.includes("No se guardó"));
    card(app).querySelector("[data-secret-request-decline]").click();
    await sleep(300);
    assert.ok(card(app).querySelector('[data-secret-request-state="declined"]'), "Rechazado");
    assert.equal(answers, 2);
  } finally {
    app.w.close();
  }
});

test("events open and expire a card; a later read closes what the engine no longer lists", async () => {
  let open = [];
  const app = await boot("listo", "chat-secret-request-events", responses({
    secret_requests_list: () => ({ requests: open }),
    env_secrets_list: { secrets: [] },
  }));
  try {
    await openTask(app);
    await sleep(300);
    assert.equal(card(app), null);
    app.emit("secret_requested", request("r2"));
    await sleep(100);
    assert.ok(card(app, "r2"), "a request that arrives while the chat is open");
    app.emit("secret_request_closed", { request_id: "r2", workspace: "w", task: "t1", outcome: "expired" });
    await sleep(100);
    assert.ok(card(app, "r2").querySelector('[data-secret-request-state="expired"]'), "Vencido");
    app.emit("secret_requested", request("r3"));
    await sleep(100);
    open = [];
    app.w.dispatchEvent(new app.w.CustomEvent("harness:service-resync"));
    await sleep(200);
    assert.ok(card(app, "r3").querySelector('[data-secret-request-state="expired"]'), "missing from the list after a gap: closed");
  } finally {
    app.w.close();
  }
});

test("an engine without secret_request_v1 paints no card and the composer keeps working", async () => {
  const app = await boot("listo", "chat-secret-request-old", responses({
    secret_requests_list: () => Promise.reject({ what: { clave: "shell.service.command" }, detail: "command" }),
  }));
  try {
    const field = await openTask(app);
    await sleep(300);
    app.emit("secret_requested", request("r9"));
    await sleep(100);
    assert.equal(card(app, "r9"), null, "no card");
    assert.equal(field.disabled, false);
  } finally {
    app.w.close();
  }
});
