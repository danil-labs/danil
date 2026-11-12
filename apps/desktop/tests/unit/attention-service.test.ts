import assert from "node:assert/strict";
import test from "node:test";
import { createService, hostOf } from "../../../../packages/attention/src/service.ts";

const session = { getToken: async () => "token", unauthorized: async () => false };
const replying = (bodies: Record<string, unknown>) =>
  (async (input: RequestInfo | URL) => {
    const path = String(input).replace("/p", "");
    return bodies[path] === undefined ? new Response("{}", { status: 404 }) : Response.json(bodies[path]);
  }) as typeof fetch;

test("a variable never carries its value out of the reader", async () => {
  const api = createService(session, replying({ "/api/account_variables": { items: [{ id: "1", key: "URL", is_secret: false, value: "https://x" }, { id: "2", key: "KEY", is_secret: true, value: null }] } }), "/p");
  assert.deepEqual(await api.variables(), [{ key: "URL", secret: false }, { key: "KEY", secret: true }]);
});

test("an API connection keeps only its host", async () => {
  assert.equal(hostOf("https://api.acme.mx/pedidos/{{KEY}}"), "api.acme.mx");
  assert.equal(hostOf("{{BASE}}/pedidos"), "");
  const api = createService(session, replying({ "/api/http_tools": { items: [{ id: "a", name: "Pedido", is_active: null, definition: { method: "GET", url: "https://api.acme.mx/x?token=1" } }] } }), "/p");
  assert.deepEqual(await api.httpTools(), [{ id: "a", name: "Pedido", method: "GET", host: "api.acme.mx", active: true }]);
});

test("archived agents stay out of the list", async () => {
  const api = createService(session, replying({ "/api/agents": { agents: [{ id: 1, name: "A", agent_type: "pessoa" }, { id: 2, name: "B", archived: true }] } }), "/p");
  assert.deepEqual((await api.agents()).map((row) => row.id), [1]);
});

test("an agent joins its detail and its connections", async () => {
  const api = createService(session, replying({
    "/api/agents/7": { id: 7, name: "Sofía", agent_type: "pessoa", model: "m", description: "d" },
    "/api/agents/7/connections": { channels: [{ id: 1, name: "WA", provider: "whatsapp" }], calendar: { id: 2, email: "a@b.mx" }, documents: [{ id: 3, title: "Precios" }] },
  }), "/p");
  const agent = await api.agent(7);
  assert.equal(agent.channels[0].provider, "whatsapp");
  assert.equal("calendar" in agent, false);
  assert.equal(agent.documents[0].name, "Precios");
  assert.deepEqual(agent.httpTools, []);
});

test("a refused read surfaces, it does not look empty", async () => {
  const api = createService(session, (async () => new Response("{}", { status: 403 })) as typeof fetch, "/p");
  await assert.rejects(api.httpTools(), /HTTP 403/);
});

test("the service reader has no calendar API and ignores legacy calendar connections", async () => {
  const api = createService(session, replying({
    "/api/agents/7": { id: 7, name: "A" },
    "/api/agents/7/connections": { calendar: { id: 2, email: "retired@example.test" } },
  }), "/p");
  assert.equal("calendars" in api, false);
  assert.equal("calendar" in await api.agent(7), false);
});
