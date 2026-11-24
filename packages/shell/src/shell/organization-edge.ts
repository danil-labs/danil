/**
 * Fuente del selector sobre el borde, para Desk (`edgeFetch` → `danil_edge_fetch`). El backoff y la
 * `Idempotency-Key` los lleva `@terminus/computers` (`organizations.ts`); aquí solo se espera un `busy`.
 * Un status que no es 2xx se vuelve `{status, code}`; uno desconocido se trata por su status.
 */
import type { OrganizationSource } from "../../../platform-client/src/organizations.ts";
import { fetchEdgeOrganizations, selectEdgeOrganization } from "../../../platform-client/src/identity.ts";
import { type BusyOptions, retryBusy } from "./select-busy.ts";
import { CAPABILITIES_PATH } from "../../../platform-client/src/machines.ts";

type Reply = { status: number; body: unknown; retry_after_ms?: number };
export type EdgeFetch = (method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string) => Promise<Reply>;

async function bodyOf(reply: Promise<Reply>): Promise<unknown> {
  const r = await reply;
  if (r.status >= 200 && r.status < 300) return r.body;
  const code = (r.body as { code?: unknown } | null)?.code;
  throw { status: r.status, code: typeof code === "string" ? code : `http_${r.status}`, retry_after_ms: r.retry_after_ms };
}

export function edgeOrganizationSource(edgeFetch: EdgeFetch, beforeSelect?: () => void, busy?: BusyOptions): OrganizationSource {
  return {
    capabilities: () => bodyOf(edgeFetch("GET", CAPABILITIES_PATH)),
    list: () => bodyOf(fetchEdgeOrganizations(edgeFetch)),
    select: (id, key) => {
      beforeSelect?.();
      return retryBusy(() => bodyOf(selectEdgeOrganization(edgeFetch, id, key)), busy);
    },
  };
}
