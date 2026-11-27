import assert from "node:assert/strict";
import { test } from "node:test";
import { setEdgeContext } from "../../../../packages/platform-client/src/client.ts";
import {
  completeConnectSession,
  executePluginProxyHttp,
  normalizePluginProxyPath,
  parseSseChunk,
  sanitizeProxyHeaders,
  unwrapPluginSseEvent,
} from "../../../../packages/platform-client/src/messaging-proxy.ts";
import {
  classifyConnectProblem,
  deriveInitialConnectPhase,
  isInteractiveMcpApp,
  isMessagingConnectCall,
  isSafeConnectUrl,
  parseAllowedOriginsInput,
  parseConnectSessionPayload,
  parseMessagingCardTarget,
} from "../../../../packages/features/chat/src/model/messagingMcpApp.ts";

test("normalizePluginProxyPath permite solo rutas de messaging, agents e inventory y bloquea traversal codificado", () => {
  assert.equal(normalizePluginProxyPath("/v1/messaging/channels"), "/v1/messaging/channels");
  assert.equal(normalizePluginProxyPath("/api/v1/messaging/conversations?limit=20"), "/v1/messaging/conversations?limit=20");
  assert.equal(normalizePluginProxyPath("/v1/agents/runs"), "/v1/agents/runs");
  assert.equal(normalizePluginProxyPath("/api/v1/agents/sales"), "/v1/agents/sales");
  assert.equal(normalizePluginProxyPath("/v1/inventory/items"), "/v1/inventory/items");
  assert.equal(normalizePluginProxyPath("/api/v1/inventory"), "/v1/inventory");

  assert.equal(normalizePluginProxyPath("/v1/identity/me"), null);
  assert.equal(normalizePluginProxyPath("/v1/billing/subscriptions"), null);
  assert.equal(normalizePluginProxyPath("/v1/messaging/../identity/me"), null);
  assert.equal(normalizePluginProxyPath("/v1/messaging/%2e%2e/identity/me"), null);
  assert.equal(normalizePluginProxyPath("/v1/messaging/%2E%2E%2fidentity/me"), null);
  assert.equal(normalizePluginProxyPath("/v1/messaging/%5cidentity/me"), null);
  assert.equal(normalizePluginProxyPath("//evil.example/v1/messaging/channels"), null);
  assert.equal(normalizePluginProxyPath("https://evil.example/v1/messaging/channels"), null);
  assert.equal(normalizePluginProxyPath("/v1/messaging/channels\r\nX-Injected: 1"), null);
});

test("sanitizeProxyHeaders elimina credenciales/spoofing del iframe y agrega Idempotency-Key en mutaciones", () => {
  const headers = sanitizeProxyHeaders(
    {
      Authorization: "Bearer stolen",
      Cookie: "sid=evil",
      "X-Danil-Session": "forged",
      "X-CSRF-Token": "forged",
      "X-Danil-Workspace": "999",
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    { method: "POST", workspaceId: "42" },
  );
  assert.equal(headers.Authorization, undefined);
  assert.equal(headers.Cookie, undefined);
  assert.equal(headers["X-Danil-Session"], undefined);
  assert.equal(headers["X-CSRF-Token"], undefined);
  assert.equal(headers.Accept, "application/json");
  assert.equal(headers["X-Danil-Workspace"], "42");
  assert.ok(typeof headers["Idempotency-Key"] === "string" && headers["Idempotency-Key"].length > 8);

  const spoofNoHostWs = sanitizeProxyHeaders(
    { "x-danil-workspace": "999" },
    { method: "GET", workspaceId: null },
  );
  assert.equal(spoofNoHostWs["X-Danil-Workspace"], undefined);
  assert.equal(spoofNoHostWs["x-danil-workspace"], undefined);

  const getHeaders = sanitizeProxyHeaders({ Accept: "application/json" }, { method: "GET", workspaceId: "ws_non_numeric" });
  assert.equal(getHeaders["Idempotency-Key"], undefined);
  assert.equal(getHeaders["X-Danil-Workspace"], undefined);

  const zeroHeaders = sanitizeProxyHeaders({ Accept: "application/json" }, { method: "GET", workspaceId: "0" });
  assert.equal(zeroHeaders["X-Danil-Workspace"], undefined);
});

test("executePluginProxyHttp rechaza rutas fuera del allowlist con 403", async () => {
  const res = await executePluginProxyHttp({ method: "GET", path: "/v1/identity/me" });
  assert.equal(res.status, 403);
  assert.equal(res.ok, false);
  assert.deepEqual(res.body, {
    status: 403,
    code: "proxy_path_forbidden",
    title: "Path not allowed by plugin proxy",
  });
});

test("executePluginProxyHttp en modo web pide CSRF antes de mutaciones y usa credentials include", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/v1/identity/csrf")) {
      return new Response(JSON.stringify({ csrf_token: "csrf_tok_1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ id: "cs_99", status: "connected" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const res = await executePluginProxyHttp(
    {
      method: "POST",
      path: "/api/v1/messaging/connect-sessions/cs_99/complete",
      body: { code: "abc" },
      workspaceId: "7",
    },
    { origin: "https://edge.danil.ai", fetcher: fakeFetch },
  );

  assert.equal(res.status, 200);
  assert.equal(res.ok, true);
  assert.deepEqual(res.body, { id: "cs_99", status: "connected" });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://edge.danil.ai/v1/identity/csrf");
  assert.equal(calls[0].init?.credentials, "include");
  assert.equal(calls[1].url, "https://edge.danil.ai/v1/messaging/connect-sessions/cs_99/complete");
  assert.equal(calls[1].init?.credentials, "include");
  const sentHeaders = calls[1].init?.headers as Record<string, string>;
  assert.equal(sentHeaders["X-CSRF-Token"], "csrf_tok_1");
  assert.equal(sentHeaders["X-Danil-Workspace"], "7");
  assert.ok(sentHeaders["Idempotency-Key"]);
});

test("executePluginProxyHttp en modo Desk delega a deskFetch sin exponer tokens", async () => {
  let captured: { method: string; path: string; body: unknown; idempotencyKey?: string } | null = null;
  const res = await executePluginProxyHttp(
    {
      method: "POST",
      path: "/v1/messaging/connect-sessions/cs_1/complete",
      headers: { Authorization: "Bearer nope", "Idempotency-Key": "idem-fixed-1" },
      body: { selected_asset_id: "page_1" },
    },
    {
      origin: null,
      deskFetch: async (method, path, body, idempotencyKey) => {
        captured = { method, path, body, idempotencyKey };
        return { status: 200, body: { status: "connected" } };
      },
    },
  );
  assert.equal(res.status, 200);
  assert.equal(res.ok, true);
  assert.deepEqual(res.body, { status: "connected" });
  assert.equal(captured?.method, "POST");
  assert.equal(captured?.path, "/v1/messaging/connect-sessions/cs_1/complete");
  assert.equal(captured?.idempotencyKey, "idem-fixed-1");
});

test("parseSseChunk decodifica múltiples eventos y conserva el remanente incompleto", () => {
  const chunk =
    "id: 101\nevent: message.created\ndata: {\"id\":\"m1\"}\n\n" +
    "id: 102\nevent: conversation.updated\ndata: {\"id\":\"c1\",\"unread\":3}\n\n" +
    "id: 103\nevent: partial\ndata: {\"cut";

  const { events, rest } = parseSseChunk(chunk);
  assert.equal(events.length, 2);
  assert.deepEqual(events[0], { id: "101", event: "message.created", data: { id: "m1" }, raw: "{\"id\":\"m1\"}" });
  assert.deepEqual(events[1], {
    id: "102",
    event: "conversation.updated",
    data: { id: "c1", unread: 3 },
    raw: "{\"id\":\"c1\",\"unread\":3}",
  });
  assert.equal(rest, "id: 103\nevent: partial\ndata: {\"cut");

  const unwrapped = unwrapPluginSseEvent(events[0]!);
  assert.deepEqual(unwrapped, { id: "m1" });

  const signalWrapped = unwrapPluginSseEvent({
    id: "evt_9",
    event: "messaging.message.created",
    data: { id: "evt_9", type: "messaging.message.created", channel_id: "ch_1" },
    raw: "{}",
  });
  assert.equal(signalWrapped.type, "messaging.message.created");
  assert.equal(signalWrapped.channel_id, "ch_1");
});

test("parseConnectSessionPayload interpreta structuredContent y JSON en content[0].text", () => {
  const waCall = {
    server: "danil-messaging",
    tool: "messaging_connect_channel_start",
    args: { channel_type: "whatsapp" },
    result: {
      structuredContent: {
        id: "cs_wa_1",
        channel_type: "whatsapp",
        status: "pending",
        connect_url: "https://messaging.danil.ai/channels/connect/cs_wa_1?channel=whatsapp",
        state: "st_1",
      },
      _meta: { ui: { resourceUri: "ui://danil-messaging/connect", entity: "connect", interactive: true } },
    },
  };
  assert.equal(isMessagingConnectCall(waCall), true);
  assert.equal(isInteractiveMcpApp(waCall), true);

  const session = parseConnectSessionPayload(waCall);
  assert.ok(session);
  assert.equal(session.id, "cs_wa_1");
  assert.equal(session.channelType, "whatsapp");
  assert.equal(session.connectUrl, "https://messaging.danil.ai/channels/connect/cs_wa_1?channel=whatsapp");
  assert.equal(deriveInitialConnectPhase(session), "idle");

  const messengerCall = {
    server: "danil-messaging",
    tool: "messaging_connect_channel_start",
    args: { channel_type: "messenger" },
    result: {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            id: "cs_ms_2",
            channel_type: "messenger",
            status: "selecting_asset",
            discovered_assets: [{ id: "pg_1", name: "Danil Store", category: "Retail" }],
          }),
        },
      ],
    },
  };
  const msSession = parseConnectSessionPayload(messengerCall);
  assert.ok(msSession);
  assert.equal(msSession.channelType, "messenger");
  assert.equal(msSession.discoveredAssets.length, 1);
  assert.equal(msSession.discoveredAssets[0].name, "Danil Store");
  assert.equal(deriveInitialConnectPhase(msSession), "selecting_asset");
});

test("isSafeConnectUrl solo permite orígenes HTTPS de messaging y rechaza javascript/externos", () => {
  assert.equal(isSafeConnectUrl("https://messaging.danil.ai/channels/connect/cs_1"), true);
  assert.equal(isSafeConnectUrl("https://messaging-staging.danil.ai/channels/connect/cs_1"), true);
  assert.equal(isSafeConnectUrl("javascript:alert(1)"), false);
  assert.equal(isSafeConnectUrl("https://evil.example/channels/connect/cs_1"), false);
  assert.equal(isSafeConnectUrl(null), false);
});

test("parseMessagingCardTarget detecta tarjetas compactas de conversación y campaña", () => {
  const convCall = {
    server: "danil-messaging",
    tool: "messaging_get_conversation",
    args: {},
    result: {
      structuredContent: { id: "conv_42" },
      _meta: { ui: { entity: "conversation", entityId: "conv_42" } },
    },
  };
  const target = parseMessagingCardTarget(convCall);
  assert.deepEqual(target, {
    entity: "conversation",
    id: "conv_42",
    url: "https://messaging.danil.ai/?mode=card&entity=conversation&id=conv_42",
  });
  assert.equal(isInteractiveMcpApp(convCall), true);
});

test("classifyConnectProblem y parseAllowedOriginsInput cubren errores 410/409/422 y orígenes", () => {
  assert.deepEqual(classifyConnectProblem(410, null), {
    phase: "expired",
    key: "chat.messaging_connect.error_expired",
  });
  assert.deepEqual(classifyConnectProblem(0, "reconnect_channel_mismatch"), {
    phase: "error",
    key: "chat.messaging_connect.error_mismatch",
  });
  assert.deepEqual(classifyConnectProblem(422, null), {
    phase: "error",
    key: "chat.messaging_connect.error_type_mismatch",
  });
  assert.deepEqual(
    parseAllowedOriginsInput("https://a.com, https://b.com\nhttps://c.com "),
    ["https://a.com", "https://b.com", "https://c.com"],
  );
});

test("completeConnectSession desenvuelve connect_session y conserva channel_name y publishable_key", async () => {
  const originalFetch = globalThis.fetch;
  let capturedWorkspaceHeader: string | null = null;
  setEdgeContext("https://edge.danil.ai", () => "ctx_test_1");
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/v1/identity/csrf")) {
      return new Response(JSON.stringify({ csrf_token: "csrf_1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    capturedWorkspaceHeader = new Headers(init?.headers).get("X-Danil-Workspace");
    return new Response(
      JSON.stringify({
        connect_session: { id: "cs_web_1", status: "connected", channel_id: "ch_1" },
        channel: { id: "ch_1", name: "Web Chat", config: { publishable_key: "pk_live_123" } },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const res = await completeConnectSession("cs_web_1", { allowed_origins: ["https://danil.ai"] }, { workspaceId: "42" });
    assert.equal(res.ok, true);
    assert.equal(capturedWorkspaceHeader, "42");
    assert.equal(res.session?.id, "cs_web_1");
    assert.equal(res.session?.status, "connected");
    assert.equal(res.session?.channel_name, "Web Chat");
    assert.equal(res.session?.publishable_key, "pk_live_123");
  } finally {
    setEdgeContext(null);
    globalThis.fetch = originalFetch;
  }
});
