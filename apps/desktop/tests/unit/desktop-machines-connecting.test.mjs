import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";
import { local, localNewTask, until } from "../helpers/desktop-account.mjs";

for (const status of [200, 503]) test(`Desk muestra Conectando… durante /v1/machines (3 s, HTTP ${status}) y conserva la local`, async () => {
  let requested = false;
  const responses = local([], {
    danil_connect_status: { state: "disconnected", online: false },
    guest_machine_list: [],
    danil_edge_fetch: async ({ path }) => {
      if (path === "/v1/capabilities") return { status: 200, body: { items: [{ name: "machines", status: "available" }] } };
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
