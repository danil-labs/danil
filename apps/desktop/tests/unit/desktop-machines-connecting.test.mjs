import assert from "node:assert/strict";
import test from "node:test";
import { fleet } from "../helpers/fake-relay.mjs";
import { boot, sleep } from "../helpers/jsdom-app.mjs";
import { local, localNewTask, remote, until } from "../helpers/desktop-account.mjs";

for (const status of [200]) test(`Desk muestra Conectando… durante /v1/machines (3 s, HTTP ${status}) y conserva la local`, async () => {
  let requested = false;
  const responses = local([], {
    danil_connect_status: { state: "disconnected", online: false },
    guest_machine_list: [],
    danil_edge_fetch: async ({ path }) => {
      if (path === "/v1/capabilities") return { status: 200, body: { contract: "mvp-v1", items: [{ name: "machines", version: 1, status: "available" }] } };
      if (path === "/v1/machines") {
        requested = true;
        await sleep(3000);
        return { status, body: { items: [] } };
      }
      return { status: 404, body: null };
    },
  });
  const app = await boot("listo", `desktop-machines-connecting-${status}`, responses);
  assert.ok(await until(() => requested), "Desk pide la lista por el borde");
  const doc = app.w.document;
  localNewTask(doc).click();
  assert.ok(await until(() => doc.querySelector('[data-machine-connecting]'), 500), "la espera de la lista es visible");
  assert.match(doc.querySelector('[data-machine-connecting]').textContent, /Conectando…/);
  assert.ok(!doc.body.textContent.includes("Máquinas no disponibles"));
  const during = await app.w.__TAURI_INTERNALS__.invoke("machine_list");
  assert.ok(during.some((row) => row.local && row.on), "la local ya está disponible durante la espera");
  assert.ok(await until(() => !doc.querySelector('[data-machine-connecting]'), 4000), "sale de Conectando cuando termina la lista");
  const rows = await app.w.__TAURI_INTERNALS__.invoke("machine_list");
  assert.ok(rows.some((row) => row.local && row.on), "la máquina local sigue disponible");
  assert.deepEqual(app.failures, []);
});

test("la máquina elegida muestra Conectando mientras el canal aún no tiene estado", async () => {
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

test("un 503 tras 3 s conserva Conectando y la máquina previa hasta recuperar la lista", async () => {
  let requests = 0;
  let failed = false;
  let recover;
  const recovery = new Promise(resolve => { recover = resolve; });
  const f = fleet({ cmp_cloud: { state: "online", table: remote("Nube", "Tarea nube") } });
  const machine = { machine_id: "cmp_cloud", name: "Nube", state: "running", connection: "connected" };
  const responses = local([], {
    danil_connect_status: { state: "disconnected", online: false }, guest_machine_list: [],
    danil_edge_fetch: async ({ path }) => {
      if (path === "/v1/capabilities") return { status: 200, body: { contract: "mvp-v1", items: [{ name: "machines", version: 1, status: "available" }] } };
      if (path.endsWith("/tickets")) return { status: 201, body: { ticket: "qa", url: "wss://machines-session.danil.ai/v1/machines/cmp_cloud/session", session_expires_at: new Date(Date.now() + 60000).toISOString() } };
      if (path === "/v1/machines") {
        requests++;
        if (requests === 2) { await sleep(3000); failed = true; return { status: 503, body: null }; }
        if (requests > 2) await recovery;
        return { status: 200, body: { items: [machine] } };
      }
      return { status: 404, body: null };
    },
  });
  const app = await boot("listo", "desktop-machine-transient", responses, undefined, {}, { beforeImport: () => { globalThis.WebSocket = class { constructor(url, protocols) { return new f.Socket(url.replace("/v1/machines/", "/v1/computers/"), protocols); } }; } });
  const doc = app.w.document;
  localNewTask(doc).click();
  assert.ok(await until(() => doc.querySelector('[aria-label="Ejecutar en"]')));
  doc.querySelector('[aria-label="Ejecutar en"]').click();
  const cloudRow = () => doc.querySelector('[data-machine-option="cmp_cloud"]');
  assert.ok(await until(cloudRow), "la nube se muestra antes del fallo");
  app.w.dispatchEvent(new app.w.CustomEvent("harness:account-computers"));
  assert.ok(await until(() => failed, 4000));
  await sleep(50);
  assert.match(app.w.document.querySelector('[data-machine-connecting]')?.textContent ?? "", /Conectando…/);
  assert.ok(cloudRow(), "un 503 no oculta la máquina conocida");
  assert.ok(await until(() => requests > 2, 4000), "reintenta sin esperar treinta segundos");
  recover();
  assert.ok(await until(() => !app.w.document.querySelector('[data-machine-connecting]'), 4000), "resuelve el estado al recuperarse");
  assert.ok(cloudRow());
  assert.deepEqual(app.failures, []);
});
