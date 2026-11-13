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

test("el plano de control del borde: la lista sale de /v1/machines y encender es start con su operación", async () => {
  const calls: Request[] = [];
  const request: typeof fetch = async (input, init) => {
    const r = new Request(input, init);
    calls.push(r);
    const path = new URL(r.url).pathname;
    if (path === "/v1/capabilities") return Response.json({ items: [] });
    if (path === "/v1/identity/csrf") return Response.json({ csrf_token: "c" });
    if (path === "/v1/machines") return Response.json({ items: [{ machine_id: "mch_1", name: "Danil", state: "stopped", future_field: 1 }], next_cursor: null });
    if (path === "/v1/machines/mch_1/start")
      return Response.json({ operation: { operation_id: "op_1", status: "succeeded" } }, { status: 202, headers: { location: "/v1/operations/op_1" } });
    if (path === "/v1/machines/mch_1") return Response.json({ machine_id: "mch_1", state: "running", connection: "connected" });
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
  assert.equal(await plane.wake("mch_1"), true);
  for (const r of calls) {
    assert.equal(r.credentials, "include");
    assert.equal(r.headers.has("authorization"), false);
  }
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
