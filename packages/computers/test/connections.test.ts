import assert from "node:assert/strict";
import { test } from "node:test";
import { MCP_URL } from "../../features/settings/src/model/connections.ts";
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

test("la URL para conectar es el recurso OAuth canónico del MCP", () => {
  assert.equal(MCP_URL, "https://mcp.danil.ai/mcp");
});

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

test("MCP N1 handles unauthorized, missing, network errors, and malformed payloads cleanly", async () => {
  const unauth = deskMcpConnectionsTransport(async () => ({ status: 401, body: null }));
  assert.deepEqual(await listMcpConnections(unauth), { kind: "unauthorized" });

  const missing = deskMcpConnectionsTransport(async () => ({ status: 404, body: null }));
  assert.deepEqual(await getMcpConnection(missing, "conn_x"), { kind: "missing" });

  const failed = deskMcpConnectionsTransport(async () => {
    throw new Error("network_down");
  });
  assert.deepEqual(await listMcpConnections(failed), { kind: "error", status: null });

  const invalid = deskMcpConnectionsTransport(async () => ({ status: 200, body: { items: "nope" } }));
  assert.deepEqual(await listMcpConnections(invalid), { kind: "error", status: 200 });
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
