/**
 * Lo que Desk pide al borde `/v1` (contrato `mvp-v1`). El token nunca llega
 * aquí: `danil_edge_fetch` lo pone en Rust, solo admite una lista cerrada de
 * rutas y contesta el status del borde tal cual. Un 404 o un 501 (la ruta aún
 * no existe), un 429 o un 503 se reintentan aquí solos, con backoff y la misma
 * `Idempotency-Key`, hasta que la ruta aparece.
 */
import { invoke } from "./invoke.ts";

export type Me = { id: string; name: string; state?: string; workspace: string | null; organizations: { id: string; name: string; type?: string; role?: string }[]; active_organization_id?: string | null };
export type Organization = { id: string; name: string; plan: string; role: string };
export type OrganizationList = { items: Organization[]; next_cursor: string | null; active_organization_id?: string | null };
export type Workspace = { id: string; org?: string; name: string; role?: string };
export type WorkspaceList = { items: Workspace[]; next_cursor: string | null; empty_reason?: string; active_workspace_id?: string | null };

export type Patience = {
  /** Corta la espera; la promesa rechaza con el último fallo. */
  signal?: AbortSignal;
  /** Primera espera entre intentos (por defecto 1 s). */
  minDelayMs?: number;
  idempotencyKey?: string;
  retryBudgetMs?: number;
};

const CEILING_MS = 60_000;

/** La espera antes del reintento `attempt`: crece al doble, respeta la del servidor y limita el backoff local a un minuto. */
export function nextDelay(attempt: number, hintMs: number | undefined, minDelayMs = 1000): number {
  const grown = minDelayMs * 2 ** Math.min(attempt, 16);
  return Math.max(Math.min(CEILING_MS, grown), hintMs ?? 0);
}

/** La respuesta del borde, sin tocar: el status, el cuerpo y `Location` si la hay. */
export type EdgeReply<T = unknown> = { status: number; body: T; location?: string; idempotency_key?: string; retry_after_ms?: number };

/** Un status que no es 2xx ni se reintenta: `detail` es el `code` del `problem+json`. */
export type EdgeRefusal = { detail: string; status: number; body: unknown; retry_after_ms?: number };

const RETRIED_STATUS = new Set([404, 429, 501, 503]);

/** Quien escucha los rechazos del borde (el selector de organización, ante `organization_selection_required`). */
let problemListener: ((e: EdgeRefusal) => void) | null = null;
export const onEdgeProblem = (listener: ((e: EdgeRefusal) => void) | null) => {
  problemListener = listener;
};
/** Rust contesta así sin red; sin sesión o fuera de la lista no se reintenta. */
const RETRIED_DETAIL = new Set(["unavailable"]);

const detail = (e: unknown) => (e && typeof e === "object" ? (e as { detail?: unknown }).detail : undefined);
const hint = (e: unknown) => {
  const v = e && typeof e === "object" ? (e as { retry_after_ms?: unknown }).retry_after_ms : undefined;
  return typeof v === "number" && v >= 0 ? v : undefined;
};

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<boolean>((resolve) => {
    if (signal?.aborted) return resolve(false);
    const finish = (waited: boolean) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      resolve(waited);
    };
    const abort = () => finish(false);
    const deadline = Date.now() + ms;
    const tick = () => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) finish(true);
      else timer = setTimeout(tick, Math.min(remaining, 2 ** 31 - 1));
    };
    let timer = setTimeout(tick, Math.min(ms, 2 ** 31 - 1));
    signal?.addEventListener("abort", abort, { once: true });
  });

/** Una llamada, sin reintentos: el status del borde tal cual. */
export function edgeFetch<T = unknown>(method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string): Promise<EdgeReply<T>> {
  const args: Record<string, unknown> = { method, path };
  if (body !== undefined) args.body = body;
  if (idempotencyKey) args.idempotencyKey = idempotencyKey;
  return invoke<EdgeReply<T>>("danil_edge_fetch", args);
}

/**
 * Reintenta hasta un 2xx (o hasta `signal`) y devuelve la respuesta entera
 * (`Location` incluida). Las escrituras repiten su `Idempotency-Key`.
 */
export async function edgeUntil<T = unknown>(method: "GET" | "POST", path: string, body?: unknown, patience: Patience = {}, send: typeof edgeFetch = edgeFetch): Promise<EdgeReply<T>> {
  const key = method === "POST" ? patience.idempotencyKey ?? crypto.randomUUID() : undefined;
  const deadline = Date.now() + (patience.retryBudgetMs ?? Infinity);
  let last: unknown;
  for (let attempt = 0; ; attempt++) {
    patience.signal?.throwIfAborted();
    let wait: number | undefined;
    try {
      const reply = await send<T>(method, path, body, key);
      if (reply.status >= 200 && reply.status < 300) return reply;
      const code = (reply.body as { code?: unknown } | null)?.code;
      last = { detail: typeof code === "string" ? code : `http_${reply.status}`, status: reply.status, body: reply.body, retry_after_ms: reply.retry_after_ms } satisfies EdgeRefusal;
      if (!RETRIED_STATUS.has(reply.status) || (reply.status === 404 && typeof code === "string" && code.endsWith("_not_found"))) {
        problemListener?.(last as EdgeRefusal);
        throw last;
      }
      wait = reply.retry_after_ms;
    } catch (e) {
      if (e === last) throw e;
      if (!RETRIED_DETAIL.has(String(detail(e)))) throw e;
      last = e;
      wait = hint(e);
    }
    const delay = nextDelay(attempt, wait, patience.minDelayMs) * (1 + Math.random() / 4);
    if (Date.now() + delay > deadline) throw last;
    if (!(await sleep(delay, patience.signal))) throw last;
  }
}

const bodyOf = <T>(method: "GET" | "POST", path: string, body: unknown, p?: Patience) => edgeUntil<T>(method, path, body, p).then((r) => r.body);

export const me = (p?: Patience) => bodyOf<Me>("GET", "/v1/identity/me", undefined, p);
export const organizations = (p?: Patience) => bodyOf<OrganizationList>("GET", "/v1/identity/organizations", undefined, p);
export const workspaces = (p?: Patience) => bodyOf<WorkspaceList>("GET", "/v1/workspaces", undefined, p);
export const selectOrganization = (organizationId: string, p?: Patience) =>
  bodyOf<{ organization: Organization; workspace: string | null }>("POST", "/v1/identity/organizations/select", { organization_id: organizationId }, p);
export const selectWorkspace = (workspaceId: string, p?: Patience) =>
  bodyOf<{ workspace: Workspace }>("POST", "/v1/workspaces/select", { workspace: workspaceId }, p);
