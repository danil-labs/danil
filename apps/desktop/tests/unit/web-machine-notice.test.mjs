/** Beta: el aviso de máquinas sigue a la falta de acceso aunque naciera sin ella (de 8fe33191, B5 G de dev). */
import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";
import { fleet, engine } from "../helpers/fake-relay.mjs";
import { until } from "../helpers/desktop-account.mjs";

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


/** Reloj de los temporizadores largos (≥ 30 s, el sondeo de la sesión): se retienen y se disparan a demanda; los cortos siguen reales. */
function longTimers(t) {
  const real = globalThis.setTimeout;
  const held = [];
  globalThis.setTimeout = (fn, ms, ...args) => {
    if (!(ms >= 30_000)) return real(fn, ms, ...args);
    const entry = { fn, args, cleared: false, unref() { return this; }, ref() { return this; }, hasRef: () => false };
    held.push(entry);
    return entry;
  };
  const realClear = globalThis.clearTimeout;
  globalThis.clearTimeout = timer => (held.includes(timer) ? (timer.cleared = true) : realClear(timer));
  t.after(() => { globalThis.setTimeout = real; globalThis.clearTimeout = realClear; });
  return { fire: () => { for (const e of held.splice(0)) if (!e.cleared) e.fn(...e.args); } };
}

test("B5 G: el aviso de sin acceso se abre aunque el aviso naciera sin él, y se va con una lista válida", async t => {
  const clock = longTimers(t);
  const { app, f, reads, read } = await web(t, "B5-visible-after-mount");
  // El aviso ya está montado y la flota es válida: nace sin la falta de acceso.
  assert.ok(await until(() => app.w.document.querySelector("[data-web-sync]")));
  assert.equal(app.w.document.querySelector("[data-machines-unavailable]"), null);
  let before = reads();
  read(() => Response.json({ code: "license_required" }, { status: 403 }));
  f.relays.m1.setState("offline");
  assert.ok(await until(() => reads() > before));
  assert.ok(await until(() => app.w.document.querySelector("[data-machines-unavailable]")), "pasa de false a true y se ve");
  before = reads();
  read(() => Response.json({ items: [machine("m1"), machine("m2")] }));
  // Sin m1 en la flota nada local vuelve a leer: lo hace el sondeo de la sesión (window-session, POLL_MAX_MS).
  clock.fire();
  assert.ok(await until(() => reads() > before), "el sondeo vuelve a leer /v1/machines sin recargar");
  assert.ok(await until(() => app.w.document.querySelector('[data-machine-row="m2"]')));
  assert.ok(await until(() => app.w.document.querySelector("[data-machines-unavailable]") === null), "con una lista válida no se queda pegado");
  assert.deepEqual(app.failures, []);
});
