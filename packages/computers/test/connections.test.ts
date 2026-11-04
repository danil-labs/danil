import assert from "node:assert/strict";
import { test } from "node:test";
import { type Fetch, connectionCapabilities, listConnections, mcpUrl, revokeConnection, updateConnection, webhookUrlOk } from "../src/index.ts";

function fake(status: number, body: unknown) {
  const calls: Array<{ url: string; method?: string; headers?: Record<string, string>; body?: string }> = [];
  const f: Fetch = async (url, init) => {
    calls.push({ url, ...init });
    return { status, ok: status >= 200 && status < 300, json: async () => body };
  };
  return { f, calls };
}

test("lista solo filas de conexión y manda el token", async () => {
  const { f, calls } = fake(200, [{ id: "conn-1", state: "pending" }, { nope: true }]);
  const answer = await listConnections("computers.test", "tok", f);
  assert.deepEqual(answer, { kind: "ok", value: [{ id: "conn-1", state: "pending" }] });
  assert.equal(calls[0].url, "https://computers.test/v1/connections");
  assert.equal(calls[0].headers?.authorization, "Bearer tok");
});

test("activar manda el parche como JSON por PATCH", async () => {
  const { f, calls } = fake(200, { id: "conn-1", state: "active" });
  const patch = { state: "active" as const, permission_mode: "manual", machines: [{ computer_id: "cmp_x", workspace: "abcd1234" }] };
  const answer = await updateConnection("https://computers.test", "tok", "conn-1", patch, f);
  assert.equal(answer.kind, "ok");
  assert.equal(calls[0].method, "PATCH");
  assert.equal(calls[0].headers?.["content-type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0].body ?? ""), patch);
});

test("revocar es DELETE; una sesión vencida es unauthorized", async () => {
  const ok = fake(200, { id: "conn-1", state: "revoked" });
  assert.deepEqual(await revokeConnection("computers.test", "tok", "conn-1", ok.f), { kind: "ok", value: null });
  assert.equal(ok.calls[0].method, "DELETE");
  const expired = fake(401, null);
  assert.deepEqual(await listConnections("computers.test", "tok", expired.f), { kind: "unauthorized" });
});

test("producción copia directamente el recurso OAuth canónico del MCP", () => {
  for (const endpoint of ["machines.danil.ai", "https://machines.danil.ai/", "wss://machines.danil.ai", "computers.danil.ai", "https://computers.danil.ai/", "wss://computers.danil.ai"]) {
    assert.equal(mcpUrl(endpoint), "https://mcp.danil.ai/mcp");
  }
});

test("staging y servidores propios conservan su recurso MCP", () => {
  for (const [endpoint, expected] of [
    ["https://computers-dev.danil.ai", "https://computers-dev.danil.ai/mcp"],
    ["http://localhost:8787", "http://localhost:8787/mcp"],
    ["https://computers.example/base/", "https://computers.example/base/mcp"],
    ["https://computers.danil.ai:8443", "https://computers.danil.ai:8443/mcp"],
    ["https://computers.danil.ai/custom", "https://computers.danil.ai/custom/mcp"],
  ]) assert.equal(mcpUrl(endpoint), expected);
});

test("el secreto del webhook llega en la respuesta del cambio", async () => {
  const { f, calls } = fake(200, { id: "conn-1", state: "active", webhook: { url: "https://hooks.example.com/danil", secret_set: true }, webhook_secret: "whsec_x" });
  const answer = await updateConnection("computers.test", "tok", "conn-1", { webhook: { url: "https://hooks.example.com/danil" } }, f);
  assert.equal(answer.kind, "ok");
  assert.equal(answer.kind === "ok" ? answer.value?.webhook_secret : null, "whsec_x");
  assert.deepEqual(JSON.parse(calls[0].body ?? ""), { webhook: { url: "https://hooks.example.com/danil" } });
});

test("solo destinos HTTPS públicos, como el servidor", () => {
  assert.equal(webhookUrlOk("https://hooks.example.com/danil"), true);
  for (const url of ["http://hooks.example.com/x", "https://localhost/x", "https://10.0.0.1/x", "https://u:p@hooks.example.com/x", "https://hooks.example.com:8443/x", "https://intranet/x", "no es url"]) {
    assert.equal(webhookUrlOk(url), false, url);
  }
});


test("capabilities distinguishes legacy from outage and validates the advertised limits", async () => {
  const body = { features: ["external_connection_destinations_v1"], limits: { max_destinations: 32, max_destination_bindings: 256 } };
  const ok = fake(200, body);
  assert.deepEqual(await connectionCapabilities("computers.test", "tok", ok.f), { kind: "ok", value: body });
  assert.equal(ok.calls[0].url, "https://computers.test/v1/connections/capabilities");
  assert.equal(ok.calls[0].headers?.authorization, "Bearer tok");
  assert.deepEqual(await connectionCapabilities("computers.test", "tok", fake(404, null).f), { kind: "missing" });
  assert.deepEqual(await connectionCapabilities("computers.test", "tok", fake(503, { error: "unavailable" }).f), { kind: "error", status: 503, code: "unavailable" });
  for (const invalid of [null, {}, { ...body, limits: { max_destinations: 0, max_destination_bindings: 256 } }, { ...body, features: [12] }]) {
    assert.deepEqual(await connectionCapabilities("computers.test", "tok", fake(200, invalid).f), { kind: "error", status: 200 });
  }
});
