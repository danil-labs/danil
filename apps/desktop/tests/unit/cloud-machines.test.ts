import assert from "node:assert/strict";
import { test } from "node:test";
import { createCloudMachines, edgeFetch } from "../../src/features/machines/cloud-machines.ts";

const machine = { machine_id: "cmp_1", name: "Danil", state: "running", connection: "connected" };

test("las llamadas van por danil_edge_fetch con la ruta y sin token", async () => {
  const calls: { command: string; args?: Record<string, unknown> }[] = [];
  const cloud = createCloudMachines(async (command, args) => {
    calls.push({ command, args });
    return { status: 200, body: args?.path === "/v1/capabilities" ? { items: [{ name: "machines", status: "available" }] } : { items: [machine] } };
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
    return { status: 200, body: { items: [{ name: "machines", status: "unavailable" }] } };
  });
  assert.deepEqual(await cloud.rows(), { available: false, computers: [], renewInChannel: false });
  assert.deepEqual(paths, ["/v1/capabilities"]);
});

test("el status del borde llega tal cual: 404 de la colección es «no disponible»; sin sesión, 401", async () => {
  assert.equal((await edgeFetch((async () => ({ status: 501, body: null })) as never)("https://x/v1/machines")).status, 501);
  assert.equal((await edgeFetch((async () => Promise.reject({ detail: "no_session" })) as never)("https://x/v1/machines")).status, 401);
  assert.equal((await edgeFetch((async () => Promise.reject({ detail: "unavailable" })) as never)("https://x/v1/machines")).status, 503);
});

test("start sigue el Location que da Rust", async () => {
  const seen: string[] = [];
  const cloud = createCloudMachines((async (_c: string, args: Record<string, unknown>) => {
    seen.push(`${args.method} ${args.path}`);
    if (args.method === "POST") return { status: 202, location: "/v1/operations/op_1", body: { operation: { operation_id: "op_1", status: "pending" }, machine } };
    if (args.path === "/v1/operations/op_1") return { status: 200, body: { operation: { operation_id: "op_1", status: "succeeded" } } };
    return { status: 200, body: machine };
  }) as never);
  assert.equal((await cloud.client.start("cmp_1")).kind, "ok");
  assert.deepEqual(seen.slice(0, 2), ["POST /v1/machines/cmp_1/start", "GET /v1/operations/op_1"]);
});

test("403 organization_selection_required llega al selector", async () => {
  const seen: unknown[] = [];
  const body = { code: "organization_selection_required" };
  const reply = await edgeFetch((async () => ({ status: 403, body })) as never, (e) => seen.push(e))("https://x/v1/machines");
  assert.equal(reply.status, 403);
  assert.deepEqual(seen, [{ detail: "organization_selection_required", status: 403, body }]);
});
