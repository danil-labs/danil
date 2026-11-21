import { API_BASE } from "../../platform-client/src/config.ts";
import type { Session, SessionSource } from "./types.ts";

export interface WebSessionOptions {
  apiBase?: string;
  /** Inyectable para pruebas; por defecto location.assign. */
  redirect?: (url: string) => void;
}

/**
 * Sesión web: cookie HttpOnly puesta por el borde. JS nunca ve el token.
 * El fetch de csrf y de estado vive aquí (permitido por R1).
 */
export function createWebSession(opts: WebSessionOptions = {}): SessionSource & {
  refresh(): Promise<Session | null>;
} {
  const base = opts.apiBase ?? API_BASE;
  const redirect = opts.redirect ?? ((u: string) => location.assign(u));
  let current: Session | null = null;
  let csrfToken: Promise<string> | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((f) => f());

  return {
    list: () => (current ? [current] : []),
    tokenFor: async () => null,
    csrf() {
      csrfToken ??= fetch(`${base}/identity/csrf`, { credentials: "include" })
        .then(async (r) => {
          if (r.status === 401) throw new Error("unauthorized");
          if (!r.ok) throw new Error(`csrf_${r.status}`);
          const b = (await r.json()) as { csrf_token: string };
          return b.csrf_token;
        })
        .catch((e) => {
          csrfToken = null;
          throw e;
        });
      return csrfToken;
    },
    invalidateCsrf() {
      csrfToken = null;
    },
    onUnauthorized() {
      current = null;
      csrfToken = null;
      emit();
      redirect("/login");
    },
    async add() {
      throw new Error("unsupported: la web no tiene selector de correo");
    },
    async remove() {
      throw new Error("unsupported: cierra sesión y entra con otro correo");
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    async refresh() {
      const r = await fetch(`${base}/identity/me`, { credentials: "include" });
      if (r.status === 401) {
        this.onUnauthorized();
        return null;
      }
      if (!r.ok) throw new Error(`me_${r.status}`);
      const me = (await r.json()) as { email?: string; organization_id?: string | null };
      current = {
        key: "web",
        email: me.email ?? "",
        organization_id: me.organization_id ?? null,
        expired: false,
      };
      emit();
      return current;
    },
  };
}
