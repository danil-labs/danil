/** Storage keeps its machine and workspace and never waits for an offline VM. Mounts `dist-web/`. */
import assert from "node:assert/strict";
import test from "node:test";
import { sleep } from "../helpers/jsdom-app.mjs";
import { MAC, SAME, VM, open, table, until } from "../helpers/web-machines.mjs";

test("storage keeps its machine and workspace and never waits for an offline VM", async () => {
  const storage = (bytes) => ({ bytes, tareas: [], compartido: [], sueltos: [], recuperable: 0, medido_en: 1, aviso: null });
  const resources = { measured_at: 1, storage: [{ id: "volume", total_bytes: 1000, free_bytes: 400, available_bytes: 300, terminus_bytes: null, attribution: "unknown" }] };
  const { app, invoke, calls, f } = await open("web-storage-target", [VM, MAC], {
    cmp_vm: { state: "offline", table: table("Panel", "Tarea VM", { list_storage: storage(111) }) },
    cmp_mac: { table: table("Notas", "Tarea Mac", {
      list_storage: storage(222), reclaim_storage: { bytes: 1, cuantos: 1, detalle: "" },
      empty_build_cache: { bytes: 2, cuantos: 1, detalle: "" }, collect_orphans: { bytes: 3, cuantos: 1, detalle: "" },
      list_workspaces: (_args, call) => ({ workspaces: [SAME], active: "w", ...(call.workspace === null ? { machine_resources: resources } : {}) }),
    }) },
  });
  const target = { headers: { "x-terminus-machine": "cmp_mac", "x-terminus-workspace": "w" } };
  assert.equal((await invoke("list_storage", { refrescar: true }, target)).bytes, 222);
  f.relays.cmp_vm.setState("online");
  await invoke("set_active_workspace", { id: "another" });
  f.relays.cmp_vm.setState("offline");
  assert.equal((await invoke("list_storage", { refrescar: false }, target)).bytes, 222);
  assert.equal(calls("cmp_mac", "list_storage").at(-1).workspace, "w", "a captured workspace survives a later selection");
  for (const command of ["reclaim_storage", "empty_build_cache", "collect_orphans"]) {
    await invoke(command, command === "reclaim_storage" ? { session: "cmp_mac~t1", project: "p1", rutas: [] } : {}, target);
    assert.equal(calls("cmp_mac", command).at(-1).workspace, "w");
    assert.equal(calls("cmp_vm", command).length, 0);
  }
  assert.deepEqual((await invoke("list_workspaces", {}, target)).machine_resources, resources);
  assert.equal(calls("cmp_mac", "list_workspaces").at(-1).workspace, null);
  const joined = await invoke("list_workspaces");
  assert.equal(joined.machine_resources, undefined, "a merged startup never labels one machine as all machines");
  assert.deepEqual(joined.machine_resources_by_machine.cmp_mac, resources);
  await sleep(31000);
  const cached = JSON.parse(app.w.localStorage.getItem("terminus-fleet:slices:v1") ?? "{}");
  assert.ok(Object.keys(cached).some((key) => key.includes("list_workspaces")), "the listing itself is persisted");
  for (const entry of Object.values(cached)) assert.equal(JSON.parse(entry.value)?.machine_resources, undefined, "machine resources stay in memory");
  await assert.rejects(invoke("list_storage", { refrescar: true }, { headers: { "x-terminus-machine": "cmp_vm", "x-terminus-workspace": "w" } }), (e) => e.detail === "machine_off");
  assert.equal(calls("cmp_vm", "list_storage").length, 0, "an offline machine is not asked to measure");
  await assert.rejects(invoke("collect_orphans", {}, { headers: { "x-terminus-machine": "missing" } }), (e) => e.detail === "unknown_machine");
  await assert.rejects(invoke("reclaim_storage", { session: "cmp_vm~t1", project: "p1", rutas: [] }, target), (e) => e.detail === "cross_machine");
  f.relays.cmp_mac.setState("offline");
  await assert.rejects(invoke("collect_orphans", {}, target), (e) => e.detail === "machine_off");
  assert.equal(calls("cmp_mac", "collect_orphans").length, 1, "cleanup is never queued while off");
  f.relays.cmp_mac.setState("online");
  const trigger = app.w.document.querySelector('button[aria-label="Máquinas"]');
  assert.ok(trigger);
  trigger.click();
  assert.ok(await until(() => app.w.document.querySelector('[data-machine-card="cmp_mac"]')));
  const measured = calls("cmp_mac", "list_storage").length;
  f.relays.cmp_mac.setState("offline");
  assert.ok(await until(() => app.w.document.querySelector('[data-machine-card="cmp_mac"]')?.querySelector("[data-machine-power]")?.textContent.includes("Apagada")), "the open panel follows relay state without interaction");
  assert.equal(calls("cmp_mac", "list_storage").length, measured, "a status transition does not scan storage");
  trigger.click();
  assert.deepEqual(app.failures, []);
});

/** The account's registry: `w` (and any other given) on the machines named. */
