import {
  API_BASE,
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

/**
 * Sesión web: la cookie HttpOnly `__Host-danil_session` que pone el borde. JS
 * nunca ve el token. El perfil y el CSRF salen del cliente generado (getMe,
 * getCsrf), no de un fetch suelto.
 */
export function createWebSession(opts: WebSessionOptions = {}): SessionSource {
  const redirect = opts.redirect ?? ((u: string) => location.assign(u));
  let current: Session | null = null;
  let csrfToken: Promise<string> | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((f) => f());

  // Lecturas de sesión sin reintento largo: si el borde no responde, la app lo muestra como error.
  const bare = createOperations(createHttpTransport({ maxAttempts: 3 }));

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
      current = null;
      emit();
      redirect(webLoginUrl(location.origin + "/"));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    async refresh(): Promise<SessionState> {
      try {
        const me = await bare.getMe();
        // `/me` no trae correo: la persona se nombra por `name`. La organización es la activa o la primera.
        const org = me.organizations?.find((o) => o.id === me.active_organization_id) ?? me.organizations?.[0];
        current = {
          key: "web",
          email: "",
          name: me.name ?? null,
          organization_id: org?.id ?? null,
          organization_name: org?.name ?? null,
          plan: org?.plan ?? null,
          expired: false,
        };
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
    },
  };
  return source;
}
