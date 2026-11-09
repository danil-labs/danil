/**
 * Configuración › Cuentas de IA nunca queda en blanco: mientras `list_surfaces`
 * no contesta dice «Cargando…», si falla dice por qué y ofrece reintentar, y si
 * la máquina no trae ningún agente enseña los que Danil sabe instalar. Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const W = { id: "w", name: "Danil", context_root: null };
const BASE = {
  window_ready: null,
  window_vitals: null,
  setup_required: false,
  list_providers: [],
  list_projects: [],
  list_sources: [],
  list_live_sessions: [],
  list_live_turns: [],
  set_active_workspace: null,
  list_workspaces: { workspaces: [W], active: "w" },
  workspaces_startup: { workspaces: [W], active: "w" },
  check_environment: { githubCli: null },
  list_known_mcp: [],
  list_mcp_providers: [],
  list_integrations: { workspace: "w", plugins: [] },
  service_poll: { cursor: 0, gap: false, replay: false, runtime: "test-service", reset: false },
};

async function open(name, surfaces, extra = {}) {
  const app = await boot("listo", name, { ...BASE, list_surfaces: surfaces, ...extra });
  await sleep(600);
  app.w.dispatchEvent(new app.w.CustomEvent("harness:open-settings", { detail: "proveedores-ia" }));
  await sleep(600);
  const panel = () => app.w.document.querySelector("#cfg-panel");
  return { app, panel, text: () => panel()?.textContent ?? "" };
}

test("while the machine has not answered the panel says it is loading", async () => {
  const { app, panel } = await open("ai-providers-loading", () => new Promise(() => {}));
  assert.ok(panel().querySelector('[data-ai-providers="loading"]'), panel()?.innerHTML.slice(0, 300));
  assert.ok(panel().textContent.includes("Cargando…"));
  assert.deepEqual(app.failures, []);
});

test("a machine with no agents shows the ones Danil can install, each with its own section", async () => {
  const { app, panel, text } = await open("ai-providers-none", []);
  assert.ok(panel().querySelector('[data-ai-providers="supported"]'), panel()?.innerHTML.slice(0, 300));
  assert.ok(text().includes("Esta máquina todavía no tiene asistentes de IA instalados."));
  for (const name of ["Claude Code", "Codex (ChatGPT)", "Gemini / Antigravity", "Grok"]) assert.ok(text().includes(name), name);
  assert.deepEqual(app.failures, []);
});

test("a failed read says why and retries until the list arrives", async () => {
  let starting = true;
  const surfaces = () => {
    if (starting) return Promise.reject({ what: "Encendiendo Prueba Danil Business…", detail: "machine_starting" });
    return [{ id: "claude", provider: "claude", label: "Claude Code", catalogo: "todo", usable: false, marca: "no instalado", porque: null }];
  };
  const { app, panel, text } = await open("ai-providers-failed", surfaces);
  assert.ok(panel().querySelector('[data-ai-providers="failed"]'), panel()?.innerHTML.slice(0, 300));
  assert.ok(text().includes("Encendiendo Prueba Danil Business…"));
  const retry = [...panel().querySelectorAll("button")].find((b) => b.textContent.trim() === "Reintentar");
  assert.ok(retry, "a retry button");
  starting = false;
  retry.click();
  await sleep(600);
  assert.equal(panel().querySelector("[data-ai-providers]"), null, "the real list replaces the notice");
  assert.ok(text().includes("Claude Code"));
  assert.deepEqual(app.failures, []);
});


test("Danil Credits exposes its sole model without execution or a fabricated balance", async () => {
  const { app, panel } = await open("ai-providers-credits", []);
  const section = panel().querySelector('section[aria-label="Danil Credits"]');
  assert.ok(section);
  const model = section.querySelector("button");
  assert.ok(model.disabled);
  assert.ok(model.textContent.includes("DeepSeek V4.1 Flash"));
  assert.ok(section.textContent.includes("Cuenta Danil"));
  assert.equal(section.querySelector('[role="status"]').textContent, "No disponible");
  assert.deepEqual(app.failures, []);
});


for (const [state, wallet, status, expected] of [
  ["zero", { balance_credits: 0, available_credits: 0, status: "active" }, 200, "0 créditos"],
  ["null", null, 200, "No disponible"],
  ["error", null, 503, "No disponible"],
  ["loading", null, 200, "Consultando…"],
]) {
  test(`the real Credits panel renders ${state} from the authenticated desktop transport`, async () => {
    const requests = [];
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    const reply = { status, content_type: "application/json", body: JSON.stringify({ account_id: 476, wallet, execution_available: false }) };
    const { app, panel } = await open(`ai-credits-${state}`, [], {
      agents_session_status: { state: "active", user: { user_id: "person", name: "Ana", email: "ana@example.test" }, active_account_id: 476 },
      agents_bff_fetch: (args) => {
        requests.push(args);
        return state === "loading" ? pending : reply;
      },
    });
    const section = panel().querySelector('section[aria-label="Danil Credits"]');
    assert.ok(section);
    assert.equal(section.querySelector('[role="status"]').textContent, expected);
    assert.ok(section.querySelector("button").disabled);
    assert.ok(requests.some((r) => r.path === "/api/credits/balance" && r.method === "GET"));
    assert.ok(requests.every((r) => r.method === "GET"));
    release(reply);
    await sleep(20);
    assert.deepEqual(app.failures, []);
  });
}

test("the task selector chooses the engine-advertised Credits model through its existing agent", async () => {
  const id = "danil-credits/deepseek/deepseek-v4.1-flash";
  const provider = "opencode-zen";
  let ready = false;
  const option = (id, label) => ({ id, label, gratis: false, note: null, efforts: [], default_effort: null });
  const row = { id: "t1", title: "Credits task", last_message: "", provider, model: "base", refs: [], updated_at: 0, turns: 1, parent: null, esperando: false };
  const app = await boot("listo", "credits-task-selection", {
    ...BASE,
    list_providers: [{ id: provider, label: "OpenCode", available: true, driver: true }],
    list_surfaces: () => [{ id: provider, provider, label: "OpenCode", catalogo: "de_pago", usable: true, marca: null, porque: null }, ...(ready ? [{ id: "danil-credits", provider, label: "Danil Credits", catalogo: "todo", usable: true, marca: null, porque: null }] : [])],
    list_models: () => ({ provider, models: [option("base", "Base"), ...(ready ? [option(id, "DeepSeek V4.1 Flash")] : [])], fallback: false }),
    credits_pilot_prepare: ({ workspace }) => { assert.equal(workspace, "w"); ready = true; return { ready: true, account_id: 476, model: id, expires_at: 9999999999 }; },
    list_projects: [{ id: "p1", name: "P1", working_directory: "/lab/p1", kind: "git", portfolio: null, sources: [] }],
    list_portfolios: [], list_agents: { agents: [], rechazados: [] }, list_agent_status: [],
    list_live_sessions: [row], list_mentions: { fuentes: [], archivos: [] },
    list_active_turns: [], load_queue: [], queue_ready: true, session_usage: null,
    session_folder: "/tmp", list_task_trees: [], watch_task_tree: "watch", list_session_git: {},
    task_history: { history: { archived: false, events: [], recovery: null }, branch: null, path: "/lab", available: true, owned: false, restorable: false, recreatable: false, incomplete: false },
    load_session: { id: "t1", provider, model: "base", sources: [], effort: null, permission_mode: null, turns: [{ role: "user", id: "u0", at: 0, text: "hello" }] },
  });
  try {
    await sleep(1200);
    const doc = app.w.document;
    assert.ok(doc.querySelector('[data-sesion="t1"]'), "the task is present");
    doc.querySelector('[data-sesion="t1"]').click();
    await sleep(600);
    const picker = doc.querySelector('button[aria-label^="Modelo:"]');
    assert.ok(picker, "the existing task model selector");
    picker.click();
    await sleep(250);
    doc.querySelector('nav button[aria-label="Danil Credits"]').click();
    await sleep(650);
    assert.ok(ready, "opening Credits prepares the local engine without exposing a credential to JavaScript");
    const section = doc.querySelector('section[aria-label="Danil Credits"]');
    const select = section?.querySelector("button");
    assert.ok(select && !select.disabled, "the model is selectable only when the engine advertises it");
    select.click();
    await sleep(250);
    assert.match(doc.querySelector('button[aria-label^="Modelo:"]').textContent, /DeepSeek V4.1 Flash/);
    assert.equal(doc.querySelector('section[aria-label="Danil Credits"]'), null, "selection closes the picker");
    assert.deepEqual(app.failures, []);
  } finally {
    app.w.close();
  }
});
