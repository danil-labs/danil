import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";
import { fleet, engine } from "../helpers/fake-relay.mjs";
import { open, HOME, VM, remote, until } from "../helpers/desktop-account.mjs";

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const machine = id => ({ machine_id: id, name: id, state: "running", connection: "connected" });
async function web(t, name, { state = "online" } = {}) {
  const f = fleet({ m1: { state, table: { ...engine, list_workspaces: { workspaces: [{ id: "11", name: "W", context_root: null }], active: "11" }, workspaces_startup: { workspaces: [{ id: "11", name: "W", context_root: null }], active: "11" } } }, m2: { state, table: { ...engine, list_workspaces: { workspaces: [{ id: "11", name: "W", context_root: null }], active: "11" }, workspaces_startup: { workspaces: [{ id: "11", name: "W", context_root: null }], active: "11" } } } });
  let read = () => Response.json({ items: [machine("m1"), machine("m2")] });
  let reads = 0;
  const fetcher = async (input) => {
    const url = new URL(String(input));
    if (url.origin === "http://localhost" && url.pathname.includes("/assets/")) return new Response("");
    if (url.pathname === "/v1/capabilities") return Response.json({ contract: "mvp-v1", items: ["machines", "machines.start", "machines.session", "workspaces"].map(name => ({ name, version: 1, status: "available" })) });
    if (url.pathname === "/v1/identity/me") return Response.json({ id: "user_A", name: "Operator", workspace: "11", organizations: [] });
    if (url.pathname === "/v1/workspaces") return Response.json({ items: [{ id: "11", org: "org_A", name: "W", role: "owner" }], next_cursor: null });
    if (url.pathname === "/v1/identity/csrf") return Response.json({ csrf_token: "bound" });
    if (url.pathname === "/v1/machines") { reads++; return read(); }
    const ticket = /^\/v1\/machines\/([^/]+)\/tickets$/.exec(url.pathname);
    if (ticket) return Response.json({ ticket: "one-use", url: `wss://connect.danil.ai/v1/machines/${ticket[1]}/session`, expires_at: "2099-01-01T00:00:00Z" });
    return new Response(null, { status: 404 });
  };
  fetcher.__jsdomApp = true;
  globalThis.fetch = fetcher;
  const app = await boot("listo", `i90-web-${name}`, {}, undefined, {}, { web: true, beforeImport(w) {
    w.WebSocket = globalThis.WebSocket = class { constructor(url, protocols) { return new f.Socket(url.replace("/v1/machines/", "/v1/computers/"), protocols); } };
  } });
  t.after(() => app.w.dispatchEvent(new app.w.Event("pagehide")));
  assert.ok(await until(() => app.w.document.querySelector('[data-machine-row="m2"]')));
  assert.ok(await until(() => app.w.document.querySelector('[aria-label^="Nueva tarea en P1"]')));
  app.w.document.querySelector('[aria-label^="Nueva tarea en P1"]').click();
  assert.ok(await until(() => app.w.document.querySelector('button[aria-label="Proyecto"]')));
  app.w.document.querySelector('button[aria-label="Proyecto"]').click();
  const add = () => [...app.w.document.querySelectorAll("button")].find(b => b.textContent.trim().startsWith("Añadir un proyecto"));
  assert.ok(await until(add)); add().click();
  assert.ok(await until(() => app.w.document.querySelector('[data-create-on]')));
  await sleep(100);
  return { app, f, reads: () => reads, read: next => { read = next; } };
}

for (const failure of [503, "network", 408, 429]) test(`B1 R: web refresh ${failure} conserva flota y Crear en`, async t => {
  const { app, f, reads, read } = await web(t, `B1-${failure}`);
  const before = reads();
  read(() => { if (failure === "network") throw new TypeError("network"); return new Response(null, { status: failure }); });
  f.relays.m1.setState("offline");
  assert.ok(await until(() => reads() > before)); await sleep(150);
  assert.deepEqual((await app.w.__TAURI_INTERNALS__.invoke("machine_list")).map(m => m.id).sort(), ["m1", "m2"], "el router conserva la flota");
  assert.ok(app.w.document.querySelector('[data-create-on]'), "Crear en sigue montado");
  assert.ok(app.w.document.querySelector('[data-machine-row="m2"]'), "la flota no se vacía");
  assert.equal(app.w.document.querySelector('[data-machines-unavailable]'), null);
  read(() => Response.json({ items: [machine("m1"), machine("m2")] }));
  assert.deepEqual(app.failures, []);
});

test("B2 G: unknown a online no pasa por apagada", async t => {
  const { app, f } = await web(t, "B2");
  f.relays.m1.setState("unknown"); f.relays.m2.setState("unknown");
  const states = [];
  const sample = () => states.push(...[...app.w.document.querySelectorAll('[data-machine-row]')].map(row => row.dataset.state));
  const observer = new app.w.MutationObserver(sample); observer.observe(app.w.document.body, { attributes: true, subtree: true, childList: true }); sample();
  f.relays.m1.setState("online"); f.relays.m2.setState("online"); await sleep(150); sample(); observer.disconnect();
  assert.ok(!states.includes("offline"), states.join(","));
  assert.ok(app.w.document.querySelector('[data-create-on]')); assert.deepEqual(app.failures, []);
});

test("B3 G: refresh single-flight y list tardía tras close no escribe", async t => {
  const { app, f, reads, read } = await web(t, "B3");
  const gate = deferred(); const before = reads(); read(() => gate.promise);
  f.relays.m1.setState("offline"); f.relays.m2.setState("offline");
  assert.ok(await until(() => reads() > before)); await sleep(100);
  assert.equal(reads(), before + 1, "dos refresh comparten una lectura");
  app.w.dispatchEvent(new app.w.Event("pagehide"));
  await sleep(50);
  const afterClose = app.w.document.querySelector("#root").innerHTML;
  gate.resolve(Response.json({ items: [machine("late")] })); await sleep(150);
  assert.equal(app.w.document.querySelector("#root").innerHTML, afterClose, "list tardía no escribe después de close");
  assert.equal(app.w.document.querySelector('[data-machine-row="late"]'), null); assert.deepEqual(app.failures, []);
});

test("B4 G: Desk listComputers transitorio conserva lista previa", async () => {
  const { app } = await open("i90-B4", { computers: [HOME, { ...VM, state: "online" }], relays: { cmp_vm: { state: "online", table: remote("Panel", "Tarea") } } });
  assert.ok(app.w.document.querySelector('[data-sesion="cmp_vm~t1"]'));
  const previous = globalThis.fetch;
  let failed = false;
  const fetcher = (url, init) => {
    if (String(url).startsWith("https://relay.test/v1/computers")) { failed = true; return Promise.resolve(new Response(null, { status: 503 })); }
    return previous(url, init);
  };
  fetcher.__jsdomApp = true; globalThis.fetch = fetcher;
  app.w.dispatchEvent(new app.w.CustomEvent("harness:account-computers"));
  assert.ok(await until(() => failed)); await sleep(50);
  assert.ok(app.w.document.querySelector('[data-sesion="cmp_vm~t1"]')); assert.deepEqual(app.failures, []);
});

for (const [status, code] of [[401, null], [403, null], [404, null], [501, null], [403, "license_required"]]) test(`B5 G: lista válida seguida de ${status}/${code ?? "HTTP"} invalida la flota`, async t => {
  const { app, f, reads, read } = await web(t, `B5-${status}-${code}`);
  assert.deepEqual((await app.w.__TAURI_INTERNALS__.invoke("machine_list")).map(m => m.id).sort(), ["m1", "m2"], "parte de una flota válida");
  const before = reads();
  read(() => code ? Response.json({ code }, { status }) : new Response(null, { status }));
  f.relays.m1.setState("offline");
  assert.ok(await until(() => reads() > before)); await sleep(150);
  assert.deepEqual(await app.w.__TAURI_INTERNALS__.invoke("machine_list"), [], "una respuesta definitiva no conserva máquinas revocadas");
  if (status === 401) assert.equal(app.w.document.querySelector('[data-tira]'), null, "la sesión invalidada desmonta la ventana");
  else assert.ok(app.w.document.querySelector('[data-machines-unavailable]'), "la falta de acceso o de servicio es visible");
  assert.deepEqual(app.failures, []);
});
