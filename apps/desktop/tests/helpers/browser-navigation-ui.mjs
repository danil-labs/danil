import assert from "node:assert/strict";
import { boot, sleep } from "./jsdom-app.mjs";

const button = (app, text) => [...app.w.document.querySelectorAll("button")]
  .find(b => b.textContent?.trim() === text || b.getAttribute("aria-label") === text);
async function waitFor(read) {
  for (let i = 0; i < 150; i++) {
    const value = read();
    if (value) return value;
    await sleep(20);
  }
  assert.fail("La UI no llegó al estado esperado");
}
const calls = [];
let rejectInstall;
let resolveInstall;
let chromeInstalled = false;
let chromeNeedsUpdate = false;
const app = await boot("listo", "browser-navigation", {
  launcher_state: { phase: "ready", blank_0274: false },
  setup_required: false, window_ready: null, window_vitals: null,
  list_surfaces: [], list_providers: [], list_accounts: [], tasks_awaiting_quota: [],
  list_language_packs: [], list_bundled_language_packs: [],
  check_environment: () => ({ ready: true, blocked: false, reason: "Importación pendiente: se conserva la versión anterior", bootstrap: [], runtimeVersions: {},
    items: ["node", "npm"].map(id => ({ id, label: id, ok: false, installable: true, required: false, source: null })).concat([{ id: "browser-navigation", label: "Chrome for Testing", ok: chromeInstalled, installable: !chromeInstalled || chromeNeedsUpdate, required: false, source: chromeInstalled ? "instalado por la app" : null }]) }),
  install_base_tool: ({ tool }) => { calls.push(tool); },
  list_dependencies: [], list_projects: [], list_sources: [], list_live_sessions: [], list_live_turns: [],
  list_models: { models: [], fallback: false },
  list_workspaces: { workspaces: [{ id: "fixture-a", name: "A" }], active: "fixture-a" },
  workspaces_startup: { workspaces: [{ id: "fixture-a", name: "A" }], active: "fixture-a" },
  service_poll: { cursor: 0, runtime: "fixture", reset: false },
  install_size: ({ operation }) => { calls.push(operation); return 1000; },
  install_tool: ({ tool }) => {
    calls.push(tool);
    return new Promise((resolve, reject) => { resolveInstall = resolve; rejectInstall = reject; });
  },
  cancel_install: ({ operation }) => {
    calls.push(operation);
    rejectInstall(new Error("install.cancelled"));
  },
});
(await waitFor(() => button(app, "Configuración"))).click();
(await waitFor(() => app.w.document.querySelector("#cfg-tab-machines"))).click();
(await waitFor(() => button(app, "Estado del entorno"))).click();
const prepare = await waitFor(() => button(app, "Preparar navegación"));
assert.ok(!app.commands.includes("install_tool"), "Abrir ajustes no instala Chrome");
await waitFor(() => app.w.document.body.textContent.includes("Importación pendiente"));
// Node y npm son de quien usa la computadora: ni se listan ni se ofrecen.
assert.equal([...app.w.document.querySelectorAll("tr")].some(row => /\b(npm|node)\b/.test(row.textContent)), false);
assert.equal(app.commands.includes("install_tool"), false);
assert.equal(app.commands.includes("install_base_tool"), false);
calls.length = 0;
prepare.click();
await waitFor(() => rejectInstall);
app.emit("install", { operation: "tool:browser-navigation", done: 500, bytes: 1000 });
await waitFor(() => app.w.document.querySelector('[role="status"]')?.textContent.includes("de"));
(await waitFor(() => button(app, "Cancelar"))).click();
await waitFor(() => !prepare.disabled);
assert.deepEqual(calls, ["browser-navigation", "tool:browser-navigation"]);
prepare.click();
await waitFor(() => calls.length === 3);
rejectInstall(new Error("Motor anterior: herramienta desconocida"));
await waitFor(() => button(app, "Volver a intentar"));
assert.ok(app.w.document.body.textContent.includes("Motor anterior"), "El error del motor queda visible");
(await waitFor(() => button(app, "Volver a intentar"))).click();
await waitFor(() => calls.length === 4);
rejectInstall(new Error("browser_navigation_sandbox_required"));
const sandbox = await waitFor(() => button(app, "Permitir aislamiento de Chrome"));
assert.ok(!calls.includes("browser-navigation-sandbox"), "El error no pide privilegios por sí solo");
sandbox.click();
await waitFor(() => calls.includes("browser-navigation-sandbox"));
chromeInstalled = true;
resolveInstall("ready");
await waitFor(() => button(app, "Listo")?.disabled);
(await waitFor(() => app.w.document.querySelector("#cfg-tab-preferences"))).click();
(await waitFor(() => app.w.document.querySelector("#cfg-tab-machines"))).click();
(await waitFor(() => button(app, "Estado del entorno"))).click();
await waitFor(() => button(app, "Listo")?.disabled);
chromeNeedsUpdate = true;
(await waitFor(() => app.w.document.querySelector("#cfg-tab-preferences"))).click();
(await waitFor(() => app.w.document.querySelector("#cfg-tab-machines"))).click();
(await waitFor(() => button(app, "Estado del entorno"))).click();
await waitFor(() => button(app, "Actualizar"));
assert.equal(app.commands.filter(c => c === "install_tool").length, 4, "Reabrir el inventario no instala Chrome");
assert.equal(app.commands.includes("install_provider"), false);
assert.deepEqual(app.failures, []);
console.log("Navegación explícita, avance, cancelación, reintento y error de motor anterior: ok (IPC simulado)");
process.exit(0);
