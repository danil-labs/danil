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


test("Danil Credits shows its balance without a model, a payer or a fabricated amount", async () => {
  const { app, panel } = await open("ai-providers-credits", []);
  const card = panel().querySelector('[aria-label="Danil Credits"]');
  assert.ok(card);
  assert.doesNotMatch(card.textContent, /DeepSeek|Pagador|Cuenta Danil/);
  assert.equal(card.querySelector("button"), null, "without a recharge capability there is no Add credits");
  assert.equal(card.querySelector('[role="status"]').textContent, "No disponible");
  assert.deepEqual(app.failures, []);
});


test("the task selector leaves Credits unavailable without preparing the retired pilot", async () => {
  const id = "danil-credits/deepseek/deepseek-v4.1-flash";
  const provider = "opencode";
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
    const rail = doc.querySelector('nav[aria-label="Proveedores de modelos"]');
    assert.equal(rail.querySelector('button[aria-label="Router IA gratis"]'), null, "the free router has no rail entry of its own");
    rail.querySelector('button[aria-label="Danil"]').click();
    await sleep(650);
    assert.equal(ready, false, "opening Credits never prepares the retired pilot");
    assert.equal(app.commands.includes("credits_pilot_prepare"), false);
    const section = doc.querySelector('section[aria-label="Danil Credits"]');
    const select = section?.querySelector("button");
    assert.ok(select?.disabled, "without a new billing source the model stays unavailable");
    assert.equal(section.querySelector('[role="status"]').textContent, "No disponible");
    const services = section.parentElement;
    assert.ok(services.querySelector('section[aria-label="Router IA gratis"]'), "the free router sits under Credits in the Danil panel");
    assert.doesNotMatch(services.textContent, /DeepSeek|Beam|Reflection|Pagador|Cuenta Danil/, "the services name no model and no payer");
    assert.deepEqual(app.failures, []);
  } finally {
    app.w.close();
  }
});

test("the free router is turned on and shown in use from the Danil panel without naming its model", async () => {
  const beam = "danil-free/reflection/beam-free";
  const free = "free-router-opencode";
  let accepted = false;
  const policy = () => ({ workspace_id: "w", version: 3, providers: ["kilo", "vercel", "reflection"], lines: [{ t: "Datos" }], acceptance_ref: "ref", enabled: true, terms: [], accepted });
  const option = (id, label, gratis = false) => ({ id, label, gratis, note: null, efforts: [], default_effort: null });
  const row = (id, provider, model) => ({ id, title: id, last_message: "", provider, model, refs: [], updated_at: 0, turns: 1, parent: null, esperando: false });
  const app = await boot("listo", "free-router-danil-panel", {
    ...BASE,
    workspaces_startup: () => ({ workspaces: [W], active: "w", free_model_policy: policy() }),
    machine_list: [{ id: "m1", active: true }],
    list_providers: [{ id: "opencode", label: "OpenCode", available: true, driver: true }],
    list_surfaces: () => [
      { id: "opencode", provider: "opencode", label: "OpenCode", catalogo: "de_pago", usable: true, marca: null, porque: null },
      { id: free, provider: free, label: "Free Router · OpenCode", catalogo: "gratuitos", usable: true, marca: null, porque: null },
    ],
    list_models: ({ provider }) => provider === free
      ? { provider, models: [option(beam, "Beam", true)], fallback: false }
      : { provider, models: [option("base", "Base")], fallback: false },
    list_projects: [{ id: "p1", name: "P1", working_directory: "/lab/p1", kind: "git", portfolio: null, sources: [] }],
    list_portfolios: [], list_agents: { agents: [], rechazados: [] }, list_agent_status: [],
    list_live_sessions: [row("t1", "opencode", "base"), row("t2", free, beam)], list_mentions: { fuentes: [], archivos: [] },
    list_active_turns: [], load_queue: [], queue_ready: true, session_usage: null,
    session_folder: "/tmp", list_task_trees: [], watch_task_tree: "watch", list_session_git: {},
    task_history: { history: { archived: false, events: [], recovery: null }, branch: null, path: "/lab", available: true, owned: false, restorable: false, recreatable: false, incomplete: false },
    load_session: ({ id }) => ({ id, provider: id === "t2" ? free : "opencode", model: id === "t2" ? beam : "base", sources: [], effort: null, permission_mode: null, turns: [{ role: "user", id: "u0", at: 0, text: "hello" }] }),
  });
  const openDanil = async () => {
    const doc = app.w.document;
    doc.querySelector('button[aria-label^="Modelo:"]').click();
    await sleep(400);
    doc.querySelector('nav[aria-label="Proveedores de modelos"] button[aria-label="Danil"]').click();
    await sleep(650);
    return doc.querySelector('section[aria-label="Router IA gratis"]');
  };
  try {
    await sleep(1200);
    const doc = app.w.document;
    doc.querySelector('[data-sesion="t1"]').click();
    await sleep(600);
    let router = await openDanil();
    assert.equal(router?.dataset.routerState, "activate", "without consent the service offers to turn on");
    assert.ok([...router.querySelectorAll("button")].some((b) => b.textContent.trim() === "Activar"));
    assert.equal(doc.querySelector('[role="listbox"] [role="option"]')?.textContent.includes("Beam") ?? false, false);
    doc.querySelector('button[aria-label^="Modelo:"]').click();
    await sleep(300);
    accepted = true;
    router = await openDanil();
    assert.equal(router?.dataset.routerState, "ready", "with consent the service is ready");
    assert.doesNotMatch(router.parentElement.textContent, /Beam|Reflection|DeepSeek/);
    const use = [...router.querySelectorAll("button")].find((b) => b.textContent.trim() === "Usar");
    assert.ok(use?.disabled, "a task locked to another agent cannot switch to the service");
    doc.querySelector('button[aria-label^="Modelo:"]').click();
    await sleep(300);
    doc.querySelector('[data-sesion="t2"]').click();
    await sleep(600);
    assert.equal(doc.querySelector('button[aria-label^="Modelo:"]').getAttribute("aria-label"), "Modelo: Router IA gratis");
    doc.querySelector('button[aria-label^="Modelo:"]').click();
    await sleep(650);
    router = doc.querySelector('section[aria-label="Router IA gratis"]');
    assert.ok(router, "a task on the service opens the picker on the Danil panel");
    assert.equal(router.querySelector('button[aria-pressed="true"]')?.textContent.trim(), "En uso");
    assert.deepEqual(app.failures, []);
  } finally {
    app.w.close();
  }
});
