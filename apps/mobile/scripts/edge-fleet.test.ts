/**
 * El teléfono en la web sobre el borde (`/v1/machines`): `accountFleet` con `admit` abre cada
 * sesión con un ticket de un solo uso (`ticket.*`, URL del ticket), nunca con un portador, y
 * una intención con la VM apagada la enciende antes por el plano de control, porque el canal
 * de tickets no enciende. `edgeControlPlane` lee la lista y enciende con la cookie del borde.
 *
 *   node --test apps/mobile/scripts/edge-fleet.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Computer, SocketLike } from "@terminus/computers";
import { accountFleet } from "../src/lib/hosts.ts";
import { edgeControlPlane } from "../src/lib/edge.ts";

class FakeSocket implements SocketLike {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: { type: string; id?: string; command?: string }[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number; reason?: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  url: string;
  protocols: string[];
  constructor(url: string, protocols: string[] = []) {
    this.url = url;
    this.protocols = protocols;
    FakeSocket.all.push(this);
  }
  get protocol() {
    return this.protocols[0];
  }
  open(state: string) {
    this.readyState = 1;
    this.onopen?.({});
    this.push({ type: "state", state });
  }
  push(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  send(data: string) {
    const m = JSON.parse(data);
    this.sent.push(m);
    if (m.type === "call") setTimeout(() => this.push({ type: "result", id: m.id, value: { ok: true } }), 0);
  }
  close(code = 1000, reason?: string) {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const VM = { computer_id: "mch_1", name: "Danil", state: "stopped", provider: null, wakeable: true } as Computer;

test("con el borde, cada sesión abre con un ticket de un solo uso y nunca con un portador", async () => {
  FakeSocket.all = [];
  const admitted: string[] = [];
  const machines = accountFleet(
    {
      endpoint: "wss://connect.example",
      admit: async (id) => {
        admitted.push(id);
        return { url: `wss://connect.example/v1/machines/${id}/session`, ticket: `t-${admitted.length}`, protocol: "danil.machine-session.v1" };
      },
    },
    (url, protocols) => new FakeSocket(url, protocols),
  );
  machines.set([{ ...VM, state: "online" }]);
  await sleep(5);
  const socket = FakeSocket.all.at(-1)!;
  assert.deepEqual(admitted, ["mch_1"]);
  assert.match(socket.url, /^wss:\/\/connect\.example\/v1\/machines\/mch_1\/session(\?|$)/);
  assert.deepEqual(socket.protocols, ["danil.machine-session.v1", "ticket.t-1"]);
  assert.ok(!socket.protocols.some((p) => p.startsWith("bearer.")), "sin portador en el canal");
  machines.close();
});

test("con el borde, una intención con la VM apagada la enciende antes por el plano de control", async () => {
  FakeSocket.all = [];
  const order: string[] = [];
  const machines = accountFleet(
    {
      endpoint: "wss://connect.example",
      admit: async (id) => ({ url: `wss://connect.example/v1/machines/${id}/session`, ticket: "t", protocol: "danil.machine-session.v1" }),
      wake: async (id) => {
        order.push(`wake:${id}`);
        // Encendida: el relay abre y dice `online`.
        setTimeout(() => FakeSocket.all.at(-1)?.open("online"), 0);
        return true;
      },
    },
    (url, protocols) => new FakeSocket(url, protocols),
  );
  const [host] = machines.set([VM]);
  await sleep(5);
  const answer = await host.call("send_message", "w1", { session: "s", text: "hola" });
  order.push("sent");
  assert.deepEqual(order, ["wake:mch_1", "sent"]);
  assert.deepEqual(answer.value, { ok: true });
  assert.ok(FakeSocket.all.at(-1)!.sent.some((m) => m.type === "call" && m.command === "send_message"));
  machines.close();
});

test("el plano de control del borde: la lista sale de /v1/machines, encender usa tickets con wake y 409 machine_stopped conserva su código", async () => {
  const calls: Request[] = [];
  const bodies: string[] = [];
  let wakeAttempts = 0;
  const request: typeof fetch = async (input, init) => {
    const r = new Request(input, init);
    calls.push(r);
    const body = r.method === "POST" ? await r.clone().text() : "";
    bodies.push(body);
    const path = new URL(r.url).pathname;
    if (path === "/v1/capabilities") return Response.json({ items: [] });
    if (path === "/v1/identity/csrf") return Response.json({ csrf_token: "c" });
    if (path === "/v1/machines") return Response.json({ items: [{ machine_id: "mch_1", name: "Danil", state: "stopped", future_field: 1 }], next_cursor: null });
    if (path === "/v1/machines/mch_1/tickets") {
      if (body === '{"wake":true}') {
        wakeAttempts++;
        if (wakeAttempts === 1) {
          return Response.json(
            { code: "machine_starting" },
            { status: 503, headers: { "content-type": "application/problem+json", "retry-after": "0" } },
          );
        }
        return Response.json({ ticket: "t_wake", url: "wss://connect.example/v1/machines/mch_1/session" }, { status: 201 });
      }
      return Response.json({ code: "machine_stopped" }, { status: 409, headers: { "content-type": "application/problem+json" } });
    }
    return Response.json({ code: "not_found" }, { status: 404, headers: { "content-type": "application/problem+json" } });
  };
  const plane = edgeControlPlane({ origin: "https://edge.example", timeoutMs: 1000 }, { fetch: request, relayOrigins: ["wss://connect.example"] });
  const list = await plane.computers();
  assert.equal(list.kind, "ok");
  if (list.kind === "ok") {
    assert.equal(list.value[0].computer_id, "mch_1");
    assert.equal(list.value[0].state, "stopped");
    assert.equal(list.value[0].wakeable, true, "la máquina de la organización la enciende el borde");
  }
  await assert.rejects(
    plane.admit("mch_1"),
    (err: unknown) => err instanceof Error && (err as { code?: string }).code === "machine_stopped",
    "409 machine_stopped preserva err.code para que RelaySession se aparque hasta wake",
  );
  assert.equal(await plane.wake("mch_1"), true);
  assert.equal(wakeAttempts, 2, "reintenta 503 machine_starting hasta el 201");
  const wakeCalls = calls.filter((r, i) => new URL(r.url).pathname === "/v1/machines/mch_1/tickets" && bodies[i] === '{"wake":true}');
  assert.equal(wakeCalls.length, 2);
  assert.equal(wakeCalls[0].headers.get("idempotency-key"), wakeCalls[1].headers.get("idempotency-key"), "misma Idempotency-Key al reintentar wake");
  assert.ok(!calls.some((r) => new URL(r.url).pathname === "/v1/machines/mch_1/start"), "no usa la ruta heredada /start");
  for (const r of calls) {
    assert.equal(r.credentials, "include");
    assert.equal(r.headers.has("authorization"), false);
  }
});

test("con el borde, una VM apagada que contesta 409 machine_stopped se aparca y se reabre al mandar un mensaje", async () => {
  FakeSocket.all = [];
  let awake = false;
  let woke = 0;
  const machines = accountFleet(
    {
      endpoint: "wss://connect.example",
      admit: async (id) => {
        if (!awake) {
          const error = new Error("machine_stopped") as Error & { code?: string };
          error.code = "machine_stopped";
          throw error;
        }
        return { url: `wss://connect.example/v1/machines/${id}/session`, ticket: "t-awake", protocol: "danil.machine-session.v1" };
      },
      wake: async () => {
        woke++;
        awake = true;
        setTimeout(() => FakeSocket.all.at(-1)?.open("online"), 10);
        return true;
      },
    },
    (url, protocols) => new FakeSocket(url, protocols),
  );
  const [host] = machines.set([VM]);
  await sleep(15);
  assert.equal(FakeSocket.all.length, 0, "mientras está apagada no abre socket");
  const answer = await host.call("send_message", "w1", { session: null, project: "", prompt: "hola" });
  assert.equal(woke, 1);
  assert.deepEqual(answer.value, { ok: true });
  machines.close();
});

test("el plano de control del borde: 404 o 501 de la colección es «aún no»; 401 avisa la sesión vencida", async () => {
  let status = 501;
  let expired = 0;
  const request: typeof fetch = async () => Response.json({ code: "x" }, { status, headers: { "content-type": "application/problem+json" } });
  const plane = edgeControlPlane({ origin: "https://edge.example", timeoutMs: 1000 }, { fetch: request, onUnauthorized: () => expired++ });
  assert.deepEqual(await plane.computers(), { kind: "error", status: 501 });
  status = 401;
  assert.equal((await plane.computers()).kind, "unauthorized");
  assert.equal(expired, 1);
});

test("identity decide la sesión: un 401 de identity/me no dispara el aviso de 401 (sin bucle con recheck)", async () => {
  let expired = 0;
  const request: typeof fetch = async () => Response.json({ code: "unauthorized" }, { status: 401, headers: { "content-type": "application/problem+json" } });
  const plane = edgeControlPlane({ origin: "https://edge.example", timeoutMs: 1000 }, { fetch: request, onUnauthorized: () => expired++ });
  await assert.rejects(plane.identity.me(), (e: unknown) => (e as { status?: number }).status === 401);
  assert.equal(expired, 0);
  assert.equal((await plane.computers()).kind, "unauthorized");
  assert.equal(expired, 1, "las demás rutas sí avisan");
});

test("A sale y B en la misma máquina no recibe sus listas con el canal caído", async () => {
  const items = new Map<string, string>();
  const storage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
    removeItem: (key: string) => { items.delete(key); },
  };
  const privateA = [{ id: "workspace-A", name: "Private A" }];
  const privateB = [{ id: "workspace-B", name: "Private B" }];
  class IdentitySocket extends FakeSocket {
    private rows: unknown;
    constructor(url: string, protocols: string[], rows: unknown) { super(url, protocols); this.rows = rows; }
    send(data: string) {
      const m = JSON.parse(data);
      if (m.type === "call") setTimeout(() => this.push({ type: "result", id: m.id, value: this.rows }), 0);
    }
  }
  async function readAs(person: string, rows: unknown) {
    let socket: IdentitySocket | undefined;
    const fleet = accountFleet({
      endpoint: "wss://connect.example", storage,
      admit: async () => ({ url: "wss://connect.example/v1/machines/mch_1/session", ticket: person, protocol: "danil.machine-session.v1" }),
    }, (url, protocols) => (socket = new IdentitySocket(url, protocols ?? [], rows)));
    const [host] = fleet.set([{ ...VM, state: "online" }]);
    await sleep(5);
    socket!.open("online");
    try { assert.deepEqual((await host.call("list_workspaces", null)).value, rows); }
    finally { fleet.close(); }
  }
  await readAs("person-A", privateA);
  const b = accountFleet({
    endpoint: "wss://connect.example", storage,
    admit: async () => { throw new Error("machine_unreachable"); },
  }, (url, protocols) => new FakeSocket(url, protocols));
  try {
    const [host] = b.set([VM]);
    await assert.rejects(host.call("list_workspaces", null), "B no recibe datos privados de A");
  } finally { b.close(); }
  await readAs("person-B", privateB);
});

test("el plano de control del borde manda el contexto, lee el catálogo y no enciende una máquina personal", async () => {
  const calls: Request[] = [];
  let required = 0;
  const request: typeof fetch = async (input, init) => {
    const r = new Request(input, init);
    calls.push(r);
    const path = new URL(r.url).pathname;
    const echo = { "X-Danil-Session-Applied": "ctx_x", "X-Danil-Session-Applied-Org": "org_x" };
    if (path === "/v1/identity/sessions") {
      return Response.json({ default_context: "ctx_x", items: [{ contexts: [{ context_id: "ctx_x", org: "org_x" }] }] });
    }
    if (path === "/v1/machines") {
      return Response.json(
        { items: [{ machine_id: "mch_own", name: "Mac", state: "stopped", kind: "personal" }], next_cursor: null },
        { headers: echo },
      );
    }
    if (path === "/v1/workspaces") {
      return Response.json(
        {
          items: [
            { id: "12", name: "Equipo", engine_workspace_id: "ws_team", runs_on: ["cloud"] },
            { id: "13", name: "Archivado", engine_workspace_id: "ws_old", archived: true },
          ],
          next_cursor: null,
        },
        { headers: echo },
      );
    }
    return Response.json({ code: "not_found" }, { status: 404, headers: { "content-type": "application/problem+json" } });
  };
  const plane = edgeControlPlane(
    { origin: "https://edge.example", timeoutMs: 1000 },
    { fetch: request, context: () => "ctx_x", organization: () => "org_x", onSelectionRequired: () => required++ },
  );
  const set = await plane.sessions();
  assert.equal(set?.defaultContext, "ctx_x");
  const list = await plane.computers();
  assert.equal(list.kind, "ok");
  if (list.kind === "ok") assert.equal(list.value[0].wakeable, false, "una máquina personal no se enciende desde la nube");
  const catalog = await plane.workspaces();
  assert.equal(catalog?.kind, "ok");
  if (catalog?.kind === "ok") assert.deepEqual(catalog.value.map((row) => row.id), ["ws_team"]);
  for (const call of calls.filter((call) => new URL(call.url).pathname !== "/v1/identity/sessions")) {
    assert.equal(call.headers.get("x-danil-session"), "ctx_x");
  }
  assert.equal(calls.find((call) => new URL(call.url).pathname === "/v1/identity/sessions")?.headers.get("x-danil-session"), null);

  const mismatch: typeof fetch = async () => Response.json({ items: [], next_cursor: null }, { headers: { "X-Danil-Session-Applied": "otro", "X-Danil-Session-Applied-Org": "org_x" } });
  const broken = edgeControlPlane({ origin: "https://edge.example", timeoutMs: 1000 }, { fetch: mismatch, context: () => "ctx_x", organization: () => "org_x" });
  assert.equal(await broken.workspaces(), null, "un eco distinto no se usa como catálogo");
  const otherOrg: typeof fetch = async () => Response.json({ items: [], next_cursor: null }, { headers: { "X-Danil-Session-Applied": "ctx_x", "X-Danil-Session-Applied-Org": "org_otra" } });
  const foreign = edgeControlPlane({ origin: "https://edge.example", timeoutMs: 1000 }, { fetch: otherOrg, context: () => "ctx_x", organization: () => "org_x" });
  assert.equal(await foreign.workspaces(), null, "un eco de otra organización no se usa como catálogo");

  const choose: typeof fetch = async () => Response.json({ code: "organization_selection_required" }, { status: 403, headers: { "content-type": "application/problem+json" } });
  const gated = edgeControlPlane({ origin: "https://edge.example", timeoutMs: 1000 }, { fetch: choose, onSelectionRequired: () => required++ });
  assert.equal((await gated.computers()).kind, "error");
  assert.deepEqual(await gated.workspaces(), { kind: "error", status: 403, code: "organization_selection_required" });
  assert.equal(required, 2);
});

test("el ticket con 409 machine_stopped conserva .code para detener bucles hasta un intent con wake", async () => {
  FakeSocket.all = [];
  let running = false;
  let admitAttempts = 0;
  let wakeAttempts = 0;
  const request: typeof fetch = async (input, init) => {
    const r = new Request(input, init);
    const path = new URL(r.url).pathname;
    if (path === "/v1/identity/csrf") return Response.json({ csrf_token: "c" });
    if (path === "/v1/machines/mch_1/tickets") {
      const payload = JSON.parse((await r.clone().text()) || "{}") as { wake?: boolean };
      if (payload.wake) {
        wakeAttempts += 1;
        running = true;
        setTimeout(() => FakeSocket.all.at(-1)?.open("online"), 5);
        return Response.json({ ticket: "t_woke", url: "wss://connect.example/v1/machines/mch_1/session" }, { status: 201 });
      }
      admitAttempts += 1;
      if (!running) {
        return Response.json({ code: "machine_stopped" }, { status: 409, headers: { "content-type": "application/problem+json" } });
      }
      return Response.json({ ticket: `t_${admitAttempts}`, url: "wss://connect.example/v1/machines/mch_1/session", protocol: "danil.machine-session.v1" }, { status: 201 });
    }
    return Response.json({ code: "not_found" }, { status: 404, headers: { "content-type": "application/problem+json" } });
  };
  const plane = edgeControlPlane({ origin: "https://edge.example", timeoutMs: 1000 }, { fetch: request, relayOrigins: ["wss://connect.example"] });
  await assert.rejects(() => plane.admit("mch_1"), (error: unknown) => (error as { code?: unknown } | null)?.code === "machine_stopped");
  admitAttempts = 0;

  const fleet = accountFleet(
    {
      endpoint: plane.relayOrigin,
      admit: (id) => plane.admit(id),
      wake: (id) => plane.wake(id),
    },
    (url, protocols) => new FakeSocket(url, protocols),
  );
  try {
    const [host] = fleet.set([VM]);
    await sleep(40);
    assert.equal(admitAttempts, 1, "sin wake, RelaySession frena en el primer 409 machine_stopped");
    assert.equal(wakeAttempts, 0);
    const answer = await host.call("send_message", "w1", { session: "s", prompt: "hola" });
    assert.deepEqual(answer.value, { ok: true });
    assert.equal(wakeAttempts, 1);
  } finally {
    fleet.close();
  }
});

test("el catálogo de espacios /v1/workspaces/{id}/spaces lee y asigna tareas con eco y tolerancia a 404", async () => {
  const echo = { "X-Danil-Session-Applied": "ctx_x", "X-Danil-Session-Applied-Org": "org_x" };
  let posted: unknown = null;
  let spacesCalls = 0;
  const request: typeof fetch = async (input, init) => {
    const r = new Request(input, init);
    const path = new URL(r.url).pathname;
    if (path === "/v1/identity/csrf") return Response.json({ csrf_token: "c" });
    if (path === "/v1/workspaces/12/spaces") {
      spacesCalls += 1;
      if (r.method === "POST") {
        posted = JSON.parse(await r.text());
        return Response.json(
          { version: 3, spaces: [{ id: "sp_1", name: "App", folders: ["f1"] }], order: ["sp_1"], task_spaces: { t1: "sp_1" } },
          { headers: echo },
        );
      }
      return Response.json(
        { version: 2, spaces: [{ id: "sp_1", name: "App", folders: ["f1"] }], order: ["sp_1"], task_spaces: {} },
        { headers: echo },
      );
    }
    if (path === "/v1/workspaces/77/spaces") {
      return Response.json({ version: 1, spaces: [], order: [] }, { headers: { "X-Danil-Session-Applied": "otro", "X-Danil-Session-Applied-Org": "org_x" } });
    }
    return Response.json({ code: "not_found" }, { status: 404, headers: { ...echo, "content-type": "application/problem+json" } });
  };
  const plane = edgeControlPlane(
    { origin: "https://edge.example", timeoutMs: 1000 },
    { fetch: request, context: () => "ctx_x", organization: () => "org_x" },
  );
  assert.equal(await plane.workspaceSpaces("abc"), null, "un id que no es numérico de cuenta no sale al borde");
  assert.equal(spacesCalls, 0);
  const read = await plane.workspaceSpaces("12");
  assert.equal(read?.version, 2);
  assert.deepEqual(read?.spaces[0].folders, ["f1"]);
  assert.equal(await plane.workspaceSpaces("99"), null, "un 404 es null tolerante");
  assert.equal(await plane.workspaceSpaces("77"), null, "un eco distinto se rechaza");
  const assigned = await plane.assignTaskSpace("12", "t1", "sp_1");
  assert.deepEqual(posted, { kind: "assign_task", task: "t1", space: "sp_1" });
  assert.equal(assigned?.task_spaces.t1, "sp_1");
});
