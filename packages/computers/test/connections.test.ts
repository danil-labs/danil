import assert from "node:assert/strict";
import { test } from "node:test";
import { type Fetch, connectionCapabilities, listConnections, MCP_URL, revokeConnection, updateConnection, webhookUrlOk } from "../src/index.ts";

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

test("la URL para conectar es el recurso OAuth canónico del MCP", () => {
  assert.equal(MCP_URL, "https://mcp.danil.ai/mcp");
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


import {
  deskMcpConnectionsTransport,
  getMcpConnection,
  listMcpConnectionAudit,
  listMcpConnections,
  patchMcpConnection,
  revokeMcpConnection,
  webMcpConnectionsTransport,
} from "../../platform-client/src/connections.ts";
import { edgeTransport } from "../../platform-client/src/edge.ts";

test("MCP N1 Desk transport lists, gets, patches (pause/resume/configure), audits, and revokes via Edge /v1/connections", async () => {
  const seen: Array<{ method: string; path: string; body: unknown }> = [];
  const sample = {
    id: "conn_1",
    client_id: "claude-code",
    organization_id: "org_a",
    state: "active",
    version: 2,
    exclusions: [{ workspace: "ws_1", folder: "" }],
  };
  const transport = deskMcpConnectionsTransport(async (method, path, body) => {
    seen.push({ method, path, body });
    if (method === "GET" && path === "/v1/connections") return { status: 200, body: { items: [sample] } };
    if (method === "GET" && path === "/v1/connections/conn_1") return { status: 200, body: sample };
    if (method === "PATCH" && path === "/v1/connections/conn_1") {
      return { status: 200, body: { ...sample, state: "paused", version: 3 } };
    }
    if (method === "GET" && path === "/v1/connections/conn_1/audit") {
      return { status: 200, body: { items: [{ action: "paused", occurred_at: "2026-11-23T12:00:00Z", version: 3 }] } };
    }
    if (method === "DELETE" && path === "/v1/connections/conn_1") return { status: 204, body: null };
    return { status: 404, body: null };
  });

  const listed = await listMcpConnections(transport);
  assert.deepEqual(listed, { kind: "ok", value: [sample] });

  const one = await getMcpConnection(transport, "conn_1");
  assert.deepEqual(one, { kind: "ok", value: sample });

  const paused = await patchMcpConnection(transport, "conn_1", { action: "pause" });
  assert.equal(paused.kind, "ok");
  assert.equal(paused.kind === "ok" ? paused.value.state : null, "paused");

  const audit = await listMcpConnectionAudit(transport, "conn_1");
  assert.equal(audit.kind, "ok");
  assert.equal(audit.kind === "ok" ? audit.value[0]?.action : null, "paused");

  const revoked = await revokeMcpConnection(transport, "conn_1");
  assert.deepEqual(revoked, { kind: "ok", value: null });

  assert.deepEqual(seen.map((s) => `${s.method} ${s.path}`), [
    "GET /v1/connections",
    "GET /v1/connections/conn_1",
    "PATCH /v1/connections/conn_1",
    "GET /v1/connections/conn_1/audit",
    "DELETE /v1/connections/conn_1",
  ]);
});

test("MCP N1 Web transport sends PATCH and DELETE with X-CSRF-Token and surfaces problem+json domain codes", async () => {
  const seen: Array<{ method: string; url: string; csrf: string | null; body: string | null }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers);
    seen.push({
      method,
      url,
      csrf: headers.get("x-csrf-token"),
      body: typeof init?.body === "string" ? init.body : null,
    });
    if (url.endsWith("/v1/identity/csrf")) {
      return Response.json({ csrf_token: "csrf-bound-1" });
    }
    if (method === "PATCH" && url.endsWith("/v1/connections/conn_2")) {
      return Response.json({
        id: "conn_2",
        client_id: "chatgpt",
        organization_id: "org_a",
        state: "active",
        version: 2,
        exclusions: [],
      });
    }
    if (method === "DELETE" && url.endsWith("/v1/connections/conn_2")) {
      return new Response(null, { status: 204 });
    }
    if (method === "PATCH" && url.endsWith("/v1/connections/conn_revoked")) {
      return new Response(
        JSON.stringify({
          type: "urn:danil:problem:connection_revoked",
          title: "connection_revoked",
          status: 403,
          code: "connection_revoked",
        }),
        { status: 403, headers: { "content-type": "application/problem+json" } },
      );
    }
    return new Response(null, { status: 404 });
  };

  const web = webMcpConnectionsTransport(edgeTransport({ origin: "https://edge.test", timeoutMs: 2000 }, fakeFetch));
  const configured = await patchMcpConnection(web, "conn_2", {
    action: "configure",
    organization_id: "org_a",
    exclusions: [],
  });
  assert.equal(configured.kind, "ok");

  const revoked = await revokeMcpConnection(web, "conn_2");
  assert.deepEqual(revoked, { kind: "ok", value: null });

  const denied = await patchMcpConnection(web, "conn_revoked", { action: "resume" });
  assert.deepEqual(denied, { kind: "error", status: 403, code: "connection_revoked" });

  const patchReq = seen.find((r) => r.method === "PATCH" && r.url.endsWith("/v1/connections/conn_2"));
  assert.equal(patchReq?.csrf, "csrf-bound-1");
  const deleteReq = seen.find((r) => r.method === "DELETE" && r.url.endsWith("/v1/connections/conn_2"));
  assert.equal(deleteReq?.csrf, "csrf-bound-1");
});
