/**
 * El borde `/v1` desde un navegador, igual para la web y el teléfono en la web: la sesión es
 * la cookie HttpOnly del borde (`credentials: "include"`), nunca un token en JS; cada escritura
 * pide antes su `X-CSRF-Token` a `identity/csrf`. Es el `MachinesTransport` de `machinesClient`.
 *
 * - Un fallo es `EdgeError` con `status`, `Retry-After`, `code` del problem+json y `request_id`.
 * - La persona (`identity/me`) se lee tolerante (regla 10): solo `id` es obligatorio; lo demás es
 *   opcional y los campos nuevos se ignoran, para que el servidor crezca sin recompilar.
 *
 * Sin APIs del DOM más allá de `fetch`, `AbortSignal` y `crypto.randomUUID`.
 */

export type EdgeDeployment = { origin: string; timeoutMs: number };

export class EdgeError extends Error {
  readonly status: number;
  readonly retryAfter: string | null;
  readonly code: string | null;
  readonly requestId: string | null;
  constructor(status: number, retryAfter: string | null, code: string | null = null, requestId: string | null = null) {
    super(`Edge HTTP ${status}`);
    this.status = status;
    this.retryAfter = retryAfter;
    this.code = code;
    this.requestId = requestId;
  }
}

export type EdgeTransport = {
  call(path: string, init?: RequestInit): Promise<Response>;
  mutation(path: string, init?: RequestInit): Promise<Response>;
};

/** Solo cookie: ni un portador ni una URL arbitraria cruzan por aquí. `path` es relativo a `/v1/`. */
export function edgeTransport(options: EdgeDeployment, request: typeof fetch = fetch): EdgeTransport {
  async function call(path: string, init: RequestInit = {}) {
    init.signal?.throwIfAborted();
    const deadline = AbortSignal.timeout(options.timeoutMs);
    const response = await request(`${options.origin}/v1/${path}`, {
      ...init,
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      signal: init.signal ? AbortSignal.any([init.signal, deadline]) : deadline,
      headers: { Accept: "application/json", ...init.headers },
    });
    if (!response.ok) {
      const problem =
        response.headers.get("content-type")?.split(";")[0] === "application/problem+json"
          ? ((await response.json().catch(() => null)) as { code?: unknown; request_id?: unknown } | null)
          : null;
      if (!response.bodyUsed) await response.body?.cancel();
      throw new EdgeError(
        response.status,
        response.headers.get("retry-after"),
        typeof problem?.code === "string" ? problem.code : null,
        response.headers.get("x-request-id") ?? (typeof problem?.request_id === "string" ? problem.request_id : null),
      );
    }
    return response;
  }
  async function mutation(path: string, init: RequestInit = {}) {
    const body = (await (await call("identity/csrf", { signal: init.signal })).json().catch(() => null)) as { csrf_token?: unknown } | null;
    const token = body?.csrf_token;
    if (typeof token !== "string" || !token || token.length > 128) throw new Error("invalid_csrf");
    return call(path, { ...init, method: init.method ?? "POST", headers: { ...init.headers, "X-CSRF-Token": token } });
  }
  return { call, mutation };
}

/** La persona según `GET /v1/identity/me`. */
export type EdgePerson = {
  id: string;
  name: string | null;
  email: string | null;
  /** El workspace activo de la sesión; `null` si falta elegirlo. */
  workspace: string | null;
  organizations: { id: string; name: string }[];
};

const text = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function personOf(body: unknown): EdgePerson {
  const r = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const id = text(r.id);
  if (!id) throw new Error("invalid_identity");
  const organizations = (Array.isArray(r.organizations) ? r.organizations : []).flatMap((raw) => {
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const oid = text(o.id);
    return oid ? [{ id: oid, name: text(o.name) ?? oid }] : [];
  });
  return { id, name: text(r.name), email: text(r.email), workspace: text(r.workspace), organizations };
}

/** Entrar, la persona y salir, contra `identity` por el borde. */
export function edgeIdentity(transport: EdgeTransport, origin: string) {
  return {
    /** La entrada de identity (WorkOS); `returnTo` debe ser una de sus vueltas exactas (`WEB_RETURN_URLS`). */
    loginUrl(returnTo: string) {
      const url = new URL(`${origin}/v1/identity/login`);
      url.searchParams.set("return_to", returnTo);
      return url.href;
    },
    async me(): Promise<EdgePerson> {
      return personOf(await (await transport.call("identity/me")).json());
    },
    async logout(): Promise<void> {
      await transport.mutation("identity/logout", { headers: { "Idempotency-Key": crypto.randomUUID() } });
    },
  };
}
