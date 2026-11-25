import { capabilities } from "../../../../host/src/platform";
import type { Answer } from "../../../../platform-client/src/api.ts";
import { edgeFetch, platformFetch } from "../../../../platform-client/src/client.ts";
import {
  deskMcpConnectionsTransport,
  listMcpConnectionAudit,
  listMcpConnections,
  patchMcpConnection,
  revokeMcpConnection,
  webMcpConnectionsTransport,
  type McpAuditEntry,
  type McpConnection,
  type McpConnectionPatch,
  type McpConnectionsTransport,
} from "../../../../platform-client/src/connections.ts";
import { edgeTransport, personOf } from "../../../../platform-client/src/edge.ts";

declare const __DANIL_WEB_API__: { origin: string; timeoutMs: number } | undefined;

export type ConnectionOrg = { id: string; name: string };
export type ConnectionWorkspace = { id: string; name: string };

export type LoadedConnectionsData = {
  connections: McpConnection[];
  organizations: ConnectionOrg[];
  activeOrganizationId: string | null;
  workspaces: ConnectionWorkspace[];
};

function currentTransport(): McpConnectionsTransport | null {
  if (capabilities().nativeWindow) {
    return deskMcpConnectionsTransport(edgeFetch);
  }
  if (typeof __DANIL_WEB_API__ !== "undefined" && __DANIL_WEB_API__) {
    return webMcpConnectionsTransport(edgeTransport(__DANIL_WEB_API__, (input, init) => platformFetch(input, init)));
  }
  return null;
}

function parseWorkspaces(raw: unknown): ConnectionWorkspace[] {
  const items = raw && typeof raw === "object" ? (raw as { items?: unknown }).items : undefined;
  if (!Array.isArray(items)) return [];
  const out: ConnectionWorkspace[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = typeof r.engine_workspace_id === "string" && r.engine_workspace_id
      ? r.engine_workspace_id
      : typeof r.id === "string" && r.id
        ? r.id
        : null;
    if (!id) continue;
    const name = typeof r.name === "string" && r.name ? r.name : id;
    out.push({ id, name });
  }
  return out;
}

export async function loadConnectionsData(): Promise<
  { ok: true; data: LoadedConnectionsData } | { ok: false; reason: string }
> {
  const transport = currentTransport();
  if (!transport) return { ok: false, reason: "no_account" };

  const [connections, meReply, wsReply] = await Promise.all([
    listMcpConnections(transport),
    transport.send("GET", "/v1/identity/me").catch(() => ({ status: 0, body: null })),
    transport.send("GET", "/v1/workspaces").catch(() => ({ status: 0, body: null })),
  ]);

  if (connections.kind === "unauthorized") return { ok: false, reason: "no_account" };
  if (connections.kind !== "ok") {
    return {
      ok: false,
      reason: connections.kind === "error" && connections.code ? connections.code : connections.kind,
    };
  }

  let organizations: ConnectionOrg[] = [];
  let activeOrganizationId: string | null = null;
  if (meReply.status === 200 && meReply.body && typeof meReply.body === "object") {
    try {
      const person = personOf(meReply.body);
      organizations = person.organizations;
    } catch {
      organizations = [];
    }
    const rawActive = (meReply.body as { active_organization_id?: unknown }).active_organization_id;
    if (typeof rawActive === "string" && rawActive) activeOrganizationId = rawActive;
    else if (organizations.length === 1) activeOrganizationId = organizations[0]?.id ?? null;
  }

  const workspaces = wsReply.status === 200 ? parseWorkspaces(wsReply.body) : [];
  return {
    ok: true,
    data: {
      connections: connections.value,
      organizations,
      activeOrganizationId,
      workspaces,
    },
  };
}

export async function patchConnectionN1(
  id: string,
  patch: McpConnectionPatch,
): Promise<Answer<McpConnection>> {
  const transport = currentTransport();
  if (!transport) return { kind: "unauthorized" };
  return patchMcpConnection(transport, id, patch);
}

export async function revokeConnectionN1(id: string): Promise<Answer<null>> {
  const transport = currentTransport();
  if (!transport) return { kind: "unauthorized" };
  return revokeMcpConnection(transport, id);
}

export async function listConnectionAuditN1(id: string): Promise<Answer<McpAuditEntry[]>> {
  const transport = currentTransport();
  if (!transport) return { kind: "unauthorized" };
  return listMcpConnectionAudit(transport, id);
}
