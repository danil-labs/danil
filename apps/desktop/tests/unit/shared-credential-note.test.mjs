/**
 * Con una cuenta de un agente que comparte credencial, «+ Agregar cuenta» está
 * deshabilitado y el motivo se lee en la tarjeta, no solo en un `title` que el
 * botón deshabilitado nunca enseña (#176). Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const PORQUE = "Antigravity guarda una sola sesión en esta computadora.";
const workspace = { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" };

const button = (app, text) =>
  [...app.w.document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text || b.getAttribute("aria-label") === text);

async function waitFor(read, message) {
  for (let i = 0; i < 100; i++) {
    const value = read();
    if (value) return value;
    await sleep(20);
  }
  assert.fail(message);
}

async function click(app, text) {
  (await waitFor(() => button(app, text), `Falta el botón «${text}»`)).click();
  await sleep(50);
}

async function abrir(shared_credential, accounts) {
  const app = await boot("listo", `credencial-compartida-${accounts.length}`, {
    window_ready: null,
    window_vitals: null,
    setup_required: false,
    launcher_state: { phase: "ready", blank_0274: false },
    list_language_packs: [],
    list_bundled_language_packs: [],
    list_providers: [{ id: "antigravity", label: "Antigravity", available: true, limits: true }],
    list_workspaces: workspace,
    workspaces_startup: workspace,
    list_projects: [],
    list_sources: [],
    list_live_sessions: [],
    list_live_turns: [],
    list_models: { models: [], fallback: false },
    list_surfaces: [{ id: "antigravity", provider: "antigravity", label: "Antigravity", catalogo: "todo", usable: true, marca: null, porque: null }],
    list_accounts: { provider: "antigravity", env_var: "", shared_credential, secret_note: null, active: accounts[0]?.id ?? null, accounts },
    account_limits: { mode: "read", windows: [], at: Date.now() },
    tasks_awaiting_quota: [],
    service_poll: { cursor: 0, gap: false, replay: false, runtime: "fixture", reset: false },
  });
  await click(app, "Configuración");
  await click(app, "Cuentas de IA");
  // Con cuentas, la tarjeta del agente ya está abierta.
  await sleep(300);
  if (!button(app, "+ Agregar cuenta")) await click(app, "Antigravity");
  return app;
}

const nota = (app) => app.w.document.querySelector("[data-shared-credential]");

test("con una cuenta que comparte credencial, el motivo de no poder agregar otra se ve", async () => {
  const app = await abrir(PORQUE, [{ id: "c1", label: "Cuenta 1", created_at: 1, email: null }]);
  const add = await waitFor(() => button(app, "+ Agregar cuenta"), "Falta «+ Agregar cuenta»");
  assert.equal(add.disabled, true);
  const texto = (await waitFor(() => nota(app), "El motivo no se ve en la tarjeta")).textContent;
  assert.ok(texto.includes(PORQUE), `la nota no dice el motivo del motor: ${texto}`);
  assert.ok(texto.includes("quita primero la que está"), `la nota no dice qué hacer: ${texto}`);
  assert.deepEqual(app.failures, []);
});

test("sin cuentas, la primera se puede conectar y no hay nota", async () => {
  const app = await abrir(PORQUE, []);
  const add = await waitFor(() => button(app, "+ Agregar cuenta"), "Falta «+ Agregar cuenta»");
  assert.equal(add.disabled, false);
  assert.equal(nota(app), null);
  assert.deepEqual(app.failures, []);
});
