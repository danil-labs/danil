/**
 * Contrato MCP externo N1 (`platform/mcp-n1-v1`, Edge `/v1/connections*`):
 * conexiones de asistentes IA personales (Muse, Grok, Dot, Duet, Hermes…) que
 * operan contra Danil mediante el servidor MCP `https://mcp.danil.ai/mcp`.
 */
import type { Answer } from "./api.ts";
import type { EdgeMethod, EdgeReply } from "./client.ts";
import { EdgeError, type EdgeTransport } from "./edge.ts";

export type McpConnectionState = "active" | "paused" | "needs_setup" | "revoked";

export type McpDestination = { workspace: string; folder: string };

export type McpConnection = {
  id: string;
  client_id: string;
  organization_id: string | null;
  state: McpConnectionState;
  version: number;
  exclusions: McpDestination[];
};

export type McpAuditEntry = {
  action: string;
  occurred_at: string;
  version: number;
};

export type McpConnectionPatch =
  | { action: "pause" | "resume" }
  | { action: "configure"; organization_id: string; exclusions: McpDestination[] };

export type McpConnectionsTransport = {
  send(method: "GET" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<{ status: number; body: unknown }>;
};

export function deskMcpConnectionsTransport(
  send: <T = unknown>(method: EdgeMethod, path: string, body?: unknown) => Promise<EdgeReply<T>>,
): McpConnectionsTransport {
  return {
    async send(method, path, body) {
      const reply = await send(method, path, body);
      return { status: reply.status, body: reply.body };
    },
  };
}

export function webMcpConnectionsTransport(transport: EdgeTransport): McpConnectionsTransport {
  return {
    async send(method, path, body) {
      const rel = path.replace(/^\/v1\//, "");
      try {
        const res =
          method === "GET"
            ? await transport.call(rel)
            : await transport.mutation(rel, {
                method,
                ...(body !== undefined
                  ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
                  : {}),
              });
        const parsed = res.status === 204 ? null : await res.json().catch(() => null);
        return { status: res.status, body: parsed };
      } catch (error) {
        if (error instanceof EdgeError) {
          return { status: error.status, body: error.code ? { code: error.code } : null };
        }
        throw error;
      }
    },
  };
}

const VALID_STATES = new Set<McpConnectionState>(["active", "paused", "needs_setup", "revoked"]);

function parseDestination(raw: unknown): McpDestination | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.workspace !== "string" || !r.workspace || typeof r.folder !== "string") return null;
  return { workspace: r.workspace, folder: r.folder };
}

function parseMcpConnection(raw: unknown): McpConnection | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.id !== "string" ||
    !r.id ||
    typeof r.client_id !== "string" ||
    !r.client_id ||
    (r.organization_id !== null && typeof r.organization_id !== "string") ||
    typeof r.state !== "string" ||
    !VALID_STATES.has(r.state as McpConnectionState) ||
    typeof r.version !== "number" ||
    !Number.isInteger(r.version) ||
    r.version < 1 ||
    !Array.isArray(r.exclusions)
  ) {
    return null;
  }
  const exclusions: McpDestination[] = [];
  for (const item of r.exclusions) {
    const parsed = parseDestination(item);
    if (!parsed) return null;
    exclusions.push(parsed);
  }
  return {
    id: r.id,
    client_id: r.client_id,
    organization_id: r.organization_id,
    state: r.state as McpConnectionState,
    version: r.version,
    exclusions,
  };
}

function parseAuditEntry(raw: unknown): McpAuditEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.action !== "string" ||
    !r.action ||
    typeof r.occurred_at !== "string" ||
    !r.occurred_at ||
    typeof r.version !== "number" ||
    !Number.isInteger(r.version) ||
    r.version < 1
  ) {
    return null;
  }
  return { action: r.action, occurred_at: r.occurred_at, version: r.version };
}

function errorAnswer(status: number, body: unknown): Answer<never> {
  if (status === 401) return { kind: "unauthorized" };
  if (status === 404) return { kind: "missing" };
  const code =
    body && typeof body === "object" && typeof (body as { code?: unknown }).code === "string"
      ? (body as { code: string }).code
      : undefined;
  return { kind: "error", status, ...(code ? { code } : {}) };
}

async function callN1<T>(
  transport: McpConnectionsTransport,
  method: "GET" | "PATCH" | "DELETE",
  path: string,
  parse: (body: unknown) => T,
  body?: unknown,
): Promise<Answer<T>> {
  let reply: { status: number; body: unknown };
  try {
    reply = await transport.send(method, path, body);
  } catch {
    return { kind: "error", status: null };
  }
  if (reply.status < 200 || reply.status >= 300) {
    return errorAnswer(reply.status, reply.body);
  }
  try {
    return { kind: "ok", value: parse(reply.body) };
  } catch {
    return { kind: "error", status: reply.status };
  }
}

export function listMcpConnections(transport: McpConnectionsTransport): Promise<Answer<McpConnection[]>> {
  return callN1(transport, "GET", "/v1/connections", (body) => {
    const items = body && typeof body === "object" ? (body as { items?: unknown }).items : undefined;
    if (!Array.isArray(items)) throw new Error("invalid_connections");
    const parsed: McpConnection[] = [];
    for (const item of items) {
      const c = parseMcpConnection(item);
      if (c) parsed.push(c);
    }
    return parsed;
  });
}

export function getMcpConnection(transport: McpConnectionsTransport, id: string): Promise<Answer<McpConnection>> {
  return callN1(transport, "GET", `/v1/connections/${encodeURIComponent(id)}`, (body) => {
    const parsed = parseMcpConnection(body);
    if (!parsed) throw new Error("invalid_connection");
    return parsed;
  });
}

export function patchMcpConnection(
  transport: McpConnectionsTransport,
  id: string,
  patch: McpConnectionPatch,
): Promise<Answer<McpConnection>> {
  return callN1(
    transport,
    "PATCH",
    `/v1/connections/${encodeURIComponent(id)}`,
    (body) => {
      const parsed = parseMcpConnection(body);
      if (!parsed) throw new Error("invalid_connection");
      return parsed;
    },
    patch,
  );
}

export function revokeMcpConnection(transport: McpConnectionsTransport, id: string): Promise<Answer<null>> {
  return callN1(transport, "DELETE", `/v1/connections/${encodeURIComponent(id)}`, () => null);
}

export function listMcpConnectionAudit(
  transport: McpConnectionsTransport,
  id: string,
): Promise<Answer<McpAuditEntry[]>> {
  return callN1(transport, "GET", `/v1/connections/${encodeURIComponent(id)}/audit`, (body) => {
    const items = body && typeof body === "object" ? (body as { items?: unknown }).items : undefined;
    if (!Array.isArray(items)) throw new Error("invalid_audit");
    const parsed: McpAuditEntry[] = [];
    for (const item of items) {
      const entry = parseAuditEntry(item);
      if (entry) parsed.push(entry);
    }
    return parsed;
  });
}
