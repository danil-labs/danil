import assert from "node:assert/strict";
import test from "node:test";
import { fleet } from "../helpers/fake-relay.mjs";
import { boot, sleep } from "../helpers/jsdom-app.mjs";
import { HOME, local, localNewTask, remote, SESSION_A, SESSION_B, TOKEN, until, write } from "../helpers/desktop-account.mjs";

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const cloud = (id = "cmp_cloud", name = "Nube") => ({ machine_id: id, name, state: "running", connection: "connected" });
const ok = (items = [cloud()]) => ({ status: 200, body: { items } });
const picker = app => app.w.document.querySelector('[aria-label="Ejecutar en"]');
const connecting = app => app.w.document.querySelector('[data-machine-connecting]');
const rows = app => app.w.__TAURI_INTERNALS__.invoke("machine_list");
const changed = (app, name = "harness:account-computers") => app.w.dispatchEvent(new app.w.CustomEvent(name));
async function mount(name, read, { remembered = false, extra = {}, signed = false, nativeList, relay = () => Response.json({ computers: [HOME] }) } = {}) {
  let requests = 0;
  const sends = [];
  const f = fleet({ cmp_cloud: { state: "online", table: remote("Nube", "Tarea nube", { send_message: args => { sends.push(args); return "t9"; } }) }, cmp_b: { state: "online", table: remote("B", "Tarea B") } });
  const app = await boot("listo", `i90-${name}`, { ...local([], {
    danil_connect_status: { state: "disconnected", online: false }, guest_machine_list: [],
    ...(signed ? { danil_sessions: [SESSION_A], danil_workspace_account: { account: SESSION_A.account }, account_relay_token: TOKEN } : {}),
    ...(nativeList ? { machine_list: nativeList } : {}),
    danil_edge_fetch: async ({ path }) => {
      if (path === "/v1/capabilities") return { status: 200, body: { contract: "mvp-v1", items: [{ name: "machines", version: 1, status: "available" }] } };
      if (path.endsWith("/tickets")) return { status: 201, body: { ticket: "qa", url: `wss://machines-session.danil.ai/v1/machines/${path.split("/")[3]}/session`, session_expires_at: new Date(Date.now() + 60000).toISOString() } };
      if (path === "/v1/machines") return read(++requests);
      return { status: 404, body: null };
    }, ...extra,
  }), ...(extra.send_message ? { send_message: extra.send_message } : {}) }, undefined, remembered ? { "harness.layout.machines.run_on": JSON.stringify({ w: "cmp_cloud" }) } : {}, { beforeImport: () => {
    globalThis.WebSocket = class { constructor(url, protocols) { return new f.Socket(url.replace("/v1/machines/", "/v1/computers/"), protocols); } };
    const previous = globalThis.fetch;
    const fetch = (url, init) => String(url).startsWith("https://relay.test/v1/computers") ? Promise.resolve(relay()) : previous(url, init);
    fetch.__jsdomApp = true;
    globalThis.fetch = fetch;
  } });
  assert.ok(await until(() => localNewTask(app.w.document)), "composer local disponible");
  localNewTask(app.w.document).click();
  await sleep(50);
  return { app, f, sends, requests: () => requests };
}
function watch(app) {
  const seen = [];
  const sample = () => seen.push({ picker: !!picker(app), connecting: !!connecting(app) });
  const observer = new app.w.MutationObserver(sample);
  observer.observe(app.w.document.body, { subtree: true, childList: true, characterData: true });
  sample();
  return { seen, stop: () => observer.disconnect() };
}
async function has(app, id) {
  if (!app.w.document.querySelector('[data-machine-option]')) picker(app)?.click();
  return !!app.w.document.querySelector(`[data-machine-option="${id}"]`);
}
async function ready(app) {
  assert.ok(await until(() => picker(app)));
  if (!app.w.document.querySelector('[data-machine-option]')) picker(app).click();
  assert.ok(await until(() => app.w.document.querySelector('[data-machine-option="cmp_cloud"]')), "flota instalada");
  await sleep(150); picker(app).click(); picker(app).click(); await sleep(50);
}

test("C1 R: inicial pendiente sin recordada conserva local y no monta selector", async () => {
  const gate = deferred(); const { app } = await mount("C1", () => gate.promise);
  const observed = watch(app);
  await sleep(3000);
  const localAvailable = (await rows(app)).some(row => row.local && row.on);
  gate.resolve(ok([])); await sleep(100); observed.stop();
  assert.ok(localAvailable);
  assert.ok(observed.seen.every(s => !s.picker && !s.connecting), "inventario inicial no convierte local en Conectando ni monta selector");
  assert.deepEqual(app.failures, []);
});

test("C2 R: refresh 503 y retry silenciosos conservan lista y recuperan nombre", async () => {
  const gate = deferred(); const recovery = deferred();
  const { app, requests } = await mount("C2", n => n === 1 ? ok() : n === 2 ? gate.promise : recovery.promise);
  await ready(app);
  assert.ok(await until(() => app.w.document.querySelector('[data-machine-option="cmp_cloud"]')));
  const observed = watch(app); changed(app); assert.ok(await until(() => requests() === 2));
  await sleep(3000); gate.resolve({ status: 503, body: null });
  assert.ok(await until(() => requests() > 2));
  const kept = await has(app, "cmp_cloud");
  recovery.resolve(ok([cloud("cmp_cloud", "Recuperada")]));
  assert.ok(await until(() => app.w.document.querySelector('[data-machine-option="cmp_cloud"]')?.textContent.includes("Recuperada")));
  observed.stop();
  assert.ok(kept); assert.ok(await has(app, "cmp_cloud"));
  assert.ok(observed.seen.every(s => !s.connecting), "la elegida local nunca pasa a Conectando");
  assert.deepEqual(app.failures, []);
});

test("C3 R: una local con inventario resuelto no monta selector durante refresh y fallo", async () => {
  const gate = deferred(); const retry = deferred();
  const { app, requests } = await mount("C3", n => n === 1 ? ok([]) : n === 2 ? gate.promise : retry.promise);
  assert.ok(await until(() => requests() === 1));
  const observed = watch(app); changed(app); assert.ok(await until(() => requests() === 2));
  await sleep(3000); gate.resolve({ status: 503, body: null });
  assert.ok(await until(() => requests() > 2)); retry.resolve(ok([])); await sleep(100); observed.stop();
  assert.ok(observed.seen.every(s => !s.picker), "MutationObserver nunca vio el selector");
  assert.deepEqual(app.failures, []);
});

for (const retrying of [false, true]) test(`${retrying ? "C5" : "C4"} G: recordada inicial ${retrying ? "503 y retry" : "pendiente"} muestra Conectando y luego su nombre`, async () => {
  const gate = deferred();
  const { app, requests } = await mount(retrying ? "C5" : "C4", n => retrying && n === 1 ? { status: 503, body: null } : gate.promise, { remembered: true });
  if (retrying) assert.ok(await until(() => requests() > 1));
  const initial = !!connecting(app);
  gate.resolve(ok()); await ready(app);
  assert.ok(initial, "no finge la local");
  assert.ok(await until(() => picker(app)?.textContent.includes("Nube")));
  assert.deepEqual(app.failures, []);
});

test("C6 G: la máquina elegida muestra Conectando mientras el canal aún no tiene estado", async () => {
  const app = await boot("listo", "desktop-machine-channel-connecting", local([], {
    danil_connect_status: { state: "disconnected", online: false },
    guest_machine_list: [],
    machine_list: [
      { id: "local", local: true, active: false, on: true, hosts: true },
      { id: "cmp_wait", local: false, active: true, on: false, connection: "unknown", hosts: true },
    ],
  }));
  const doc = app.w.document;
  localNewTask(doc).click();
  assert.ok(await until(() => doc.querySelector('[data-machine-connecting]'), 500));
  assert.match(doc.querySelector('[data-machine-connecting]').textContent, /Conectando…/);
  const picker = doc.querySelector('[aria-label="Ejecutar en"]');
  picker.click();
  assert.ok(await until(() => doc.querySelector('[data-machine-option="cmp_wait"]')));
  assert.match(doc.querySelector('[data-machine-option="cmp_wait"]').textContent, /Conectando…/);
  assert.ok(!doc.querySelector('[data-machine-option="cmp_wait"]').textContent.includes("apagada"));
  assert.deepEqual(app.failures, []);
});


for (const late of [200, 503]) for (const event of ["danil-sessions", "danil-connect", "danil:organization-changed"]) test(`${event === "danil-sessions" ? "C7" : event === "danil-connect" ? "C7b" : "C9"} R: ${event} invalida respuesta tardía ${late}`, async () => {
  const stale = deferred(); const current = deferred(); let account = SESSION_A;
  const { app, requests } = await mount(`${event}-${late}`, n => event === "danil:organization-changed" && n === 1 ? ok() : n === (event === "danil:organization-changed" ? 2 : 1) ? stale.promise : current.promise, { signed: event === "danil-sessions", extra: event === "danil-sessions" ? {
    danil_sessions: () => [account], danil_workspace_account: () => ({ account: account.account }),
  } : {} });
  const expected = event === "danil:organization-changed" ? 3 : 2;
  if (expected === 3) { await ready(app); changed(app); assert.ok(await until(() => requests() === 2)); }
  account = SESSION_B;
  if (event.startsWith("danil:")) changed(app, event); else app.emit(event, {});
  const readNewBeforeOld = await until(() => requests() === expected, 1000);
  current.resolve(ok([cloud("cmp_b", "B")])); await sleep(100);
  stale.resolve(late === 200 ? ok() : { status: 503, body: null });
  await sleep(1500);
  assert.ok(readNewBeforeOld, "la nueva época lee sin reutilizar ni esperar la lectura anterior");
  assert.ok(await until(() => picker(app)));
  if (!app.w.document.querySelector('[data-machine-option]')) picker(app).click();
  assert.ok(await until(() => app.w.document.querySelector('[data-machine-option="cmp_b"]'))); assert.ok(!(await has(app, "cmp_cloud")));
  assert.equal(requests(), expected, "la respuesta vieja no arma retry");
  assert.ok(!connecting(app), "B no vuelve a initial");
  assert.deepEqual(app.failures, []);
});

for (const status of [401, 404]) test(`C8 G: ${status} vacía nube y vuelve a local`, async () => {
  const { app } = await mount(`C8-${status}`, n => n === 1 ? ok() : { status, body: null }, { remembered: true });
  await ready(app); changed(app);
  assert.ok(await until(() => !picker(app)), "desaparece la nube");
  assert.ok(!(await has(app, "cmp_cloud"))); assert.ok((await rows(app)).some(row => row.local && row.active));
  assert.deepEqual(app.failures, []);
});

test("C10 R: harness:workspace no reinicia inventario ni selección", async () => {
  const gate = deferred(); const { app, requests } = await mount("C10", n => n === 1 ? ok() : gate.promise, { remembered: true });
  await ready(app);
  app.w.document.querySelector('[data-machine-option="cmp_cloud"]').click();
  assert.ok(await until(() => picker(app)?.textContent.includes("Nube")));
  const observed = watch(app); changed(app, "harness:workspace"); assert.ok(await until(() => requests() > 1));
  const kept = await has(app, "cmp_cloud"); await sleep(100); gate.resolve(ok()); await sleep(100); observed.stop();
  assert.ok(kept); assert.ok(observed.seen.every(s => !s.connecting));
  assert.match(picker(app).textContent, /Nube/); assert.deepEqual(app.failures, []);
});

test("C11 R: envío inicial respeta cabecera recordada y falla explícitamente sin enviar local", async () => {
  const gate = deferred(); const sends = [];
  const { app, f } = await mount("C11", () => gate.promise, { remembered: true, extra: {
    send_message: (args, options) => { sends.push({ args, options }); if (options?.headers?.["x-terminus-machine"]) throw { what: "unknown_machine", detail: "unknown_machine" }; return "t1"; },
  } });
  await write(app, "Prueba inicial");
  const initial = sends.slice();
  gate.resolve(ok());
  assert.ok(await until(() => localNewTask(app.w.document)));
  localNewTask(app.w.document).click(); await ready(app);
  await write(app, "Prueba resuelta");
  assert.ok(await until(() => f.relays.cmp_cloud.calls.some(c => c.command === "send_message")));
  assert.equal(initial.length, 1);
  assert.equal(initial[0].options?.headers?.["x-terminus-machine"], "cmp_cloud", "la orden inicial nunca sale local");
});

test("C12 R: refetchMachines tardío nativo no reemplaza lista de flota", async () => {
  const stale = deferred(); let calls = 0;
  const { app } = await mount("C12", () => ok(), { nativeList: () => ++calls === 1 ? stale.promise : [{ id: "local", local: true, active: true, on: true, hosts: true }] });
  await ready(app);
  stale.resolve([{ id: "local", local: true, active: true, on: true, hosts: true }]); await sleep(100);
  assert.ok(picker(app)); assert.ok(await has(app, "cmp_cloud")); assert.deepEqual(app.failures, []);
});

test("C13 R: recordada remota ya resuelta no espera al inventario inicial", async () => {
  const gate = deferred();
  const { app, requests } = await mount("C13", () => gate.promise, { remembered: true, nativeList: [
    { id: "local", local: true, active: false, on: true, hosts: true },
    { id: "cmp_cloud", local: false, active: true, on: true, connection: "online", hosts: true },
  ] });
  assert.equal(requests(), 1, "el inventario inicial sigue pendiente");
  const waiting = !!connecting(app);
  const selected = picker(app)?.textContent;
  const remembered = JSON.parse(app.w.localStorage.getItem("harness.layout.machines.run_on")).w;
  picker(app).click();
  assert.ok(await until(() => app.w.document.querySelector('[data-machine-option="cmp_cloud"]')));
  const row = app.w.document.querySelector('[data-machine-option="cmp_cloud"]').textContent;
  gate.resolve(ok([])); await sleep(100);
  assert.equal(waiting, false, "la conexión conocida no se reemplaza por la lectura de inventario");
  assert.match(selected, /cmp_cloud/);
  assert.equal(remembered, "cmp_cloud");
  assert.match(row, /encendida/); assert.doesNotMatch(row, /Conectando/);
  assert.deepEqual(app.failures, []);
});

for (const order of ["old-first", "latest-first"]) test(`C14 R: whoAmI retenidos ${order} conservan la identidad más reciente`, async () => {
  const old = deferred(); const latest = deferred();
  let held = false; let identities = 0; let current = SESSION_A.account;
  const tokens = [];
  const { app } = await mount(`C14-${order}`, () => ok([current === SESSION_A.account ? cloud() : cloud("cmp_b", "B")]), { signed: true, extra: {
    danil_sessions: [SESSION_A, SESSION_B],
    danil_workspace_account: () => held ? (++identities === 1 ? old.promise : latest.promise) : { account: SESSION_A.account },
    account_relay_token: args => { current = args.account; tokens.push(current); return TOKEN(); },
  } });
  await ready(app);
  held = true;
  app.emit("danil-sessions", {}); app.emit("danil-sessions", {});
  assert.ok(await until(() => identities === 2), "ambas lecturas de identidad están retenidas");
  if (order === "old-first") old.resolve({ account: SESSION_B.account });
  else latest.resolve({ account: SESSION_A.account });
  await sleep(100);
  if (order === "old-first") latest.resolve({ account: SESSION_A.account });
  else old.resolve({ account: SESSION_B.account });
  await sleep(200);
  if (!app.w.document.querySelector('[data-machine-option]')) picker(app)?.click();
  assert.ok(await until(() => app.w.document.querySelector('[data-machine-option="cmp_cloud"]')), "la identidad vigente mantiene su flota");
  assert.equal(app.w.document.querySelector('[data-machine-option="cmp_b"]'), null);
  assert.deepEqual(tokens, [SESSION_A.account], "una identidad vieja no invalida la época ni pide token de otra cuenta");
  assert.deepEqual(app.failures, []);
});

test("C13b G: recordada resuelta con conexión unknown e inventario inicial sí muestra Conectando", async () => {
  const gate = deferred();
  const { app, requests } = await mount("C13b", () => gate.promise, { remembered: true, nativeList: [
    { id: "local", local: true, active: false, on: true, hosts: true },
    { id: "cmp_cloud", local: false, active: true, on: false, connection: "unknown", hosts: true },
  ] });
  assert.equal(requests(), 1, "el inventario inicial sigue pendiente");
  const waiting = !!connecting(app);
  gate.resolve(ok([])); await sleep(100);
  assert.equal(waiting, true, "sin estado del canal la elegida espera aunque la fila esté resuelta");
  assert.deepEqual(app.failures, []);
});

// H1 (#97): una salida definitiva de check() resuelve el inventario; si no, «Conectando…» y la cabecera al cmp_cloud ausente quedan para siempre.
const DENIED = {
  license: { relay: () => Response.json({ error: { code: "license_required" } }, { status: 403 }) },
  unauthorized: { relay: () => Response.json({ error: { code: "unauthorized" } }, { status: 401 }) },
  // El token vale lo justo para no guardarse: cada comprobación lo vuelve a pedir y el fallo llega también tras el evento.
  token: { token: () => { throw Object.assign(new Error("command"), { detail: "command" }); }, fresh: () => ({ ...TOKEN(), expires_at: Date.now() }) },
};
for (const when of ["start", "danil:organization-changed"]) for (const [kind, deny] of Object.entries(DENIED)) test(`C15 G: ${kind} en ${when} resuelve inventario y envía local`, async () => {
  let denied = when === "start"; const sends = [];
  const { app } = await mount(`C15-${kind}-${when}`, () => ok(), { signed: true, remembered: true,
    relay: () => denied && deny.relay ? deny.relay() : Response.json({ computers: [HOME] }),
    extra: {
      account_relay_token: () => denied && deny.token ? deny.token() : (deny.fresh ?? TOKEN)(),
      send_message: (args, options) => { sends.push({ args, options }); if (options?.headers?.["x-terminus-machine"] === "cmp_cloud") throw { what: "unknown_machine", detail: "unknown_machine" }; return "t1"; },
    } });
  if (when !== "start") {
    await ready(app);
    app.w.document.querySelector('[data-machine-option="cmp_cloud"]').click();
    assert.ok(await until(() => picker(app)?.textContent.includes("Nube")), "la nube elegida");
    denied = true; changed(app, when);
    assert.ok(await until(() => !app.w.document.querySelector('[data-machine-option="cmp_cloud"]') && !picker(app)?.textContent.includes("Nube")), "desaparece la nube");
  }
  await sleep(500);
  const waiting = !!connecting(app);
  const remembered = JSON.parse(app.w.localStorage.getItem("harness.layout.machines.run_on") ?? "{}").w;
  await write(app, "Tras la salida");
  assert.ok(await until(() => sends.length > 0), "la orden sale");
  assert.equal(remembered, "cmp_cloud", "la recordada sigue siendo la nube ausente");
  // Sin «Conectando…» por inventario y sin cabecera al cmp_cloud ausente: la orden cae a la activa, la local (`draftMachine`).
  assert.deepEqual({ connecting: waiting, machine: sends[0].options?.headers?.["x-terminus-machine"] ?? null }, { connecting: false, machine: "local" });
  assert.deepEqual(app.failures, []);
});
