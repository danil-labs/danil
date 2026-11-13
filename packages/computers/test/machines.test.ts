import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import { type Fetch, machinesClient, machineToComputer, powerOf } from "../src/index.ts";

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

/** Un borde de mentira: contesta por `METHOD ruta`, la última respuesta de cada ruta se repite. */
function edge(routes: Record<string, { status: number; body?: unknown; headers?: Record<string, string> }[]>) {
  const calls: Call[] = [];
  const seen: Record<string, number> = {};
  const fetch: Fetch = async (url, init) => {
    const target = new URL(url);
    const path = target.pathname.replace(/^\/v1/, "") + target.search;
    const key = `${init?.method ?? "GET"} ${path}`;
    calls.push({ url, method: init?.method ?? "GET", headers: init?.headers ?? {}, body: init?.body });
    const list = routes[key] ?? [{ status: 404 }];
    const r = list[Math.min(seen[key] ?? 0, list.length - 1)];
    seen[key] = (seen[key] ?? 0) + 1;
    return { status: r.status, ok: r.status < 400, headers: new Headers(r.headers), json: async () => r.body ?? null };
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
    "POST /machines/cmp_1/start": [{ status: 202, headers: { Location: "/v1/operations/op_1", "Retry-After": "2" }, body: { ...op("pending"), machine: { ...machine, state: "starting" } } }],
    "GET /operations/op_1": [{ status: 200, body: op("pending") }, { status: 200, body: op("mystery") }, { status: 200, body: op("running") }, { status: 200, body: op("succeeded") }],
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
    "POST /machines/cmp_1/start": [{ status: 202, headers: { Location: "/v1/operations/op_2" }, body: { operation: { operation_id: "op_2", status: "pending" }, machine } }],
    "GET /operations/op_2": [{ status: 200, body: { operation: { operation_id: "op_2", status: "failed", error: { code: "provider_error" } } } }],
  });
  assert.deepEqual(await client(failed.fetch).start("cmp_1"), { kind: "error", status: null, code: "provider_error" });
  const no = edge({ "POST /machines/cmp_1/start": [{ status: 409, body: { code: "not_remotely_startable" } }] });
  assert.deepEqual(await client(no.fetch).start("cmp_1"), { kind: "error", status: 409, code: "not_remotely_startable" });
});

test("start: el sondeo se rinde en el plazo y no queda colgado", async () => {
  let clock = 0;
  const { fetch } = edge({
    "POST /machines/cmp_1/start": [{ status: 202, headers: { Location: "/v1/operations/op_3" }, body: { operation: { operation_id: "op_3", status: "pending" }, machine } }],
    "GET /operations/op_3": [{ status: 200, body: { operation: { operation_id: "op_3", status: "pending" } } }],
  });
  const answer = await client(fetch, { now: () => clock, sleep: async (ms: number) => void (clock += ms) }).start("cmp_1");
  assert.deepEqual(answer, { kind: "error", status: null, code: "operation_timeout" });
});

const ticket = (url: string) => ({ status: 201, body: { ticket: "t1", url, expires_at: "a", session_expires_at: "b" } });

test("ticket: valida wss, origen y ruta antes de entregarlo; sale con subprotocolo ticket.*", async () => {
  const good = edge({ "POST /machines/cmp_1/tickets": [ticket("wss://connect.danil.ai/v1/machines/cmp_1/session")] });
  const admission = await client(good.fetch).admission("cmp_1");
  assert.equal(admission.kind, "ok");
  if (admission.kind === "ok") assert.deepEqual(admission.value, { url: "wss://connect.danil.ai/v1/machines/cmp_1/session", ticket: "t1", session_expires_at: "b", expires_at: "a" });
  for (const bad of [
    "https://machines.danil.ai/v1/machines/cmp_1/session",
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

test("ticket: solo un origen exacto recibe el ticket; otro subdominio de Danil o un comodín no (machine-session.v1, Apertura §2)", async () => {
  for (const host of ["machines-session.danil.ai", "connect.danil.ai"]) {
    const answer = await client(edge({ "POST /machines/cmp_1/tickets": [ticket(`wss://${host}/v1/machines/cmp_1/session`)] }).fetch).admission("cmp_1");
    assert.equal(answer.kind, "ok", host);
  }
  for (const host of ["billing.danil.ai", "machines.danil.ai", "evil.example", "danil.ai.evil.example", "danil.ai", "connect.danil.ai:8443"]) {
    const answer = await client(edge({ "POST /machines/cmp_1/tickets": [ticket(`wss://${host}/v1/machines/cmp_1/session`)] }).fetch).admission("cmp_1");
    assert.deepEqual(answer, { kind: "error", status: null, code: "invalid_admission_url" }, host);
  }
  const wild = await client(edge({ "POST /machines/cmp_1/tickets": [ticket("wss://billing.danil.ai/v1/machines/cmp_1/session")] }).fetch, { relayOrigins: ["wss://*.danil.ai"] }).admission("cmp_1");
  assert.deepEqual(wild, { kind: "error", status: null, code: "invalid_admission_url" }, "un comodín no es un origen");
});

test("start no pide un Location con traversal, barras invertidas o separadores codificados", async () => {
  for (const location of ["/v1/operations/%2e%2e\\identity\\me", "/v1/operations/..", "/v1/operations/op%2F..%2Fidentity", "/v1/operations/op\\x", "/v1/operations/op%5Cx", "/v1/operations/op/../../identity/me"]) {
    const asked: string[] = [];
    const api = machinesClient({ endpoint: "https://edge.danil.ai/v1", transport: {
      mutation: async () => Response.json({ operation: { operation_id: "op", status: "pending" } }, { status: 202, headers: { Location: location } }),
      call: async (path) => { asked.push(path); return Response.json(machine); },
    } });
    assert.deepEqual(await api.start("cmp_1"), { kind: "error", status: 202, code: "invalid_operation_location" }, location);
    assert.deepEqual(asked, [], location);
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


test("web transport owns cookie and CSRF; the shared client never requests a bearer", async () => {
  const calls: { path: string; init?: RequestInit }[] = [];
  const transport = {
    call: async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      if (path === 'machines') return Response.json({ items: [machine], next_cursor: null });
      return Response.json(machine);
    },
    mutation: async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      return Response.json({ ticket: 'ticket', url: 'wss://connect.danil.ai/v1/machines/cmp_1/session', expires_at: 'expires', session_expires_at: 'session', protocol: 'danil.machine-session.v1' }, { status: 201 });
    },
  };
  const api = machinesClient({ endpoint: 'https://edge.danil.ai/v1', transport, getToken: async () => { throw new Error('must not ask'); } });
  assert.equal((await api.list()).kind, 'ok');
  const ticket = await api.admission('cmp_1');
  assert.equal(ticket.kind, 'ok');
  if (ticket.kind === 'ok') assert.equal(ticket.value.protocol, 'danil.machine-session.v1');
  assert.deepEqual(calls.map(call => call.path), ['machines', 'machines/cmp_1/tickets']);
  assert.ok(calls.every(call => !new Headers(call.init?.headers).has('authorization')));
  assert.ok(new Headers(calls[1].init?.headers).get('Idempotency-Key'));
  assert.equal(calls[1].init?.body, '{}');
});

test("list follows opaque cursors, ignores future fields and rejects cursor loops", async () => {
  const seen: string[] = [];
  const api = machinesClient({ endpoint: 'https://edge.danil.ai/v1', transport: {
    call: async path => {
      seen.push(path);
      return Response.json({ items: [{ ...machine, machine_id: String(seen.length), future: true }], next_cursor: seen.length === 1 ? 'opaque /?' : null });
    }, mutation: async () => { throw new Error('unused'); },
  } });
  const answer = await api.list();
  assert.equal(answer.kind === 'ok' && answer.value.length, 2);
  assert.deepEqual(seen, ['machines', 'machines?cursor=opaque%20%2F%3F']);
  const loop = machinesClient({ endpoint: 'https://edge.danil.ai/v1', transport: { call: async () => Response.json({ items: [], next_cursor: 'same' }), mutation: async () => { throw Error('unused'); } } });
  assert.equal((await loop.list()).kind, 'error');
});

test("thrown HTTP statuses and raw responses preserve unavailable, auth and problem codes", async () => {
  for (const status of [404, 501, 401, 429, 503]) {
    for (const thrown of [true, false]) {
      const api = machinesClient({ endpoint: 'https://edge.danil.ai/v1', transport: {
        call: async () => { if (thrown) throw { status, code: 'problem_code', retryAfter: '3' }; return Response.json({ code: 'problem_code' }, { status, headers: { 'Retry-After': '3' } }); },
        mutation: async () => { throw Error('unused'); },
      } });
      const answer = await api.list();
      assert.equal(answer.kind, status === 404 || status === 501 ? 'unavailable' : status === 401 ? 'unauthorized' : 'error');
      if (answer.kind === 'error') assert.equal(answer.code, 'problem_code');
    }
  }
});

test("start follows Location exactly and honors Retry-After without inventing a machine-scoped operation route", async () => {
  const seen: string[] = [], slept: number[] = [];
  let polls = 0;
  const api = machinesClient({ endpoint: 'https://edge.danil.ai/v1', sleep: async ms => { slept.push(ms); }, transport: {
    mutation: async () => Response.json({ operation: { operation_id: 'opaque', status: 'pending' } }, { status: 202, headers: { Location: '/v1/operations/server-assigned', 'Retry-After': '2' } }),
    call: async path => {
      seen.push(path);
      if (path.startsWith('operations/')) return Response.json({ operation: { operation_id: 'opaque', status: ++polls === 1 ? 'running' : 'succeeded' } }, { headers: { 'Retry-After': '3' } });
      return Response.json(machine);
    },
  } });
  assert.equal((await api.start('cmp_1')).kind, 'ok');
  assert.deepEqual(seen, ['operations/server-assigned', 'operations/server-assigned', 'machines/cmp_1']);
  assert.deepEqual(slept, [2000, 3000]);
});

test("start refuses external or absent Location and never substitutes an accepted stale machine after a failed read", async () => {
  for (const location of [undefined, 'https://evil.test/v1/operations/op', '/v1/machines/operations/op']) {
    let calls = 0;
    const api = machinesClient({ endpoint: 'https://edge.danil.ai/v1', transport: {
      mutation: async () => Response.json({ operation: { operation_id: 'op', status: 'pending' }, machine }, { status: 202, headers: location ? { Location: location } : {} }),
      call: async () => { calls++; return Response.json(machine); },
    } });
    assert.equal((await api.start('cmp_1')).kind, 'error');
    assert.equal(calls, 0);
  }
  const api = machinesClient({ endpoint: 'https://edge.danil.ai/v1', transport: {
    mutation: async () => Response.json({ operation: { operation_id: 'op', status: 'succeeded' }, machine: { ...machine, state: 'starting' } }, { status: 202 }),
    call: async () => new Response(null, { status: 404 }),
  } });
  assert.equal((await api.start('cmp_1')).kind, 'missing');
});

test("an unknown state or absent connection never makes a machine connectable or startable", () => {
  assert.equal(machineToComputer({ machine_id: 'opaque', state: 'running' }).state, 'offline');
  assert.equal(machineToComputer({ ...machine, state: 'future' }).state, 'unknown');
  assert.equal(machineToComputer({ ...machine, state: 'future' }).wakeable, false);
});

test("sin getToken no manda Authorization (Desk autentica en Rust con danil_edge_fetch)", async () => {
  const { fetch, calls } = edge({ "GET /machines": [{ status: 200, body: { items: [], next_cursor: null } }] });
  assert.equal((await machinesClient({ endpoint: "https://edge.danil.ai/v1", fetch }).list()).kind, "ok");
  assert.equal(calls[0].headers.authorization, undefined);
});

test("Location y Retry-After se leen igual del fetch de Desk, que solo conoce nombres en minúscula", async () => {
  const lower = (h: Record<string, string>) => ({ get: (n: string) => h[n] ?? null });
  const seen: string[] = [];
  const fetch: Fetch = async (url, init) => {
    const path = new URL(url).pathname;
    seen.push(`${init?.method ?? "GET"} ${path}`);
    if (path.endsWith("/start")) return { status: 202, ok: true, headers: lower({ location: "/v1/operations/op_d" }), json: async () => ({ operation: { operation_id: "op_d", status: "pending" } }) };
    if (path.startsWith("/v1/operations/")) return { status: 200, ok: true, headers: lower({}), json: async () => ({ operation: { operation_id: "op_d", status: "succeeded" } }) };
    return { status: 200, ok: true, headers: lower({}), json: async () => machine };
  };
  assert.equal((await machinesClient({ endpoint: "https://edge.danil.ai/v1", fetch, sleep: async () => {} }).start("cmp_1")).kind, "ok");
  assert.ok(seen.includes("GET /v1/operations/op_d"));
});

test("501 de un start es «no disponible»", async () => {
  assert.equal((await client(edge({ "POST /machines/cmp_1/start": [{ status: 501 }] }).fetch).start("cmp_1")).kind, "unavailable");
});

// Ejemplos de los contratos mvp-v1 (terminus-workspace#35); sin el directorio, la prueba se omite.
const EXAMPLES = process.env.MVP_CONTRACTS ?? "/home/alejandro/danil/mvp/contracts/mvp-v1/examples/machines";
const example = (name: string) => JSON.parse(readFileSync(`${EXAMPLES}/${name}`, "utf8"));
const withExamples = existsSync(EXAMPLES) ? test : test.skip;

withExamples("contrato: los ejemplos de mvp-v1 los entiende el módulo", async () => {
  const origins = ["wss://connect.danil.ai"];
  assert.equal(machineToComputer(example("get.200.json")).state, "online");
  assert.equal(machineToComputer(example("start.202.json").machine).state, "starting");
  for (const file of ["list.200.json", "list.200.empty.json"]) assert.equal((await client(edge({ "GET /machines": [{ status: 200, body: example(file) }] }).fetch).list()).kind, "ok", file);
  assert.equal((await client(edge({ "GET /machines": [{ status: 501, body: example("not_implemented.501.json") }] }).fetch).list()).kind, "unavailable");
  assert.equal((await client(edge({ "GET /machines": [{ status: 401, body: example("invalid_session.401.json") }] }).fetch).list()).kind, "unauthorized");
  const id = "cmp_01JD6Z8K2M3N4P5Q6R7S8T9V0W";
  const issued = await client(edge({ [`POST /machines/${id}/tickets`]: [{ status: 201, body: example("tickets.201.json") }] }).fetch, { relayOrigins: origins }).admission(id);
  assert.equal(issued.kind === "ok" && issued.value.protocol, "danil.machine-session.v1");
  for (const [file, status, code] of [["tickets.409.machine_unreachable.json", 409, "machine_unreachable"], ["tickets.409.ticket_already_issued.json", 409, "ticket_already_issued"], ["tickets.503.invalid_relay_origin.json", 503, "invalid_relay_origin"]] as const) {
    assert.deepEqual(await client(edge({ "POST /machines/cmp_1/tickets": [{ status, body: example(file) }] }).fetch).admission("cmp_1"), { kind: "error", status, code });
  }
  assert.deepEqual(await client(edge({ "POST /machines/cmp_1/start": [{ status: 409, body: example("start.409.not_remotely_startable.json") }] }).fetch).start("cmp_1"), { kind: "error", status: 409, code: "not_remotely_startable" });
  const failed = edge({
    "POST /machines/cmp_1/start": [{ status: 202, headers: { Location: "/v1/operations/op_01JD7Q3W4E5R6T7Y8U9I0O1P2A" }, body: example("start.202.json") }],
    "GET /operations/op_01JD7Q3W4E5R6T7Y8U9I0O1P2A": [{ status: 200, body: example("operation.200.failed.json") }],
  });
  assert.deepEqual(await client(failed.fetch).start("cmp_1"), { kind: "error", status: null, code: "provider_unavailable" });
});
