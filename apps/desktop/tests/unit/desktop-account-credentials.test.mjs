/**
 * En el escritorio las claves de la cuenta pasan por el motor: la cuenta de
 * OpenCode dice en qué máquinas está su clave, y el aviso de migración sube a la
 * cuenta solo las claves locales que la persona elige. Sin sesión de Danil en el
 * workspace (`credentials.error.not_linked`) no se enseña nada. Monta `dist/`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const workspace = { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" };

const button = (app, text, root = app.w.document) => [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

async function waitFor(read, message) {
  for (let i = 0; i < 150; i++) {
    const value = read();
    if (value) return value;
    await sleep(20);
  }
  assert.fail(message);
}

function respuestas(credentials) {
  const calls = [];
  const table = {
    window_ready: null,
    window_vitals: null,
    setup_required: false,
    launcher_state: { phase: "ready", blank_0274: false },
    list_language_packs: [],
    list_bundled_language_packs: [],
    list_providers: [{ id: "opencode-zen", label: "OpenCode", available: true, limits: false, api_key: "https://opencode.ai/auth" }],
    list_workspaces: workspace,
    workspaces_startup: workspace,
    list_projects: [],
    list_sources: [],
    list_live_sessions: [],
    list_live_turns: [],
    list_models: { models: [], fallback: false },
    list_surfaces: [{ id: "opencode-zen", provider: "opencode-zen", label: "OpenCode", catalogo: "todo", usable: true, marca: null, porque: null }],
    list_accounts: { provider: "opencode-zen", env_var: "OPENCODE_API_KEY", shared_credential: null, secret_note: null, active: "cuenta-1", accounts: [{ id: "cuenta-1", label: "Trabajo", created_at: 1, email: null }] },
    tasks_awaiting_quota: [],
    service_poll: { cursor: 0, gap: false, replay: false, runtime: "fixture", reset: false },
    account_credentials_list: (args) => {
      calls.push(["account_credentials_list", args]);
      return credentials();
    },
    account_credentials_upload: (args) => {
      calls.push(["account_credentials_upload", args]);
      return { uploaded: args.slots, failed: [] };
    },
  };
  return { table, calls };
}

async function openAccounts(app) {
  await sleep(300);
  app.w.dispatchEvent(new app.w.CustomEvent("harness:open-settings", { detail: "proveedores-ia" }));
  await sleep(400);
  if (!app.w.document.querySelector("[data-local-keys-banner], [data-account-credential]")) button(app, "OpenCode")?.click();
}

test("la cuenta de OpenCode dice dónde está su clave y el aviso sube solo las claves elegidas", async () => {
  let uploaded = false;
  const listing = () => ({
    credentials: [
      {
        id: "cred_1",
        workspace_id: "w",
        kind: "api_key",
        provider: "opencode",
        slot: "agentes/opencode-zen:cuenta-1",
        label: "Trabajo",
        hint: "cdef",
        delivery: "sealed",
        status: "active",
        config: { agent: "opencode-zen", account: "cuenta-1" },
        version: 1,
        machines: [
          { computer_id: "cmp_mac", name: "Mac", state: "active", version: 1 },
          { computer_id: "cmp_vm", name: "vm-alberto", state: "active", version: 1 },
        ],
      },
    ],
    recipients: [],
    local_only: uploaded
      ? []
      : [
          { slot: "agentes/opencode-zen:cuenta-2", kind: "api_key", provider: "opencode", label: "Personal", hint: "1111" },
          { slot: "agentes/opencode-zen:go-usage:cuenta-2", kind: "api_key", provider: "opencode-go", label: "Personal · Go", hint: "2222", upload_error: "credentials.error.offline" },
          { slot: "referencias/zotero-key", kind: "zotero", provider: "zotero", label: "Zotero", hint: "3333" },
        ],
  });
  const { table, calls } = respuestas(listing);
  const original = table.account_credentials_upload;
  table.account_credentials_upload = (args) => {
    uploaded = true;
    return original(args);
  };
  const app = await boot("listo", "credenciales-escritorio", table);
  const doc = app.w.document;
  await openAccounts(app);

  const usage = await waitFor(() => doc.querySelector('[data-account-credential="agentes/opencode-zen:cuenta-1"] [data-credential-usage]'), "Falta «En uso en» en la cuenta");
  assert.equal(usage.textContent, "En uso en: Mac y vm-alberto");
  assert.deepEqual(calls.find(([c]) => c === "account_credentials_list")[1], {}, "el workspace va en el sobre, no en los argumentos");

  const banner = await waitFor(() => doc.querySelector("[data-local-keys-banner]"), "Falta el aviso de migración");
  assert.match(banner.textContent, /Tienes 2 claves solo en esta máquina\. ¿Subirlas a tu cuenta\?/, "solo las de agentes en esta sección");
  assert.equal(banner.querySelector('[data-upload-error="agentes/opencode-zen:go-usage:cuenta-2"]')?.textContent, "Sin conexión con Danil. Inténtalo de nuevo.", "se ve por qué no subió la última vez");
  const go = banner.querySelector('[data-local-key="agentes/opencode-zen:go-usage:cuenta-2"]');
  go.click();
  await sleep(50);
  button(app, "Subir 1", banner).click();
  await waitFor(() => calls.some(([c]) => c === "account_credentials_upload"), "No subió");
  assert.deepEqual(calls.find(([c]) => c === "account_credentials_upload")[1], { slots: ["agentes/opencode-zen:cuenta-2"] }, "solo la elegida");
  await waitFor(() => !doc.querySelector("[data-local-keys-banner]"), "El aviso sigue después de subir");
  assert.deepEqual(app.failures, []);
});

test("sin sesión de Danil en el workspace no hay «En uso en» ni aviso", async () => {
  const { table } = respuestas(() => {
    throw { what: { clave: "credentials.error.not_linked" }, detail: "not_linked" };
  });
  const app = await boot("listo", "credenciales-sin-cuenta", table);
  await openAccounts(app);
  await waitFor(() => button(app, "+ Agregar cuenta") || app.w.document.querySelector("[data-account-id], li"), "Falta la lista de cuentas");
  await sleep(400);
  assert.equal(app.w.document.querySelector("[data-account-credential], [data-local-keys-banner], [data-account-credentials]"), null);
});
