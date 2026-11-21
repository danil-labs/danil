import { clearQueries, createEngineTransport, type EngineFetch, type RetryOptions } from "@danil/platform-client";
import type {
  PersonSessionFetchParams,
  PersonSessionLoginCompleteParams,
  PersonSessionLoginParams,
  PersonSessionLogoutParams,
} from "@danil/engine-client";
import type { PendingLogin, Session, SessionSource, SessionState } from "./types.ts";

/**
 * Los comandos RPC1 de la sesión de la persona en el motor (extensión
 * `person_session_v1`, P1). El host los ejecuta por IPC; aquí no hay Tauri ni red.
 */
type PersonCommand =
  | "person_session_status"
  | "person_session_login"
  | "person_session_login_complete"
  | "person_session_logout"
  | "person_session_fetch"
  | "open_external";

export interface DeskAuthHost {
  /** Params tipados por los Person*Params generados del manifiesto (`@danil/engine-client`). */
  call<T = unknown>(method: PersonCommand, params?: object): Promise<T>;
  /** Evento `person-session` del motor: el estado cambió (login terminado, sesión cerrada). */
  listen(event: string, cb: (payload: unknown) => void): (() => void) | Promise<() => void>;
}

/**
 * Lo que devuelve `person_session_status` (descripción de `person_session_v1`;
 * el manifiesto lo declara como `Value`). Solo los campos que usa el front.
 */
interface EngineStatus {
  state: "connected" | "disconnected";
  sessions?: Array<{
    family: string;
    email: string | null;
    contexts: Array<{ context_id: string; org: string; org_name?: string | null; plan?: string | null; empty_reason?: string | null }>;
  }>;
  default_context?: string | null;
  login?: { state: "pending" | "done" | "error"; error?: string };
}

const LOGIN_WAIT_MS = 10 * 60_000;

const toSessions = (s: EngineStatus, expired: Set<string>): Session[] =>
  (s.sessions ?? []).flatMap((f) =>
    f.contexts
      .filter((c) => !c.empty_reason)
      .map((c) => ({
        key: c.context_id,
        email: f.email ?? "",
        organization_id: c.org,
        organization_name: c.org_name ?? null,
        plan: c.plan ?? null,
        expired: expired.has(c.context_id),
      })),
  );

/**
 * Sesión de Desk (P1): varias, una por (correo, organización) = un contexto
 * del motor. El login lo hace el navegador (PKCE por `/v1/identity/desk/*` en
 * el borde); el refresh vive en la bóveda del motor y la ventana nunca ve un
 * token: las llamadas al borde van por `person_session_fetch`.
 */
export function createDeskSession(host: DeskAuthHost): SessionSource {
  let sessions: Session[] = [];
  let activeKey: string | null = null;
  const expired = new Set<string>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((f) => f());

  const read = async (): Promise<EngineStatus> => host.call<EngineStatus>("person_session_status", {});
  const apply = (s: EngineStatus) => {
    sessions = toSessions(s, expired);
    if (!activeKey || !sessions.some((x) => x.key === activeKey)) activeKey = s.default_context ?? sessions[0]?.key ?? null;
    emit();
  };

  // El motor avisa cuando cambia la sesión (otro login, la CLI cerró sesión…).
  void host.listen("person-session", () => {
    void read().then(apply, () => {});
  });

  const fetchVia: EngineFetch = (params) =>
    host.call<{ status: number; body?: unknown; empty_reason?: string | null }>("person_session_fetch", params);

  const source: SessionSource = {
    list: () => sessions,
    active: () => activeKey,
    setActive(key) {
      if (sessions.some((s) => s.key === key) && key !== activeKey) {
        activeKey = key;
        emit();
      }
    },
    transport: (o: RetryOptions = {}) =>
      createEngineTransport(fetchVia, () => activeKey, {
        ...o,
        // Se vence la sesión que hizo la petición, no la activa en este momento (RV1 #21).
        onUnauthorized: (key) => {
          o.onUnauthorized?.(key);
          source.onUnauthorized(key);
        },
      }),
    onUnauthorized(sessionKey) {
      if (!sessionKey) return;
      expired.add(sessionKey);
      sessions = sessions.map((s) => (s.key === sessionKey ? { ...s, expired: true } : s));
      emit();
    },
    async refresh(): Promise<SessionState> {
      try {
        const s = await read();
        apply(s);
        return sessions.length ? { kind: "signed_in", sessions } : { kind: "signed_out" };
      } catch (error) {
        return { kind: "error", error };
      }
    },
    async add(): Promise<PendingLogin> {
      const known = new Set(sessions.map((s) => s.key));
      const started = await host.call<{ url: string }>("person_session_login", sessions.length ? { mode: "add" } : {});
      await host.call("open_external", { target: started.url }).catch(() => {});
      let cancelled = false;
      const done = (async (): Promise<Session> => {
        const deadline = Date.now() + LOGIN_WAIT_MS;
        while (!cancelled && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 1000));
          const s = await read();
          if (s.login?.state === "error") throw new Error(s.login.error ?? "login_failed");
          apply(s);
          const fresh = sessions.find((x) => !known.has(x.key));
          if (s.login?.state === "done" && fresh) {
            expired.delete(fresh.key);
            return fresh;
          }
        }
        throw new Error(cancelled ? "cancelled" : "timeout");
      })();
      return {
        url: started.url,
        complete: async (pasted) => {
          await host.call("person_session_login_complete", { pasted });
        },
        done,
        cancel: () => {
          cancelled = true;
        },
      };
    },
    async remove(key) {
      // Cerrar una sesión no cierra las otras (02): se cierra solo ese contexto.
      await host.call("person_session_logout", { context: key });
      clearQueries();
      expired.delete(key);
      await source.refresh();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
  return source;
}
