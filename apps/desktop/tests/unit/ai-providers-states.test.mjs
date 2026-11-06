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
