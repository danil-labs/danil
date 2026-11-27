/**
 * Puente HTTP y SSE acotado para el conector visual de Danil Socials / Messaging
 * (Modalidad 1 `proxy`: cero tokens en el `<iframe>`, #398 / #400 / #401).
 *
 * Es el único punto autorizado en el front para hablar con `/v1/messaging/*` y
 * `/v1/agents/*` a través del borde `/v1` de Danil.
 */
import { currentEdgeOrigin, edgeFetch, platformFetch, type EdgeMethod } from "./client.ts";
import { newIdempotencyKey } from "./idempotency.ts";

const ALLOWED_METHODS = new Set<EdgeMethod>(["GET", "POST", "PATCH", "PUT", "DELETE"]);
const ALLOWED_PREFIXES = ["/v1/messaging/", "/v1/agents/", "/v1/inventory/"] as const;
const ALLOWED_EXACT = new Set(["/v1/messaging", "/v1/agents", "/v1/inventory"]);
const FORWARDED_REQUEST_HEADERS = new Set([
  "accept",
  "content-type",
  "idempotency-key",
  "last-event-id",
  "x-request-id",
]);
const NUMERIC_WORKSPACE_RE = /^[1-9][0-9]{0,18}$/;

export type PluginProxyHttpRequest = {
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
  workspaceId?: string | null;
  signal?: AbortSignal;
};

export type PluginProxyHttpResponse = {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: unknown;
};

export type PluginSseEvent = {
  id: string | null;
  event: string;
  data: unknown;
  raw: string;
};

export type ConnectSessionAsset = {
  id: string;
  name: string;
  category?: string | null;
};

export type ConnectSessionState = {
  id: string;
  channel_type?: string;
  status?: string;
  connect_url?: string | null;
  state?: string | null;
  expires_at?: string | null;
  channel_id?: string | null;
  channel_name?: string | null;
  publishable_key?: string | null;
  discovered_assets?: ConnectSessionAsset[];
  error_code?: string | null;
  error_message?: string | null;
};

/** Normaliza y valida una ruta pedida por el `<iframe>` contra la allowlist estricta. */
export function normalizePluginProxyPath(raw: string): string | null {
  if (typeof raw !== "string") return null;
  let trimmed = raw.trim();
  if (!trimmed || /[\r\n\0]/.test(trimmed)) return null;
  if (trimmed.startsWith("/api/v1/")) trimmed = trimmed.slice("/api".length);
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;

  const queryIndex = trimmed.indexOf("?");
  const pathname = queryIndex >= 0 ? trimmed.slice(0, queryIndex) : trimmed;
  const search = queryIndex >= 0 ? trimmed.slice(queryIndex) : "";
  if (/%(?:2e|2f|5c)/i.test(pathname) || pathname.includes("..") || pathname.includes("\\") || pathname.includes("#")) {
    return null;
  }
  const canonical = new URL(pathname, "https://edge.invalid").pathname;

  const allowed =
    ALLOWED_EXACT.has(canonical) ||
    ALLOWED_PREFIXES.some((prefix) => canonical.startsWith(prefix));
  if (!allowed) return null;

  return `${canonical}${search}`;
}

export function normalizeProxyMethod(raw: string | undefined): EdgeMethod | null {
  const upper = (raw ?? "GET").trim().toUpperCase() as EdgeMethod;
  return ALLOWED_METHODS.has(upper) ? upper : null;
}

/** Filtra encabezados desde el `<iframe>`: nunca permite inyectar auth, cookies ni CSRF. */
export function sanitizeProxyHeaders(
  input: Record<string, string> | undefined,
  options: { method: EdgeMethod; workspaceId?: string | null },
): Record<string, string> {
  const out: Record<string, string> = {};
  if (input && typeof input === "object") {
    for (const [key, value] of Object.entries(input)) {
      const lower = key.toLowerCase();
      if (!FORWARDED_REQUEST_HEADERS.has(lower) || typeof value !== "string") continue;
      if (/[\r\n\0]/.test(value)) continue;
      out[key] = value;
    }
  }
  const hasKey = (target: string) =>
    Object.keys(out).some((k) => k.toLowerCase() === target);

  if (!hasKey("accept")) out.Accept = "application/json";
  if (options.method !== "GET" && !hasKey("idempotency-key")) {
    out["Idempotency-Key"] = newIdempotencyKey();
  }
  if (options.workspaceId && NUMERIC_WORKSPACE_RE.test(options.workspaceId)) {
    out["X-Danil-Workspace"] = options.workspaceId;
  }
  return out;
}

function problemResponse(status: number, code: string, title: string): PluginProxyHttpResponse {
  return {
    status,
    ok: false,
    headers: { "content-type": "application/problem+json" },
    body: { status, code, title },
  };
}

async function readCsrfToken(
  origin: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetcher(`${origin}/v1/identity/csrf`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    redirect: "error",
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  const parsed = (await res.json().catch(() => null)) as { csrf_token?: unknown } | null;
  return typeof parsed?.csrf_token === "string" && parsed.csrf_token.length > 0 && parsed.csrf_token.length <= 128
    ? parsed.csrf_token
    : null;
}

/**
 * Ejecuta una petición `danil/http` desde el host hacia el borde `/v1`.
 * Usa cookie HttpOnly + CSRF en Web (`currentEdgeOrigin()`) o `danil_edge_fetch` en Desk.
 */
export async function executePluginProxyHttp(
  request: PluginProxyHttpRequest,
  deps: {
    origin?: string | null;
    fetcher?: typeof fetch;
    deskFetch?: typeof edgeFetch;
  } = {},
): Promise<PluginProxyHttpResponse> {
  const method = normalizeProxyMethod(request.method);
  if (!method) return problemResponse(405, "proxy_method_forbidden", "HTTP method not allowed");
  const normalizedPath = normalizePluginProxyPath(request.path);
  if (!normalizedPath) return problemResponse(403, "proxy_path_forbidden", "Path not allowed by plugin proxy");

  const headers = sanitizeProxyHeaders(request.headers, {
    method,
    workspaceId: request.workspaceId,
  });
  const origin = deps.origin !== undefined ? deps.origin : currentEdgeOrigin();

  if (origin) {
    const fetcher = deps.fetcher ?? platformFetch;
    if (method !== "GET") {
      const csrf = await readCsrfToken(origin, fetcher, request.signal).catch(() => null);
      if (csrf) headers["X-CSRF-Token"] = csrf;
    }
    let serializedBody: BodyInit | undefined;
    if (request.body !== undefined && method !== "GET") {
      if (typeof request.body === "string") {
        serializedBody = request.body;
      } else {
        serializedBody = JSON.stringify(request.body);
        if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
          headers["Content-Type"] = "application/json";
        }
      }
    }
    const timeout = AbortSignal.timeout(30_000);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
    const res = await fetcher(`${origin}${normalizedPath}`, {
      method,
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      headers,
      body: serializedBody,
      signal,
    });
    const contentType = res.headers.get("content-type") ?? "";
    const parsedBody =
      res.status === 204
        ? null
        : contentType.includes("json")
          ? await res.json().catch(() => null)
          : await res.text().catch(() => "");
    const replyHeaders: Record<string, string> = {};
    for (const key of ["content-type", "x-request-id", "retry-after", "location"]) {
      const v = res.headers.get(key);
      if (v) replyHeaders[key] = v;
    }
    return { status: res.status, ok: res.ok, headers: replyHeaders, body: parsedBody };
  }

  const deskFetch = deps.deskFetch ?? edgeFetch;
  const idempotencyKey = Object.entries(headers).find(
    ([k]) => k.toLowerCase() === "idempotency-key",
  )?.[1];
  const reply = await deskFetch(method, normalizedPath, request.body, idempotencyKey);
  return {
    status: reply.status,
    ok: reply.status >= 200 && reply.status < 300,
    headers: reply.location ? { location: reply.location } : {},
    body: reply.body,
  };
}

/** Lee el estado actual de una sesión `cs_...` de conexión de canal. */
export async function readConnectSession(
  sessionId: string,
  options: { workspaceId?: string | null; signal?: AbortSignal } = {},
): Promise<{ ok: boolean; status: number; session: ConnectSessionState | null; problem: Record<string, unknown> | null }> {
  const safeId = encodeURIComponent(sessionId.trim());
  const reply = await executePluginProxyHttp({
    method: "GET",
    path: `/v1/messaging/connect-sessions/${safeId}`,
    workspaceId: options.workspaceId,
    signal: options.signal,
  });
  const body = reply.body && typeof reply.body === "object" ? (reply.body as Record<string, unknown>) : null;
  return {
    ok: reply.ok,
    status: reply.status,
    session: reply.ok && body ? (body as unknown as ConnectSessionState) : null,
    problem: !reply.ok ? body : null,
  };
}

/** Completa una sesión `cs_...` (OAuth `code`+`state`, `page_id` de Messenger o config Web). */
export async function completeConnectSession(
  sessionId: string,
  payload: Record<string, unknown>,
  options: { workspaceId?: string | null; idempotencyKey?: string; signal?: AbortSignal } = {},
): Promise<{ ok: boolean; status: number; session: ConnectSessionState | null; problem: Record<string, unknown> | null }> {
  const safeId = encodeURIComponent(sessionId.trim());
  const reply = await executePluginProxyHttp({
    method: "POST",
    path: `/v1/messaging/connect-sessions/${safeId}/complete`,
    headers: options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined,
    body: payload,
    workspaceId: options.workspaceId,
    signal: options.signal,
  });
  const body = reply.body && typeof reply.body === "object" ? (reply.body as Record<string, unknown>) : null;
  const innerSession =
    body?.connect_session && typeof body.connect_session === "object"
      ? (body.connect_session as Record<string, unknown>)
      : body;
  const channel =
    body?.channel && typeof body.channel === "object" ? (body.channel as Record<string, unknown>) : null;
  const channelCfg =
    channel?.config && typeof channel.config === "object" ? (channel.config as Record<string, unknown>) : null;
  const session =
    reply.ok && innerSession
      ? ({
          ...innerSession,
          channel_name: innerSession.channel_name ?? channel?.name ?? null,
          publishable_key: innerSession.publishable_key ?? channelCfg?.publishable_key ?? null,
        } as unknown as ConnectSessionState)
      : null;
  return {
    ok: reply.ok,
    status: reply.status,
    session,
    problem: !reply.ok ? body : null,
  };
}

/** Parsea bloques SSE estándar (`id:`, `event:`, `data:`) desde un buffer incremental. */
export function parseSseChunk(
  buffer: string,
): { events: PluginSseEvent[]; rest: string } {
  const events: PluginSseEvent[] = [];
  const normalized = buffer.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n");
  const rest = blocks.pop() ?? "";
  for (const block of blocks) {
    if (!block.trim()) continue;
    let id: string | null = null;
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const sep = line.indexOf(":");
      const field = sep >= 0 ? line.slice(0, sep) : line;
      const rawValue = sep >= 0 ? line.slice(sep + 1) : "";
      const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
      if (field === "id") id = value;
      else if (field === "event") event = value || "message";
      else if (field === "data") dataLines.push(value);
    }
    if (dataLines.length === 0) continue;
    const raw = dataLines.join("\n");
    let data: unknown = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      // Mantiene el texto crudo si no es JSON.
    }
    events.push({ id, event, data, raw });
  }
  return { events, rest };
}

/** Desenvuelve `PluginSseEvent` al `SignalEvent` plano que espera el iframe del conector. */
export function unwrapPluginSseEvent(event: PluginSseEvent): Record<string, unknown> {
  if (event.data && typeof event.data === "object" && !Array.isArray(event.data)) {
    return {
      ...(event.id ? { id: event.id } : {}),
      ...(event.data as Record<string, unknown>),
    };
  }
  return { id: event.id, type: event.event, data: event.data };
}

/** Suscribe `GET /v1/messaging/events` con reconexión acotada (`Last-Event-ID`). */
export function subscribeMessagingEvents(options: {
  onEvent: (event: PluginSseEvent) => void;
  workspaceId?: string | null;
  channelId?: string | null;
  origin?: string | null;
  fetcher?: typeof fetch;
}): () => void {
  const origin = options.origin !== undefined ? options.origin : currentEdgeOrigin();
  if (!origin) return () => {};
  const fetcher = options.fetcher ?? platformFetch;
  const controller = new AbortController();
  let stopped = false;
  let lastEventId: string | null = null;
  let attempt = 0;
  const query = options.channelId ? `?channel_id=${encodeURIComponent(options.channelId)}` : "";
  const url = `${origin}/v1/messaging/events${query}`;

  const run = async () => {
    while (!stopped && !controller.signal.aborted) {
      try {
        const headers: Record<string, string> = { Accept: "text/event-stream" };
        if (lastEventId) headers["Last-Event-ID"] = lastEventId;
        if (options.workspaceId && NUMERIC_WORKSPACE_RE.test(options.workspaceId)) headers["X-Danil-Workspace"] = options.workspaceId;
        const res = await fetcher(url, {
          method: "GET", credentials: "include", cache: "no-store", redirect: "error", headers, signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          if ([401, 403, 404, 501].includes(res.status)) return;
          throw new Error(`SSE HTTP ${res.status}`);
        }
        attempt = 0;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!stopped && !controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { events, rest } = parseSseChunk(buffer);
          buffer = rest;
          for (const ev of events) {
            if (ev.id) lastEventId = ev.id;
            options.onEvent(ev);
          }
        }
      } catch {
        if (stopped || controller.signal.aborted) return;
      }
      const delayMs = Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5)) + Math.floor(Math.random() * 500);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delayMs);
        controller.signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }
  };

  void run();
  return () => { stopped = true; controller.abort(); };
}
