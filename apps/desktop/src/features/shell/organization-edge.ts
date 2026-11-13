/**
 * Fuente del selector sobre el borde, para Desk (`edgeFetch` → `danil_edge_fetch`).
 * Una sola llamada por intento: el backoff y la `Idempotency-Key` los lleva
 * `organization-selection.ts`, que repite la misma clave en los reintentos de un `select`.
 * Un status que no es 2xx se vuelve `{status, code}`; uno desconocido se trata por su status.
 */
import type { OrganizationSource } from "./organization-selection.ts";

type Reply = { status: number; body: unknown; retry_after_ms?: number };
export type EdgeFetch = (method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string) => Promise<Reply>;

async function bodyOf(reply: Promise<Reply>): Promise<unknown> {
  const r = await reply;
  if (r.status >= 200 && r.status < 300) return r.body;
  const code = (r.body as { code?: unknown } | null)?.code;
  throw { status: r.status, code: typeof code === "string" ? code : `http_${r.status}`, retry_after_ms: r.retry_after_ms };
}

export function edgeOrganizationSource(edgeFetch: EdgeFetch, beforeSelect?: () => void): OrganizationSource {
  return {
    capabilities: () => bodyOf(edgeFetch("GET", "/v1/capabilities")),
    list: () => bodyOf(edgeFetch("GET", "/v1/identity/organizations")),
    select: (id, key) => {
      beforeSelect?.();
      return bodyOf(edgeFetch("POST", "/v1/identity/organizations/select", { organization_id: id }, key));
    },
  };
}
