/**
 * «Personaliza» → Google Drive contra un motor simulado: con rclone ya instalado,
 * desconectar y volver a pulsar «Conectar» abre otra vez el login. Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const BASE = {
  window_ready: null,
  window_vitals: null,
  setup_required: false,
  list_projects: [],
  list_sources: [],
  list_live_sessions: [],
  list_live_turns: [],
  list_surfaces: [],
  service_poll: { cursor: 0, gap: false, replay: false, runtime: "test-service", reset: false },
  list_workspaces: { workspaces: [], active: null },
  workspaces_startup: { workspaces: [], active: null },
};

/** Primer arranque con Codex ya conectado: «Conecta tu IA» deja seguir a «Personaliza». */
const TO_PERSONALIZE = {
  ...BASE,
  list_providers: [
    { id: "codex", label: "Codex", available: true, sin_cuenta: false, source: null, system_broken: false, api_key: null, inferencia: "con_cuenta" },
  ],
  list_accounts: {
    provider: "codex", env_var: "", shared_credential: null, secret_note: null, active: "a1",
    accounts: [{ id: "a1", label: "", created_at: 1, identity: "yo@norte.mx", authenticated_at: 2 }],
  },
  add_workspace: ({ name }) => ({ id: "n", name }),
  set_active_workspace: null,
  set_workspace_language: null,
  list_git_hosts: [],
  list_known_mcp: [],
  list_mcp_providers: [],
  list_integrations: { workspace: "n", plugins: [] },
};

const button = (root, label) =>
  [...root.querySelectorAll("button")].find((b) => b.textContent.trim() === label || b.getAttribute("aria-label") === label);

test("Drive con su CLI ya instalado vuelve a conectar después de desconectar", async () => {
  const yo = { email: "yo@norte.mx", name: "Yo" };
  let connected = yo;
  const status = () => ({ supported: true, installed: true, install: null, connected, unverified: null });
  const logins = [];
  const app = await boot("listo", "drive-reconectar", {
    ...TO_PERSONALIZE,
    google_drive_status: status,
    check_google_drive: status,
    disconnect_google_drive: () => {
      connected = null;
      return null;
    },
    start_google_drive_login: () => {
      logins.push("start");
      return { url: "http://127.0.0.1:53682/auth?state=x" };
    },
    finish_google_drive_login: () => {
      logins.push("finish");
      connected = yo;
      return status();
    },
    open_external: null,
  });
  await sleep(800);
  button(app.w.document, "Continuar").click();
  await sleep(500);

  const card = () =>
    [...app.w.document.querySelectorAll("strong")].find((s) => s.textContent === "Google Drive")?.closest("div");
  assert.ok(card()?.textContent.includes("Conectado"), card()?.textContent ?? app.w.document.body.textContent.slice(0, 600));

  button(card(), "Desconectar Google Drive").click();
  await sleep(200);
  assert.ok(button(card(), "Conectar"), card().textContent);

  button(card(), "Conectar").click();
  await sleep(300);
  assert.deepEqual(logins, ["start", "finish"], "pulsar «Conectar» no abrió el login de Drive");
  assert.ok(card().textContent.includes("Conectado"), card().textContent);
  assert.deepEqual(app.failures, []);
});
