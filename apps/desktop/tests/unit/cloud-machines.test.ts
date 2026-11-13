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
  assert.ok(rows.state === "ready");
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
  assert.deepEqual(await cloud.rows(), { state: "unavailable" });
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

for (const status of [503, 504]) test(`un HTTP ${status} de machines conserva el estado transitorio`, async () => {
  const cloud = createCloudMachines(async (_command, args) => ({ status: args?.path === "/v1/capabilities" ? 200 : status,
    body: args?.path === "/v1/capabilities" ? { items: [{ name: "machines", status: "available" }] } : null }));
  assert.equal((await cloud.rows()).state, "retrying");
});
for (const detail of ["unavailable", "timeout"]) test(`un fallo nativo ${detail} conserva el estado transitorio`, async () => {
  const cloud = createCloudMachines(async (_command, args) => {
    if (args?.path === "/v1/capabilities") return { status: 200, body: { items: [{ name: "machines", status: "available" }] } };
    throw { detail };
  });
  assert.equal((await cloud.rows()).state, "retrying");
});

for (const status of [404, 501]) test(`HTTP ${status} de la colección es ausencia definitiva`, async () => {
  const cloud = createCloudMachines(async (_command, args) => ({ status: args?.path === "/v1/capabilities" ? 200 : status,
    body: args?.path === "/v1/capabilities" ? { items: [{ name: "machines", status: "available" }] } : null }));
  assert.deepEqual(await cloud.rows(), { state: "unavailable" });
});
test("un fallo transitorio de capacidades no se confunde con una capacidad ausente", async () => {
  const cloud = createCloudMachines(async () => ({ status: 503, body: null }));
  assert.deepEqual(await cloud.rows(), { state: "retrying" });
});
test("una sesión inválida se distingue de un fallo transitorio", async () => {
  const cloud = createCloudMachines(async (_command, args) => ({ status: args?.path === "/v1/capabilities" ? 200 : 401,
    body: args?.path === "/v1/capabilities" ? { items: [{ name: "machines", status: "available" }] } : null }));
  assert.deepEqual(await cloud.rows(), { state: "denied" });
});

for (const status of [401, 403]) test(`capacidades HTTP ${status} deniega la nube sin consultar máquinas`, async () => {
  const paths: unknown[] = [];
  const cloud = createCloudMachines(async (_command, args) => { paths.push(args?.path); return { status, body: null }; });
  assert.deepEqual(await cloud.rows(), { state: "denied" });
  assert.deepEqual(paths, ["/v1/capabilities"]);
});
test("sin sesión nativa, capacidades deniega la nube en vez de reintentar", async () => {
  const cloud = createCloudMachines(async () => { throw { detail: "no_session" }; });
  assert.deepEqual(await cloud.rows(), { state: "denied" });
});
