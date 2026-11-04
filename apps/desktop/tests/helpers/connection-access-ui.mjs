import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// QA_DESKTOP_DIR allows reviewing another checkout without copying its build.
const desktop = process.env.QA_DESKTOP_DIR ?? resolve(import.meta.dirname, "../..");
const { boot, sleep } = await import(pathToFileURL(resolve(desktop, "tests/helpers/jsdom-app.mjs")));
const scenario = process.argv[2] ?? "retry";
const patches = [];
let connectionReads = 0;
let fail = scenario === "retry";
let loadFail = scenario === "capabilities-failure" || scenario === "inventory-failure";
const feature = ["multi", "multi-root", "feature-limit", "capabilities-failure", "inventory-failure"].includes(scenario);
const capabilities = { features: ["external_connection_destinations_v1"], limits: { max_destinations: scenario === "feature-limit" ? 2 : 64, max_destination_bindings: 32 } };
let connection = {
  id: "qa-connection", client_id: "qa", client_name: "QA fixture", state: "pending", permission_mode: null,
  machines: [], limits: { tasks_per_day: 10, concurrent_calls: 2 }, webhook: null,
  created_at: 1, updated_at: 1, last_used_at: null, usage: { day: "fixture", tasks_created: 0 },
};
let computers = [{ computer_id: "m1", name: "Fixture machine", state: "online", workspaces: ["w1", "w2", "unknown"] }];
if (scenario === "existing") {
  connection = { ...connection, state: "paused", machines: [{ computer_id: "missing-machine", workspace: "missing-workspace", folder: "keep-folder", root: "/fixture" }] };
}
if (["root", "root-null", "multi-root", "paused-zero", "active-zero"].includes(scenario)) {
  connection = { ...connection, state: "active", permission_mode: "manual", machines: [{ computer_id: "m1", workspace: "w1", folder: "keep-folder", root: "/fixture" }] };
  if (scenario === "root-null") connection.machines[0].root = null;
  if (scenario === "paused-zero") connection.state = "paused";
}
if (scenario === "limit") computers = Array.from({ length: 33 }, (_, i) => ({ computer_id: `m${i}`, state: "offline", workspaces: ["w1"] }));
if (scenario === "empty") computers = [];
globalThis.fetch = async (url, opts = {}) => {
  const path = new URL(String(url)).pathname;
  if (path === "/v1/connections" && !opts.method?.includes("PATCH")) { connectionReads++; return Response.json([connection]); }
  if (path === "/v1/connections/capabilities") {
    if (loadFail && scenario === "capabilities-failure") return Response.json({}, { status: 503 });
    return feature ? Response.json(capabilities) : Response.json({}, { status: 404 });
  }
  if (path === "/v1/computers") return loadFail && scenario === "inventory-failure" ? Response.json({}, { status: 503 }) : Response.json(computers);
  if (path === "/v1/connections/qa-connection" && opts.method === "PATCH") {
    const patch = JSON.parse(opts.body);
    patches.push(patch);
    if (fail) return Response.json({ error: "fixture_failure" }, { status: 500 });
    connection = { ...connection, ...patch };
    return Response.json(connection);
  }
  throw new Error(`Unexpected network request: ${opts.method ?? "GET"} ${url}`);
};
const workspace = { workspaces: [{ id: "fixture-a", name: "A" }], active: "fixture-a" };
const app = await boot("listo", `connection-access-${scenario}`, {
  launcher_state: { phase: "ready", blank_0274: false }, setup_required: false,
  list_language_packs: [], list_bundled_language_packs: [], window_ready: null, window_vitals: null,
  list_workspaces: workspace, workspaces_startup: workspace,
  list_projects: [], list_sources: [], list_live_sessions: [], list_live_turns: [], list_providers: [],
  list_models: { models: [], fallback: false }, tasks_awaiting_quota: [],
  list_local_orchestrators: [], account_relay_token: { token: "fake-token", expires_at: 9999999999, endpoint: "https://qa.invalid" },
  service_poll: { cursor: 0, gap: false, replay: false, runtime: "fixture", reset: false },
}, undefined, {}, { workspaces: [{ id: "w1", name: "Same" }, { id: "w2", name: "Same" }] });
const doc = app.w.document;
const button = text => [...doc.querySelectorAll("button")].findLast(b => b.textContent.trim() === text || b.getAttribute("aria-label") === text);
async function waitFor(read, message) {
  for (let i = 0; i < 100; i++) { if (read()) return; await sleep(30); }
  assert.fail(message);
}
async function click(text) {
  await waitFor(() => button(text), `Missing button ${text}`);
  assert.equal(button(text).disabled, false, `Disabled button ${text}`);
  button(text).click(); await sleep(70);
}
const boxes = () => [...doc.querySelectorAll('fieldset input[type="checkbox"]')];
async function toggle(index) {
  const box = boxes()[index];
  box.checked = !box.checked;
  box.dispatchEvent(new app.w.Event("change", { bubbles: true }));
  await sleep(20);
}
await click("Configuración");
// Settings entry is named by the current catalog.
const settingsButton = [...doc.querySelectorAll("button")].find(b => /Conexiones|Conectar herramientas/.test(b.textContent));
assert.ok(settingsButton, `Missing connections entry: ${doc.body.textContent}`);
settingsButton.click();
if (loadFail) {
  await waitFor(() => button("Reintentar"), "Missing load retry");
  assert.equal(button("Configurar acceso"), undefined, "Failed capability/inventory load must block grant editor");
  assert.equal(patches.length, 0);
  loadFail = false;
  await click("Reintentar");
}
await click("Configurar acceso");
await waitFor(() => doc.body.textContent.includes("Modo de aprobación"), "Editor did not mount");
if (scenario === "empty") {
  assert.equal(boxes().length, 0); assert.equal(button("Activar").disabled, true);
} else if (scenario === "limit") {
  assert.equal(boxes().length, 33); assert.ok(boxes().every(b => b.checked));
  assert.equal(button("Activar").disabled, true);
  await toggle(32); assert.equal(button("Activar").disabled, false);
  await click("Activar"); assert.equal(patches[0].machines.length, 32);
} else if (scenario === "existing") {
  assert.ok(doc.body.textContent.includes("missing-workspace"));
  assert.ok(doc.body.textContent.includes("keep-folder"));
  const mode = [...doc.querySelectorAll("select")].find(s => [...s.options].some(o => o.textContent.includes("Usar el modo")));
  assert.equal(mode.value, ""); assert.equal(mode.disabled, true);
  await click("Guardar cambios");
  assert.deepEqual(patches[0], { machines: [{ computer_id: "missing-machine", workspace: "missing-workspace", folder: "keep-folder" }] });
  assert.equal(connection.state, "paused"); assert.equal(connection.permission_mode, null);
} else if (scenario === "multi-root") {
  assert.deepEqual(boxes().map(b => b.disabled), [false, false, false]);
  await toggle(1);
  await click("Guardar cambios");
  assert.deepEqual(patches[0], { machines: [{ computer_id: "m1", workspace: "w1", folder: "keep-folder" }, { computer_id: "m1", workspace: "w2" }] });
} else if (scenario === "paused-zero" || scenario === "active-zero") {
  await toggle(0);
  if (scenario === "paused-zero") {
    await click("Guardar cambios");
    assert.deepEqual(patches[0], { machines: [] });
    assert.equal(connection.state, "paused");
  } else assert.equal(button("Guardar cambios").disabled, true);
} else if (scenario === "root" || scenario === "root-null") {
  assert.deepEqual(boxes().map(b => b.disabled), [false, true, true]);
  await toggle(0); assert.equal(button("Guardar cambios").disabled, true);
  await toggle(0); await click("Guardar cambios");
  assert.deepEqual(patches[0], { machines: [{ computer_id: "m1", workspace: "w1", folder: "keep-folder" }] });
} else if (feature) {
  assert.equal(boxes().length, 3); assert.ok(boxes().every(b => b.checked));
  assert.equal(button("Activar").disabled, scenario === "feature-limit");
  await toggle(2);
  assert.equal(button("Activar").disabled, false);
  await click("Activar");
  assert.deepEqual(patches[0], { machines: [{ computer_id: "m1", workspace: "w1" }, { computer_id: "m1", workspace: "w2" }], permission_mode: "manual", state: "active" });
} else {
  assert.equal(boxes().length, 3); assert.ok(boxes().every(b => b.checked));
  assert.ok(doc.body.textContent.includes("Same (w1)")); assert.ok(doc.body.textContent.includes("Same (w2)"));
  assert.ok(doc.body.textContent.includes("unknown")); assert.equal(button("Activar").disabled, true);
  await toggle(1); await toggle(2);
  await toggle(0); assert.equal(button("Activar").disabled, true);
  await toggle(0);
  await click("Cancelar"); assert.equal(patches.length, 0);
  await click("Configurar acceso"); assert.ok(boxes().every(b => b.checked), "Cancel must discard draft");
  await toggle(1); await toggle(2);
  const trigger = button("Configurar acceso");
  const readsBefore = connectionReads;
  await click("Activar");
  assert.deepEqual(patches[0], { machines: [{ computer_id: "m1", workspace: "w1" }], permission_mode: "manual", state: "active" });
  if (scenario === "retry") {
    await waitFor(() => doc.body.textContent.includes("No se pudo completar"), "Missing save failure");
    assert.equal(boxes().length, 3, "Failed save must keep editor mounted for retry");
    assert.deepEqual(boxes().map(b => b.checked), [true, false, false], "Failed save must retain draft selection");
    assert.equal(connectionReads, readsBefore, "Failed PATCH must not reload connections");
    fail = false; await click("Activar"); assert.equal(patches.length, 2);
    assert.deepEqual(patches[1], patches[0]);
  }
  assert.ok(connectionReads > readsBefore, "Successful PATCH must reload connections");
  assert.equal(button("Configurar acceso"), trigger, "Successful reload must preserve the connection row");
  assert.equal(boxes().length, 0, "Successful save must close the editor");
  assert.equal(doc.activeElement, trigger, "Successful save must restore trigger focus");
  assert.ok([...doc.querySelectorAll('[role="status"]')].some(p => p.textContent.includes("Selección guardada.")), "Successful save must retain confirmation after reload");
}
console.log(`PASS ${scenario}: ${JSON.stringify(patches)}`);
process.exit(0);
