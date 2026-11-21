import {
  API_BASE,
  clearQueries,
  createHttpTransport,
  createOperations,
  isClientError,
  type RetryOptions,
} from "@danil/platform-client";
import type { Session, SessionSource, SessionState } from "./types.ts";

/** Entrada web: el borde manda a WorkOS (identity) y vuelve a `returnTo` con la cookie puesta. */
export function webLoginUrl(returnTo: string = location.href, apiBase: string = API_BASE): string {
  return `${apiBase}/identity/login?return_to=${encodeURIComponent(returnTo)}`;
}

export interface WebSessionOptions {
  /** Inyectable para pruebas; por defecto location.assign. */
  redirect?: (url: string) => void;
}

/** Intentos y esperas de la primera lectura tras la redirección de WorkOS (como apps/desktop). */
const FIRST_MOUNT_ATTEMPTS = 8;
const FIRST_RETRY_MS = 1000;
const MAX_RETRY_MS = 8000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransient(e: unknown): boolean {
  if (!isClientError(e)) return true;
  if (e.kind === "unavailable" || e.kind === "forbidden") return true;
  if (e.kind === "error" && (e.status === 403 || e.status === 404 || e.status === 503)) return true;
  const status = (e as { status?: number }).status;
  return status === 403 || status === 404 || status === 503;
}

function toSession(me: {
  name?: string | null;
  active_organization_id?: string | null;
  organizations?: Array<{ id: string; name?: string | null; plan?: string | null }> | null;
}): Session {
  // `/me` no trae correo: la persona se nombra por `name`. La organización es la activa o la primera.
  const org = me.organizations?.find((o) => o.id === me.active_organization_id) ?? me.organizations?.[0];
  return {
    key: "web",
    email: "",
    name: me.name ?? null,
    organization_id: org?.id ?? null,
    organization_name: org?.name ?? null,
    plan: org?.plan ?? null,
    expired: false,
  };
}

/**
 * Sesión web: la cookie HttpOnly `__Host-danil_session` que pone el borde. JS
 * nunca ve el token. El perfil y el CSRF salen del cliente generado (getMe,
 * getCsrf), no de un fetch suelto.
 */
export function createWebSession(opts: WebSessionOptions = {}): SessionSource {
  const redirect = opts.redirect ?? ((u: string) => location.assign(u));
  let current: Session | null = null;
  let csrfToken: Promise<string> | null = null;
  let firstMount = true;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((f) => f());

  // Lecturas de sesión sin reintento largo: si el borde no responde, la app lo muestra como error.
  const bare = createOperations(createHttpTransport({ maxAttempts: 3 }));
  const firstMountBare = createOperations(createHttpTransport({ maxAttempts: 1 }));

  const csrf = () => {
    csrfToken ??= bare
      .getCsrf()
      .then((r) => r.csrf_token)
      .catch((e) => {
        csrfToken = null;
        throw e;
      });
    return csrfToken;
  };
  const invalidateCsrf = () => {
    csrfToken = null;
  };

  const source: SessionSource = {
    list: () => (current ? [current] : []),
    active: () => (current ? current.key : null),
    setActive() {},
    transport: (o: RetryOptions = {}) =>
      createHttpTransport({
        ...o,
        csrf,
        invalidateCsrf,
        onUnauthorized: () => {
          o.onUnauthorized?.();
          source.onUnauthorized();
        },
      }),
    onUnauthorized() {
      clearQueries();
      current = null;
      csrfToken = null;
      emit();
      redirect(webLoginUrl(location.href));
    },
    async add() {
      throw new Error("unsupported: la web tiene una sola sesión; cierra sesión y entra con otro correo");
    },
    async remove() {
      await bare.logout({ body: {} }).catch(() => {});
      clearQueries();
      current = null;
      emit();
      redirect(webLoginUrl(location.origin + "/"));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    async refresh(): Promise<SessionState> {
      if (!firstMount) {
        try {
          const me = await bare.getMe();
          current = toSession(me);
          emit();
          return { kind: "signed_in", sessions: [current] };
        } catch (e) {
          if (isClientError(e) && e.kind === "unauthorized") {
            current = null;
            emit();
            return { kind: "signed_out" };
          }
          return { kind: "error", error: e };
        }
      }

      firstMount = false;
      let wait = FIRST_RETRY_MS;
      for (let attempt = 0; attempt < FIRST_MOUNT_ATTEMPTS; attempt++) {
        try {
          const me = await firstMountBare.getMe();
          current = toSession(me);
          emit();
          return { kind: "signed_in", sessions: [current] };
        } catch (e) {
          if (isClientError(e) && e.kind === "unauthorized") {
            current = null;
            emit();
            return { kind: "signed_out" };
          }
          if (attempt + 1 < FIRST_MOUNT_ATTEMPTS && isTransient(e)) {
            await sleep(wait);
            wait = Math.min(wait * 2, MAX_RETRY_MS);
            continue;
          }
          return { kind: "error", error: e };
        }
      }
      return { kind: "error", error: new Error("session_unavailable") };
    },
  };
  return source;
}
