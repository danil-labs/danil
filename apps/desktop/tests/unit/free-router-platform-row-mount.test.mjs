import assert from "node:assert/strict";
import test from "node:test";
import { alCerrar, cerrarTodo, motor, waitFor } from "../helpers/ai-providers-fixture.mjs";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

test.afterEach(cerrarTodo);

const BASE_POLICY = {
  workspace_id: "w",
  version: 3,
  providers: ["kilo", "vercel", "reflection"],
  lines: [{ clave: "settings.accounts.free.warning" }],
  acceptance_ref: "",
  enabled: false,
  accepted: false,
  terms: [{ label: "OpenCode", url: "https://opencode.ai/terms" }],
};

async function openAiAccounts(name, policy) {
  const m = motor();
  m.activo = true;
  m.provs.claude = { cuentas: [] };
  m.provs["free-router-opencode"] = { cuentas: [], label: "Free Router · OpenCode" };
  const baseProviders = m.responses.list_providers;
  const list_providers = (args) =>
    baseProviders(args).map((p) => ({
      ...p,
      inferencia: p.id.startsWith("free-router") ? "sin_pedir_nada" : "con_cuenta",
    }));

  const app = await boot("listo", name, {
    ...m.responses,
    list_providers,
    machine_list: [{ id: "local", local: true, active: true, on: true, hosts: true }],
    workspaces_startup: {
      active: "w",
      workspaces: [{ id: "w", name: "Org Workspace", context_root: null }],
      free_model_policy: policy,
    },
    list_workspaces: {
      active: "w",
      workspaces: [{ id: "w", name: "Org Workspace", context_root: null }],
    },
    list_models: { models: [{ id: "danil-free/reflection/beam-free", gratis: true }], fallback: false },
    list_surfaces: [{ id: "claude", provider: "claude", label: "Claude Code", catalogo: "todo", usable: true, marca: null, porque: null }],
  });
  await sleep(400);
  app.w.dispatchEvent(new app.w.CustomEvent("harness:open-settings", { detail: "proveedores-ia" }));
  alCerrar(() => app.w.close());
  const panel = await waitFor(() => app.w.document.querySelector("#cfg-panel"), "panel de configuración");
  return { app, doc: app.w.document, panel };
}

test("FreeRouterRow enables Activar modelos gratuitos and opens consent dialog for a platform policy even when enabled is false", async () => {
  const { app, doc, panel } = await openAiAccounts("free-router-platform-row", {
    ...BASE_POLICY,
    authority: "platform",
  });

  const findActivateButton = () =>
    [...panel.querySelectorAll("button")].find((btn) => btn.textContent?.trim() === "Activar modelos gratuitos");

  const activateBtn = await waitFor(findActivateButton, "botón Activar modelos gratuitos");
  // Wait for consent.cargar() to settle.
  await sleep(200);

  assert.equal(
    activateBtn.disabled,
    false,
    "Activar modelos gratuitos must be enabled for an organization/platform policy with authority === 'platform'",
  );

  // Clicking opens the consent dialog with the policy terms and an enabled Activar button.
  activateBtn.click();
  const dialog = await waitFor(
    () => doc.querySelector('[aria-label="Activar Router IA gratis"]'),
    "diálogo de consentimiento",
  );
  const confirmBtn = await waitFor(
    () => [...dialog.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Activar"),
    "botón Activar del diálogo",
  );
  assert.equal(confirmBtn.disabled, false, "consent dialog Activar button must be enabled");
  assert.deepEqual(app.failures, []);
});

test("FreeRouterRow shows active badge for an accepted platform policy even when enabled is false", async () => {
  const { app, panel } = await openAiAccounts("free-router-platform-accepted", {
    ...BASE_POLICY,
    authority: "platform",
    accepted: true,
  });

  await waitFor(
    () => [...panel.querySelectorAll("button")].some((btn) => btn.textContent?.trim() === "Desactivar"),
    "botón Desactivar",
  );
  await sleep(200);

  assert.ok(
    panel.textContent?.includes("activados"),
    `Expected active badge ('activados') for accepted platform policy, got: ${panel.textContent}`,
  );
  assert.deepEqual(app.failures, []);
});

test("FreeRouterRow keeps Activar modelos gratuitos disabled for a non-platform policy with enabled false", async () => {
  const { app, panel } = await openAiAccounts("free-router-local-disabled", {
    ...BASE_POLICY,
    enabled: false,
  });

  const activateBtn = await waitFor(
    () => [...panel.querySelectorAll("button")].find((btn) => btn.textContent?.trim() === "Activar modelos gratuitos"),
    "botón Activar modelos gratuitos",
  );
  await sleep(200);

  assert.equal(
    activateBtn.disabled,
    true,
    "Activar modelos gratuitos must stay disabled when local policy has enabled === false",
  );
  assert.deepEqual(app.failures, []);
});
