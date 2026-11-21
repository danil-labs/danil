import type { Session, SessionSource } from "./types.ts";

/**
 * Comandos RPC1 del motor que usa la sesión de Desk (P1: la sesión vive en el
 * motor). El host los ejecuta; aquí no hay Tauri ni red.
 */
type SessionCommand =
  | "danil_sessions"
  | "danil_connect_start"
  | "danil_connect_status"
  | "danil_client_token"
  | "danil_disconnect"
  | "open_external";

export interface DeskAuthHost {
  call<T = unknown>(method: SessionCommand, params?: Record<string, unknown>): Promise<T>;
}

/** Fila de `danil_sessions`: una cuenta con sesión en esta computadora. */
interface EngineSession {
  account: string | null;
  email: string | null;
  computer_id: string | null;
  organization_id?: string | null;
  status: "connected" | "pending" | "error";
  verification_uri_complete?: string | null;
  error?: string | null;
}

/** Respuesta de `danil_connect_start` y `danil_connect_status`. */
interface ConnectStatus {
  state: string;
  account?: string | null;
  verification_uri?: string | null;
  verification_uri_complete?: string | null;
  error?: string | null;
}

/** Respuesta de `danil_client_token`. */
interface ClientToken {
  token: string;
  endpoint?: string;
  expires_at?: number | null;
}

const LOGIN_POLL_MS = 2_000;
const LOGIN_TIMEOUT_MS = 10 * 60_000;
/** Margen para pedir otro token corto antes de que venza. */
const TOKEN_SKEW_MS = 30_000;

/** El motor nombra la sesión por la persona o, sin ella, por la computadora. */
const keyOf = (s: EngineSession) => s.account ?? s.computer_id ?? "";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sesión de Desk: varias cuentas, una por (correo, organización), guardadas en
 * el motor. El login lo hace el navegador (flujo de dispositivo de WorkOS por
 * identity): el motor deja el código pendiente, Desk abre la URL y espera a que
 * la sesión quede `connected`. Los tokens cortos salen de `danil_client_token`.
 */
export function createDeskSession(
  host: DeskAuthHost,
  /** workspaceId → llave de sesión (lo dice la plataforma, no se calcula aquí). */
  sessionKeyOfWorkspace: (workspaceId: string) => string | null = () => null,
): SessionSource & { refresh(): Promise<Session[]> } {
  let sessions: Session[] = [];
  const expired = new Set<string>();
  const tokens = new Map<string, { token: string; until: number }>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((f) => f());

  const read = async (): Promise<EngineSession[]> => (await host.call<EngineSession[]>("danil_sessions")) ?? [];

  const rebuild = (rows: EngineSession[]) => {
    sessions = rows
      .filter((s) => s.status === "connected" && keyOf(s))
      .map((s) => ({
        key: keyOf(s),
        email: s.email ?? "",
        organization_id: s.organization_id ?? null,
        expired: expired.has(keyOf(s)),
      }));
    notify();
  };

  const markExpired = (key: string) => {
    expired.add(key);
    tokens.delete(key);
    sessions = sessions.map((s) => (s.key === key ? { ...s, expired: true } : s));
    notify();
  };

  const refresh = async () => {
    rebuild(await read());
    return sessions;
  };

  return {
    list: () => sessions,
    refresh,

    async tokenFor(ref) {
      const key = sessions.some((s) => s.key === ref) ? ref : sessionKeyOfWorkspace(ref);
      if (!key) return null;
      const cached = tokens.get(key);
      if (cached && cached.until - TOKEN_SKEW_MS > Date.now()) return cached.token;
      try {
        const r = await host.call<ClientToken>("danil_client_token", { account: key });
        const until = r.expires_at ? r.expires_at * 1000 : Date.now() + 5 * 60_000;
        tokens.set(key, { token: r.token, until });
        if (expired.delete(key)) rebuild(await read());
        return r.token;
      } catch (e) {
        markExpired(key);
        throw e;
      }
    },

    // El borde con Bearer no exige CSRF.
    async csrf() {
      return "";
    },
    invalidateCsrf() {},

    onUnauthorized(sessionKey) {
      if (sessionKey) markExpired(sessionKey);
    },

    async add() {
      const known = new Set((await read()).filter((s) => s.status === "connected").map(keyOf));
      const started = await host.call<ConnectStatus>("danil_connect_start", { add: true });
      const url = started.verification_uri_complete ?? started.verification_uri;
      if (url) await host.call("open_external", { target: url }).catch(() => {});
      const deadline = Date.now() + LOGIN_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await delay(LOGIN_POLL_MS);
        const rows = await read();
        const fresh = rows.find((s) => s.status === "connected" && keyOf(s) && !known.has(keyOf(s)));
        if (fresh) {
          rebuild(rows);
          return sessions.find((s) => s.key === keyOf(fresh))!;
        }
        const failed = rows.find((s) => s.status === "error" && !known.has(keyOf(s)));
        if (failed) throw new Error(failed.error ?? "login_failed");
      }
      throw new Error("login_timeout");
    },

    async remove(key) {
      await host.call("danil_disconnect", { account: key });
      expired.delete(key);
      tokens.delete(key);
      await refresh();
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}
