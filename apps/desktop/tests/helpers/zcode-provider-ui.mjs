import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { boot, sleep } from "./jsdom-app.mjs";

const workspace = { workspaces: [{ id: "fixture-a", name: "A" }], active: "fixture-a" };
const external = "https://zcode.z.ai/en";
const provider = available => ({ id: "zcode", label: "ZCode", available,
  external_install_url: external, source: available ? "system" : null, system_broken: false,
  limits: false, sin_cuenta: false, api_key: null, inferencia: "con_cuenta" });
const base = {
  launcher_state: { phase: "ready", blank_0274: false }, setup_required: false,
  list_language_packs: [], list_bundled_language_packs: [], window_ready: null, window_vitals: null,
  list_workspaces: workspace, workspaces_startup: workspace,
  list_projects: [], list_sources: [], list_live_sessions: [], list_live_turns: [],
  list_models: { models: [], fallback: false },
  list_surfaces: [{ id: "zcode", provider: "zcode", label: "ZCode", catalogo: "todo", usable: false, marca: null, porque: null }],
  list_accounts: { provider: "zcode", env_var: "", shared_credential: null, secret_note: null, active: null, accounts: [] },
  tasks_awaiting_quota: [],
  service_poll: { cursor: 0, gap: false, replay: false, runtime: "fixture", reset: false },
};
const button = (app, text) => [...app.w.document.querySelectorAll("button")]
  .find(b => b.textContent?.trim() === text || b.getAttribute("aria-label") === text);
async function waitFor(read, message) {
  for (let i = 0; i < 100; i++) {
    const value = read();
    if (value) return value;
    await sleep(20);
  }
  assert.fail(message);
}
async function click(app, text) {
  const b = await waitFor(() => button(app, text), `Missing button: ${text}`);
  assert.equal(b.disabled, false, `Disabled button: ${text}`);
  b.click();
  await sleep(50);
}
const effects = app => app.commands.filter(cmd => ["add_account", "install_provider", "login_account", "open_external"].includes(cmd));

async function settings(scenario) {
  let metadata = () => [];
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const opened = [];
  const app = await boot("listo", `zcode-${scenario}`, { ...base,
    list_providers: () => metadata(),
    open_external: ({ target }) => opened.push(target),
    add_account: () => ({ id: "new-account", label: "Cuenta 1", identity: null, authenticated_at: null, created_at: 1 }),
    login_account: null,
  });
  metadata = scenario === "delayed" ? () => pending : () => Promise.reject(new Error("provider unavailable"));
  await click(app, "Configuración");
  await click(app, "Cuentas de IA");
  await click(app, "ZCode");
  const add = await waitFor(() => button(app, "+ Agregar cuenta"), "Missing account action");
  assert.equal(add.disabled, true, "Unknown provider metadata must prevent account creation");
  assert.deepEqual(effects(app), []);
  if (scenario === "delayed") {
    await click(app, "Comprobar proveedor");
    assert.deepEqual(effects(app), [], "Checking unknown metadata must not install or connect");
    release([provider(false)]);
  } else {
    await waitFor(() => app.w.document.body.textContent.includes("No pude comprobar el proveedor"), "Missing metadata error");
    metadata = () => [provider(false)];
    await click(app, "Comprobar proveedor");
  }
  await waitFor(() => button(app, "Descargar ZCode oficial"), "Missing external download action");
  assert.equal(button(app, "+ Agregar cuenta").disabled, true, "Missing external app must prevent account creation");
  await click(app, "Descargar ZCode oficial");
  assert.deepEqual(opened, [external]);
  assert.equal(app.commands.includes("install_provider"), false, "External providers must not use managed installation");
  metadata = () => [provider(true)];
  await click(app, "Ya la instalé · Comprobar");
  await waitFor(() => {
    const add = button(app, "+ Agregar cuenta");
    return add && !add.disabled;
  }, "Installed provider must permit account creation");
  await click(app, "+ Agregar cuenta");
  await waitFor(() => app.commands.includes("login_account"), "Installed provider did not start account connection");
  assert.ok(app.commands.includes("add_account"));
  assert.equal(app.commands.includes("install_provider"), false);
  assert.deepEqual(app.failures, []);
}

async function onboarding() {
  let metadata = () => [provider(false)];
  const empty = { workspaces: [], active: null };
  const app = await boot("listo", "zcode-onboarding", { ...base,
    list_workspaces: empty, workspaces_startup: empty, list_providers: () => metadata(),
  });
  const checkbox = () => [...app.w.document.querySelectorAll("label")]
    .find(label => label.textContent.includes("ZCode"))?.querySelector('input[type="checkbox"]');
  assert.ok(await waitFor(checkbox, "Missing onboarding provider card"));
  assert.equal(checkbox().disabled, true);
  metadata = () => Promise.reject(new Error("provider refresh unavailable"));
  await click(app, "Ya la instalé · Comprobar");
  await waitFor(() => app.w.document.body.textContent.includes("No pude abrir el enlace o comprobar"), "Missing refresh error");
  assert.ok(checkbox(), "A failed refresh must preserve the provider card");
  assert.ok(button(app, "Ya la instalé · Comprobar"), "A failed refresh must retain retry");
  metadata = () => [provider(true)];
  await click(app, "Ya la instalé · Comprobar");
  await waitFor(() => checkbox() && !checkbox().disabled, "Retry did not recover installation state");
  assert.equal(app.w.document.body.textContent.includes("No pude abrir el enlace o comprobar"), false);
  checkbox().click();
  assert.equal(button(app, "Instalar y continuar").disabled, false);
  assert.deepEqual(effects(app), []);
  assert.deepEqual(app.failures, []);
}

const scenario = process.argv[2];
if (scenario) {
  await (scenario === "onboarding" ? onboarding() : settings(scenario));
  console.log(`PASS ZCode ${scenario}`);
  process.exit(0);
}
for (const name of ["delayed", "failed", "onboarding"]) {
  const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), name], { encoding: "utf8" });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  process.stdout.write(run.stdout);
}
