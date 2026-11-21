import { API_BASE } from "./config.ts";
import type { ClientError } from "./errors.ts";
import type { Transport, TransportRequest } from "./generated/operations.ts";

export type HttpOptions = {
  /** Desk: token Bearer. En web no se pasa y se usa la cookie (credentials: "include"). */
  getToken?: (workspaceId?: string) => string | undefined | Promise<string | undefined>;
  /** Workspace activo, solo para getToken. */
  getWorkspaceId?: () => string | undefined;
  /** Provider de X-CSRF, lo inyecta session. */
  csrf?: () => string | undefined | Promise<string | undefined>;
  onUnauthorized?: () => void;
  /** Aviso a la UI en cada reintento: {kind:"unavailable", retrying:true}. */
  onUnavailable?: (e: Extract<ClientError, { kind: "unavailable" }>) => void;
  /** Mientras haya suscriptor (no abortada) el reintento no tiene límite. */
  signal?: AbortSignal;
  /** Ajustables solo para pruebas. */
  baseDelayMs?: number;
  maxDelayMs?: number;
};

const RETRYABLE = new Set([404, 501, 503]);

/** 1s, 2s, 4s… tope 30s, con jitter completo hacia abajo (50%–100%). */
export function backoffDelay(attempt: number, base = 1000, max = 30000): number {
  const d = Math.min(max, base * 2 ** attempt);
  return d * (0.5 + Math.random() * 0.5);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject({ kind: "unavailable", retrying: false } satisfies ClientError);
    const id = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(id); reject({ kind: "unavailable", retrying: false } satisfies ClientError); };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function buildUrl(req: TransportRequest): string {
  const url = new URL(API_BASE + req.path, typeof location !== "undefined" ? location.href : undefined);
  for (const [k, v] of Object.entries(req.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
  return url.toString();
}

async function once(req: TransportRequest, o: HttpOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json, application/problem+json" };
  for (const [k, v] of Object.entries(req.headers ?? {})) if (v !== undefined) headers[k] = v;
  if (req.body !== undefined) headers["Content-Type"] = "application/json";
  // Desk: Bearer del motor. Web: sin token, va la cookie HttpOnly del borde.
  const token = o.getToken ? await o.getToken(o.getWorkspaceId?.()) : undefined;
  if (token) headers.Authorization = `Bearer ${token}`;
  // El borde compara `x-csrf-token` con el de la sesión web en toda mutación.
  if (!token && req.method !== "GET") {
    const csrf = await o.csrf?.();
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }
  return fetch(buildUrl(req), {
    method: req.method,
    headers,
    body: req.body === undefined ? undefined : JSON.stringify(req.body),
    credentials: token ? "omit" : "include",
    signal: o.signal,
  });
}

async function toError(res: Response): Promise<ClientError> {
  let code = "error";
  let message = res.statusText;
  try {
    const j = await res.json();
    code = j?.error?.code ?? (typeof j?.type === "string" ? j.type.replace(/^urn:danil:problem:/, "") : code);
    message = j?.error?.message ?? j?.detail ?? j?.title ?? message;
  } catch { /* cuerpo no JSON */ }
  return { kind: "error", status: res.status, code, message };
}

/** El único fetch del front hacia el borde. Rechaza con ClientError. */
export function createTransport(o: HttpOptions = {}): Transport {
  return async <T>(req: TransportRequest): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      let res: Response | undefined;
      try {
        res = await once(req, o);
      } catch (e) {
        if (o.signal?.aborted) throw { kind: "unavailable", retrying: false } satisfies ClientError;
        res = undefined; // fallo de red: se trata como no disponible
      }
      if (res && res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
      if (res?.status === 401) {
        o.onUnauthorized?.();
        throw { kind: "unauthorized" } satisfies ClientError;
      }
      if (res?.status === 403) throw { kind: "forbidden" } satisfies ClientError;
      if (!res || RETRYABLE.has(res.status)) {
        o.onUnavailable?.({ kind: "unavailable", retrying: true });
        await sleep(backoffDelay(attempt, o.baseDelayMs, o.maxDelayMs), o.signal);
        continue;
      }
      throw await toError(res);
    }
  };
}
