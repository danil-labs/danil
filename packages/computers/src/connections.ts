/**
 * Las conexiones de orquestadores externos de la persona (Hermes, OpenClaw,
 * ChatGPT…) que usan Danil por el MCP remoto de Danil Machines. Una conexión
 * nace `pending` cuando el orquestador llama por primera vez y no hace nada
 * hasta que la persona le da máquinas, workspace y modo de permisos.
 */
import { type Answer, apiUrl, type Fetch, globalFetch, request } from "./api.ts";

export type ConnectionState = "pending" | "active" | "paused" | "revoked";

export type ConnectionMachine = { computer_id: string; workspace: string; folder: string; root: string | null };

export type Connection = {
  id: string;
  client_id: string;
  client_name: string;
  state: ConnectionState;
  permission_mode: string | null;
  machines: ConnectionMachine[];
  limits: { tasks_per_day: number; concurrent_calls: number };
  /** Aviso firmado de respuestas (`task.replied`); el secreto solo se ve al crearlo. */
  webhook: { url: string; secret_set: boolean } | null;
  created_at: number;
  updated_at: number;
  last_used_at: number | null;
  usage: { day: string; tasks_created: number };
};

export type AuditEntry = {
  at: number;
  connection: string;
  tool: string;
  computer_id: string | null;
  request_id: string | null;
  outcome: "ok" | "error";
  code: string | null;
};

export type ConnectionPatch = {
  state?: "active" | "paused";
  permission_mode?: string | null;
  machines?: Array<{ computer_id: string; workspace: string; folder?: string }>;
  limits?: Partial<Connection["limits"]>;
  client_name?: string;
  /** `null` lo quita; `rotate` cambia el secreto aunque la URL no cambie. */
  webhook?: { url: string; rotate?: boolean } | null;
};

/** Lo que devuelve un cambio: con un webhook nuevo o rotado trae su secreto, una sola vez. */
export type UpdatedConnection = Connection & { webhook_secret?: string };

/**
 * La misma regla que el servidor (`computers` `webhookUrlOk`), para avisar antes
 * de mandar: HTTPS en el 443, sin credenciales ni hosts locales o de red privada.
 */
export function webhookUrlOk(raw: string): boolean {
  if (raw.length > 512) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^\[|^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  return host.includes(".");
}

/** Los modos del motor, del más estricto al más permisivo; el de la conexión es su techo. */
export const PERMISSION_MODES = ["lectura", "manual", "ediciones", "auto"] as const;

/** La URL que se pega en el orquestador. */
export function mcpUrl(endpoint: string): string {
  const url = apiUrl(endpoint, "/mcp");
  // Producción (machines.danil.ai y su alias computers.danil.ai) publica el MCP en mcp.danil.ai.
  return url === "https://machines.danil.ai/mcp" || url === "https://computers.danil.ai/mcp" ? "https://mcp.danil.ai/mcp" : url;
}

const rows = (body: unknown): Connection[] =>
  Array.isArray(body) ? (body.filter((c) => typeof c?.id === "string" && typeof c?.state === "string") as Connection[]) : [];

export function listConnections(endpoint: string, token: string, f: Fetch = globalFetch): Promise<Answer<Connection[]>> {
  return request(apiUrl(endpoint, "/v1/connections"), token, "GET", rows, f);
}

export function updateConnection(
  endpoint: string,
  token: string,
  id: string,
  patch: ConnectionPatch,
  f: Fetch = globalFetch,
): Promise<Answer<UpdatedConnection | null>> {
  return request(
    apiUrl(endpoint, `/v1/connections/${encodeURIComponent(id)}`),
    token,
    "PATCH",
    (body) => (body && typeof (body as Connection).id === "string" ? (body as UpdatedConnection) : null),
    f,
    patch,
  );
}

export function revokeConnection(endpoint: string, token: string, id: string, f: Fetch = globalFetch): Promise<Answer<null>> {
  return request(apiUrl(endpoint, `/v1/connections/${encodeURIComponent(id)}`), token, "DELETE", () => null, f);
}

export function connectionAudit(endpoint: string, token: string, id: string, f: Fetch = globalFetch): Promise<Answer<AuditEntry[]>> {
  return request(
    apiUrl(endpoint, `/v1/connections/${encodeURIComponent(id)}/audit`),
    token,
    "GET",
    (body) => (Array.isArray(body) ? (body as AuditEntry[]) : []),
    f,
  );
}

export type ConnectionCapabilities = {
  features: string[];
  limits: { max_destinations: number; max_destination_bindings: number };
};

/** Un 404 distingue el servicio anterior; las demás fallas no son falta de soporte. */
export function connectionCapabilities(endpoint: string, token: string, f: Fetch = globalFetch): Promise<Answer<ConnectionCapabilities>> {
  return request(apiUrl(endpoint, "/v1/connections/capabilities"), token, "GET", (body) => {
    const value = body as Partial<ConnectionCapabilities> | null;
    if (!Array.isArray(value?.features) || !value.features.every(v => typeof v === "string") ||
      !Number.isInteger(value.limits?.max_destinations) || (value.limits?.max_destinations ?? 0) < 1 ||
      !Number.isInteger(value.limits?.max_destination_bindings) || (value.limits?.max_destination_bindings ?? 0) < 1) {
      throw new Error("bad_capabilities");
    }
    return value as ConnectionCapabilities;
  }, f);
}
