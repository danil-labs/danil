/**
 * «Conecta tu IA» contra un motor anterior a noviembre, que aún manda dos filas
 * de OpenCode (`opencode-zen` y la retirada `opencode-local`) junto al Free
 * Router: la pantalla pinta una sola tarjeta de OpenCode. Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { freeSession, SIGNED_IN } from "../helpers/free-session.mjs";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const fila = (id, label, extra = {}) => ({
  id, label, available: false, sin_cuenta: false, source: null, system_broken: false, api_key: null, inferencia: "con_cuenta", ...extra,
});

const MOTOR_ANTERIOR = {
  window_ready: null,
  window_vitals: null,
  setup_required: false,
  list_projects: [],
  list_sources: [],
  list_live_sessions: [],
  list_live_turns: [],
  list_surfaces: [],
  list_system_sessions: [],
  service_poll: { cursor: 0, gap: false, replay: false, runtime: "test-service", reset: false },
  list_workspaces: { workspaces: [], active: null },
  workspaces_startup: { workspaces: [], active: null },
  ...freeSession().table,
  set_active_workspace: null,
  set_workspace_language: null,
  list_providers: [
    fila("codex", "Codex"),
    fila("opencode-zen", "OpenCode"),
    fila("free-router-opencode", "Free AI Router", { inferencia: "sin_pedir_nada", free_router: true }),
    fila("opencode-local", "OpenCode"),
  ],
  list_accounts: { provider: "codex", env_var: "", shared_credential: null, secret_note: null, active: null, accounts: [] },
  provider_download_size: 215_000_000,
};

test("un motor anterior con opencode-zen y opencode-local da una sola tarjeta de OpenCode", async () => {
  const app = await boot("listo", "conecta-opencode-retirado", MOTOR_ANTERIOR, undefined, SIGNED_IN);
  await sleep(1200);
  const nombres = [...app.w.document.querySelectorAll("strong")].map((s) => s.textContent.trim());
  assert.ok(nombres.includes("Codex"), `no se pintó «Conecta tu IA»: ${nombres}`);
  assert.equal(nombres.filter((n) => n === "OpenCode").length, 1, `tarjetas: ${nombres}`);
  assert.equal(nombres.filter((n) => n === "Router IA gratis").length, 1, `tarjetas: ${nombres}`);
  assert.deepEqual(app.failures, []);
});
