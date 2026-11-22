/**
 * Lo que Desk pide al borde `/v1` (contrato `mvp-v1`). El token nunca llega
 * aquí: `danil_edge_fetch` lo pone en Rust, solo admite una lista cerrada de
 * rutas. `edgeUntil` reintenta 404, 429, 501 y 503 con backoff e idempotencia.
 */
import { invoke } from "../../engine-client/src/client.ts";
import { newIdempotencyKey } from "./idempotency.ts";


export type Patience = {
  /** Corta la espera; la promesa rechaza con el último fallo. */
  signal?: AbortSignal;
  /** Primera espera entre intentos (por defecto 1 s). */
  minDelayMs?: number;
  idempotencyKey?: string;
  retryBudgetMs?: number;
};

/** Invalida las lecturas al cambiar la organización de la sesión. */
export const ORGANIZATION_CHANGED = "danil:organization-changed";
const CEILING_MS = 60_000;
let context = new AbortController();

/** Una intención no sobrevive al cambio de sesión o tenant. */
export function cancelEdgeWrites(): void {
  context.abort();
  context = new AbortController();
}

/** La espera antes del reintento `attempt`: crece al doble, respeta la del servidor y limita el backoff local a un minuto. */
export function nextDelay(attempt: number, hintMs: number | undefined, minDelayMs = 1000): number {
  const grown = minDelayMs * 2 ** Math.min(attempt, 16);
  return Math.max(Math.min(CEILING_MS, grown), hintMs ?? 0);
}

/** Los métodos que `danil_edge_fetch` envía tal cual; todo lo que no es GET es una escritura. */
export type EdgeMethod = "GET" | "POST" | "PUT" | "DELETE";

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
export function edgeFetch<T = unknown>(method: EdgeMethod, path: string, body?: unknown, idempotencyKey?: string): Promise<EdgeReply<T>> {
  const args: Record<string, unknown> = { method, path };
  if (body !== undefined) args.body = body;
  if (idempotencyKey) args.idempotencyKey = idempotencyKey;
  return invoke<EdgeReply<T>>("danil_edge_fetch", args);
}

/**
 * Reintenta hasta un 2xx (o hasta `signal`) y devuelve la respuesta entera
 * (`Location` incluida). Las escrituras repiten su `Idempotency-Key`.
 */
export async function edgeUntil<T = unknown>(method: EdgeMethod, path: string, body?: unknown, patience: Patience = {}, transport: { send: typeof edgeFetch; onProblem?: (e: EdgeRefusal) => void } = { send: edgeFetch, onProblem: e => problemListener?.(e) }): Promise<EdgeReply<T>> {
  const write = method !== "GET";
  const signal = write ? AbortSignal.any([context.signal, ...(patience.signal ? [patience.signal] : [])]) : patience.signal;
  const key = write ? patience.idempotencyKey ?? newIdempotencyKey() : undefined;
  const deadline = Date.now() + (patience.retryBudgetMs ?? Infinity);
  let last: unknown;
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    if (attempt > 0 && Date.now() >= deadline) throw last;
    let wait: number | undefined;
    try {
      const reply = await transport.send<T>(method, path, body, key);
      if (reply.status >= 200 && reply.status < 300) return reply;
      const code = (reply.body as { code?: unknown } | null)?.code;
      last = { detail: typeof code === "string" ? code : `http_${reply.status}`, status: reply.status, body: reply.body, retry_after_ms: reply.retry_after_ms } satisfies EdgeRefusal;
      if (!RETRIED_STATUS.has(reply.status) || (reply.status === 404 && typeof code === "string" && (code === "not_found" || code.endsWith("_not_found")))) {
        transport.onProblem?.(last as EdgeRefusal);
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
    if (!(await sleep(delay, signal))) throw last;
  }
}



/**
 * Lo que el borde atiende sin organización (ctx=none y lo que sirve antes de autenticar; edge
 * `routing.ts` `optional_operations`, `index.ts` 78-81 y `web-session.ts`). Todo lo demás exige
 * `X-Danil-Session`: sin él, el borde responde 403 `organization_selection_required`.
 */
function contextFree(method: string, path: string): boolean {
  const get = method === "GET", post = method === "POST";
  if (get && ["/v1/identity/me", "/v1/identity/organizations", "/v1/workspaces", "/v1/billing/catalog", "/v1/capabilities", "/v1/identity/login", "/v1/identity/callback", "/v1/identity/csrf"].includes(path)) return true;
  if (post && ["/v1/identity/organizations/select", "/v1/identity/login/add", "/v1/identity/logout", "/v1/identity/contexts"].includes(path)) return true;
  if (path.startsWith("/v1/identity/desk/") || path.startsWith("/v1/identity/harness/")) return true;
  if (get && (path === "/v1/identity/sessions" || path.startsWith("/v1/identity/sessions/"))) return true;
  if (post && /^\/v1\/identity\/(sessions|contexts)\/[^/]+\/logout$/.test(path)) return true;
  return (get || post) && (path === "/v1/credentials/github/callback" || path === "/v1/credentials/github/done");
}

/** El borde de la ventana web y el contexto de su grupo activo (`setEdgeContext`). */
let edgeContext: { origin: string; current: () => string | null } | null = null;
/** La ventana web da su borde y su grupo activo; `null` al cerrarla. */
export function setEdgeContext(origin: string | null, current?: () => string | null): void {
  edgeContext = origin && current ? { origin: new URL(origin).origin, current } : null;
}

/** Toda llamada al borde con organización lleva el contexto del grupo activo, salvo que quien llama ya puso el suyo. */
function withEdgeContext(input: RequestInfo | URL, init?: RequestInit): RequestInit | undefined {
  if (!edgeContext) return init;
  const request = input instanceof Request ? input : null;
  const url = new URL(request ? request.url : String(input), globalThis.location?.href);
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  if (url.origin !== edgeContext.origin || !url.pathname.startsWith("/v1/") || method === "OPTIONS" || contextFree(method, url.pathname)) return init;
  const headers = new Headers(init?.headers ?? request?.headers);
  if (headers.has("X-Danil-Session")) return init;
  const context = edgeContext.current();
  if (!context) return init;
  headers.set("X-Danil-Session", context);
  return { ...init, headers };
}

/** El `fetch` real de la plataforma para las fuentes que lo necesitan directamente. */
export const platformFetch: typeof fetch = (input, init) => fetch(input, withEdgeContext(input, init));

/** Una ruta del borde a partir de su tramo relativo (`workspaces/…` → `/v1/workspaces/…`). */
export const edgePath = (path: string) => `/v1/${path}`;
