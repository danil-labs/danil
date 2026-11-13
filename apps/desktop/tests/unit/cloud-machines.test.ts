import assert from "node:assert/strict";
import { test } from "node:test";
import { createCloudMachines, edgeFetch } from "../../src/features/machines/cloud-machines.ts";

const machine = { machine_id: "cmp_1", name: "Danil", state: "running", connection: "connected" };

test("las llamadas van por danil_edge_fetch con la ruta y sin token", async () => {
  const calls: { command: string; args?: Record<string, unknown> }[] = [];
  const cloud = createCloudMachines(async (command, args) => {
    calls.push({ command, args });
    return args?.path === "/v1/capabilities" ? { items: [{ name: "machines", status: "available" }] } : { items: [machine] };
  });
  const rows = await cloud.rows();
  assert.equal(rows.available, true);
  assert.equal(rows.renewInChannel, false);
  assert.equal(rows.computers[0].state, "online");
  assert.deepEqual(calls.map((c) => [c.command, c.args?.method, c.args?.path]), [["danil_edge_fetch", "GET", "/v1/capabilities"], ["danil_edge_fetch", "GET", "/v1/machines"]]);
  assert.ok(!JSON.stringify(calls).toLowerCase().includes("bearer"));
});

test("sin la capacidad «machines» no se llama y se reintenta solo (no disponible)", async () => {
  const paths: unknown[] = [];
  const cloud = createCloudMachines(async (_c, args) => {
    paths.push(args?.path);
    return { items: [{ name: "machines", status: "unavailable" }] };
  });
  assert.deepEqual(await cloud.rows(), { available: false, computers: [], renewInChannel: false });
  assert.deepEqual(paths, ["/v1/capabilities"]);
});

test("not_available_yet y no_session se vuelven 501 y 401", async () => {
  const f = (detail: string) => edgeFetch(async () => Promise.reject({ detail }));
  assert.equal((await f("not_available_yet")("https://x/v1/machines")).status, 501);
  assert.equal((await f("no_session")("https://x/v1/machines")).status, 401);
  assert.equal((await f("unavailable")("https://x/v1/machines")).status, 503);
});

test("403 organization_selection_required llega al selector con la forma de Rust", async () => {
  const seen: unknown[] = [];
  const error = { detail: "organization_selection_required", status: 403 };
  const reply = await edgeFetch(async () => Promise.reject(error), (e) => seen.push(e))("https://x/v1/machines");
  assert.equal(reply.status, 403);
  assert.deepEqual(seen, [error]);
});
