import assert from "node:assert/strict";
import { test } from "node:test";
import { type Fetch, machinesClient, machineToComputer, powerOf } from "../src/index.ts";

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

/** Un borde de mentira: contesta por `METHOD ruta`, la última respuesta de cada ruta se repite. */
function edge(routes: Record<string, { status: number; body?: unknown }[]>) {
  const calls: Call[] = [];
  const seen: Record<string, number> = {};
  const fetch: Fetch = async (url, init) => {
    const path = new URL(url).pathname.replace(/^\/v1/, "");
    const key = `${init?.method ?? "GET"} ${path}`;
    calls.push({ url, method: init?.method ?? "GET", headers: init?.headers ?? {}, body: init?.body });
    const list = routes[key] ?? [{ status: 404 }];
    const r = list[Math.min(seen[key] ?? 0, list.length - 1)];
    seen[key] = (seen[key] ?? 0) + 1;
    return { status: r.status, ok: r.status < 400, json: async () => r.body ?? null };
  };
  return { fetch, calls };
}

const machine = { machine_id: "cmp_1", name: "Nube IA", state: "running", connection: "connected", organization_id: "org_1", person_id: "user_1" };
const client = (fetch: Fetch, extra = {}) => machinesClient({ endpoint: "https://edge.danil.ai/v1", getToken: async () => "tok", fetch, sleep: async () => {}, ...extra });

test("lista por /v1/machines con Bearer y entrega filas para las pantallas de flota", async () => {
  const { fetch, calls } = edge({ "GET /machines": [{ status: 200, body: { items: [machine, { ...machine, machine_id: "cmp_2", state: "stopped", connection: "disconnected" }], next_cursor: null } }] });
  const answer = await client(fetch).list();
  assert.equal(answer.kind, "ok");
  if (answer.kind !== "ok") return;
  assert.equal(calls[0].url, "https://edge.danil.ai/v1/machines");
  assert.equal(calls[0].headers.authorization, "Bearer tok");
  const rows = answer.value.map(machineToComputer);
  assert.deepEqual(rows.map((r) => [r.computer_id, r.state, powerOf(r.state)]), [["cmp_1", "online", "on"], ["cmp_2", "stopped", "off"]]);
});

test("running sin conexión del motor no es «encendida»; un estado nuevo no rompe", () => {
  assert.equal(machineToComputer({ ...machine, connection: "disconnected" }).state, "offline");
  assert.equal(machineToComputer({ ...machine, state: "hibernating" }).state, "unknown");
  assert.equal(machineToComputer({ ...machine, state: "reserved" }).state, "provisioning");
});

test("404 y 501 son «no disponible», no un error; 401 sigue siendo 401", async () => {
  for (const status of [404, 501]) assert.equal((await client(edge({ "GET /machines": [{ status }] }).fetch).list()).kind, "unavailable");
  assert.equal((await client(edge({ "GET /machines": [{ status: 401 }] }).fetch).list()).kind, "unauthorized");
});

test("un 404 de una máquina concreta es «missing», no «no disponible»", async () => {
  const answer = await client(edge({ "GET /machines/cmp_9": [{ status: 404, body: { code: "machine_not_found" } }] }).fetch).get("cmp_9");
  assert.equal(answer.kind, "missing");
});

test("start: 202 con operación y sondeo hasta succeeded, con Idempotency-Key", async () => {
  const op = (status: string) => ({ operation: { operation_id: "op_1", kind: "machine.start", status, created_at: "t" } });
  const { fetch, calls } = edge({
    "POST /machines/cmp_1/start": [{ status: 202, body: { ...op("pending"), machine: { ...machine, state: "starting" } } }],
    "GET /machines/operations/op_1": [{ status: 200, body: op("pending") }, { status: 200, body: op("mystery") }, { status: 200, body: op("running") }, { status: 200, body: op("succeeded") }],
    "GET /machines/cmp_1": [{ status: 200, body: machine }],
  });
  const answer = await client(fetch).start("cmp_1");
  assert.equal(answer.kind, "ok");
  if (answer.kind === "ok") assert.equal(answer.value.state, "running");
  const post = calls.find((c) => c.method === "POST")!;
  assert.ok(post.headers["Idempotency-Key"]);
  assert.equal(post.body, "{}");
  assert.equal(calls.filter((c) => c.url.endsWith("/operations/op_1")).length, 4);
});

test("start: failed devuelve el código; not_remotely_startable llega como error con código", async () => {
  const failed = edge({
    "POST /machines/cmp_1/start": [{ status: 202, body: { operation: { operation_id: "op_2", status: "pending" }, machine } }],
    "GET /machines/operations/op_2": [{ status: 200, body: { operation: { operation_id: "op_2", status: "failed", error: { code: "provider_error" } } } }],
  });
  assert.deepEqual(await client(failed.fetch).start("cmp_1"), { kind: "error", status: null, code: "provider_error" });
  const no = edge({ "POST /machines/cmp_1/start": [{ status: 409, body: { code: "not_remotely_startable" } }] });
  assert.deepEqual(await client(no.fetch).start("cmp_1"), { kind: "error", status: 409, code: "not_remotely_startable" });
});

test("start: el sondeo se rinde en el plazo y no queda colgado", async () => {
  let clock = 0;
  const { fetch } = edge({
    "POST /machines/cmp_1/start": [{ status: 202, body: { operation: { operation_id: "op_3", status: "pending" }, machine } }],
    "GET /machines/operations/op_3": [{ status: 200, body: { operation: { operation_id: "op_3", status: "pending" } } }],
  });
  const answer = await client(fetch, { now: () => clock, sleep: async (ms: number) => void (clock += ms) }).start("cmp_1");
  assert.deepEqual(answer, { kind: "error", status: null, code: "operation_timeout" });
});

const ticket = (url: string) => ({ status: 201, body: { ticket: "t1", url, expires_at: "a", session_expires_at: "b" } });

test("ticket: valida wss, origen y ruta antes de entregarlo; sale con subprotocolo ticket.*", async () => {
  const good = edge({ "POST /machines/cmp_1/tickets": [ticket("wss://machines.danil.ai/v1/machines/cmp_1/session")] });
  const admission = await client(good.fetch).admission("cmp_1");
  assert.equal(admission.kind, "ok");
  if (admission.kind === "ok") assert.deepEqual(admission.value, { url: "wss://machines.danil.ai/v1/machines/cmp_1/session", ticket: "t1", session_expires_at: "b" });
  // Un https de un puente que aún no emite wss se normaliza a wss, sin cambiar de origen.
  const legacy = edge({ "POST /machines/cmp_1/tickets": [ticket("https://machines.danil.ai/v1/machines/cmp_1/session")] });
  const normalized = await client(legacy.fetch).admission("cmp_1");
  assert.equal(normalized.kind === "ok" && normalized.value.url, "wss://machines.danil.ai/v1/machines/cmp_1/session");
  for (const bad of [
    "wss://evil.example/v1/machines/cmp_1/session",
    "wss://machines.danil.ai/v1/machines/cmp_2/session",
    "wss://machines.danil.ai/v1/machines/cmp_1/session?x=1",
    "wss://u:p@machines.danil.ai/v1/machines/cmp_1/session",
    "ws://machines.danil.ai/v1/machines/cmp_1/session",
  ]) {
    const answer = await client(edge({ "POST /machines/cmp_1/tickets": [ticket(bad)] }).fetch).admission("cmp_1");
    assert.deepEqual(answer, { kind: "error", status: null, code: "invalid_admission_url" }, bad);
  }
});

test("ticket: el origen del relay es configurable; 409 machine_unreachable conserva su código", async () => {
  const other = edge({ "POST /machines/cmp_1/tickets": [ticket("wss://relay.example/v1/machines/cmp_1/session")] });
  assert.equal((await client(other.fetch, { relayOrigins: ["wss://relay.example"] }).admission("cmp_1")).kind, "ok");
  const down = edge({ "POST /machines/cmp_1/tickets": [{ status: 409, body: { code: "machine_unreachable" } }] });
  assert.deepEqual(await client(down.fetch).admission("cmp_1"), { kind: "error", status: 409, code: "machine_unreachable" });
});

test("el token nunca va por query ni en el cuerpo", async () => {
  const { fetch, calls } = edge({ "GET /machines": [{ status: 200, body: { items: [] } }] });
  await client(fetch).list();
  assert.ok(!calls[0].url.includes("tok"));
});
