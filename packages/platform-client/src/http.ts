import { API_BASE } from "./config.ts";
import type { ClientError } from "./errors.ts";
import type { Transport, TransportRequest } from "./generated/operations.ts";

/** Lo que devuelve un envío: estado HTTP y cuerpo ya leído. */
export type Reply = { status: number; body: unknown };

/** Cómo se reintenta (R10). Compartido por el transporte HTTP y el del motor. */
export type RetryOptions = {
  /** Aviso a la UI en cada reintento: {kind:"unavailable", retrying:true}. */
  onUnavailable?: (e: Extract<ClientError, { kind: "unavailable" }>) => void;
  onUnauthorized?: () => void;
  /** Intentos ante 404/501/503 o fallo de red antes de rendirse con retrying:false. */
  maxAttempts?: number;
  /** Ajustables solo para pruebas. */
  baseDelayMs?: number;
  maxDelayMs?: number;
};

export type HttpOptions = RetryOptions & {
  /** CSRF de la sesión web (lo inyecta session); se pide de nuevo tras un `csrf_failed`. */
  csrf?: () => string | undefined | Promise<string | undefined>;
  invalidateCsrf?: () => void;
};

const RETRYABLE = new Set([404, 501, 503]);
/** Con el tope de 30 s, unos 3 minutos de espera antes de mostrar «reintentar». */
const MAX_ATTEMPTS = 10;

/** 1s, 2s, 4s… tope 30s, con jitter completo hacia abajo (50%–100%). Único en el front. */
export function backoffDelay(attempt: number, base = 1000, max = 30000): number {
  const d = Math.min(max, base * 2 ** attempt);
  return d * (0.5 + Math.random() * 0.5);
}

/** Llave de idempotencia para una mutación nueva. */
export function idempotencyKey(): string {
  return crypto.randomUUID();
}

const gone = (): ClientError => ({ kind: "unavailable", retrying: false });

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(gone());
    const onAbort = () => {
      clearTimeout(id);
      reject(gone());
    };
    const id = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Una mutación solo se repite si lleva Idempotency-Key: así el servidor no la ejecuta dos veces. */
function repeatable(req: TransportRequest): boolean {
  return req.method === "GET" || Boolean(req.headers?.["Idempotency-Key"]);
}

function problem(status: number, body: unknown): Extract<ClientError, { kind: "error" }> {
  const j = (body ?? {}) as { error?: { code?: string; message?: string }; type?: string; detail?: string; title?: string; code?: string };
  const code = j.error?.code ?? j.code ?? (typeof j.type === "string" ? j.type.replace(/^urn:danil:problem:/, "") : "error");
  const message = j.error?.message ?? j.detail ?? j.title ?? "";
  return { kind: "error", status, code, message };
}

/**
 * El bucle de reintento de todo el front hacia el borde. `send` hace un envío
 * (fetch en la web, el motor en Desk) y lanza solo ante un fallo de red.
 */
export function withRetry(send: (req: TransportRequest, attempt: number) => Promise<Reply>, o: RetryOptions): Transport {
  const max = o.maxAttempts ?? MAX_ATTEMPTS;
  return async <T>(req: TransportRequest): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      let reply: Reply | undefined;
      try {
        reply = await send(req, attempt);
      } catch (e) {
        if (req.signal?.aborted) throw gone();
        if ((e as ClientError)?.kind) throw e;
        reply = undefined; // fallo de red: no disponible
      }
      if (reply && reply.status >= 200 && reply.status < 300) return reply.body as T;
      if (reply?.status === 401) {
        o.onUnauthorized?.();
        throw { kind: "unauthorized" } satisfies ClientError;
      }
      if (reply?.status === 403) {
        const p = problem(403, reply.body);
        throw (p.kind === "error" && p.code !== "error" ? p : { kind: "forbidden" }) satisfies ClientError;
      }
      if (!reply || RETRYABLE.has(reply.status)) {
        if (!repeatable(req) || attempt + 1 >= max) throw gone();
        o.onUnavailable?.({ kind: "unavailable", retrying: true });
        await sleep(backoffDelay(attempt, o.baseDelayMs, o.maxDelayMs), req.signal);
        continue;
      }
      throw problem(reply.status, reply.body);
    }
  };
}

function buildUrl(req: TransportRequest): string {
  const url = new URL(API_BASE + req.path, typeof location !== "undefined" ? location.href : undefined);
  for (const [k, v] of Object.entries(req.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
  return url.toString();
}

async function readBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

/**
 * Web: la cookie HttpOnly del borde (`credentials: "include"`) y `X-CSRF-Token`
 * en cada mutación. Un 403 `csrf_failed` pide otro CSRF y repite una vez (B-027).
 */
export function createHttpTransport(o: HttpOptions = {}): Transport {
  return withRetry(async (req) => {
    for (let csrfRetry = 0; ; csrfRetry++) {
      const headers: Record<string, string> = { Accept: "application/json, application/problem+json" };
      for (const [k, v] of Object.entries(req.headers ?? {})) if (v !== undefined) headers[k] = v;
      if (req.body !== undefined) headers["Content-Type"] = "application/json";
      if (req.method !== "GET") {
        const csrf = await o.csrf?.();
        if (csrf) headers["X-CSRF-Token"] = csrf;
      }
      const res = await fetch(buildUrl(req), {
        method: req.method,
        headers,
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        credentials: "include",
        signal: req.signal,
      });
      const body = await readBody(res);
      if (res.status === 403 && csrfRetry === 0 && problem(403, body).code === "csrf_failed") {
        o.invalidateCsrf?.();
        continue;
      }
      return { status: res.status, body };
    }
  }, o);
}

/** Lo que el motor expone para hablar con el borde en nombre de la persona (`person_session_fetch`). */
export type EngineFetch = (params: {
  method: string;
  path: string;
  body?: unknown;
  idempotencyKey?: string | null;
  context?: string | null;
}) => Promise<{ status: number; body?: unknown; empty_reason?: string | null }>;

/**
 * Desk: el motor llama al borde con la sesión que él guarda (P1). La ventana
 * nunca ve un token. `context` elige la organización (`X-Danil-Session`).
 */
export function createEngineTransport(fetchVia: EngineFetch, context: () => string | null | undefined, o: RetryOptions = {}): Transport {
  return withRetry(async (req) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query ?? {})) if (v !== undefined) qs.set(k, String(v));
    const path = `/v1${req.path}${qs.size ? `?${qs}` : ""}`;
    const r = await fetchVia({
      method: req.method,
      path,
      body: req.body,
      idempotencyKey: req.headers?.["Idempotency-Key"] ?? null,
      context: context() ?? null,
    });
    // Sin sesión en esa organización el motor responde vacío con su motivo: es un 401.
    if (r.empty_reason === "no_session") return { status: 401, body: { code: "no_session" } };
    return { status: r.status, body: r.body };
  }, o);
}
