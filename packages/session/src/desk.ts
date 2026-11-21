import type { Session, SessionSource } from "./types.ts";

/** Host inyectado: llama al motor (auth.list/add/remove/token). Sin Tauri aquí. */
export interface DeskAuthHost {
  call<T = unknown>(method: "auth.list" | "auth.add" | "auth.remove" | "auth.token", params?: unknown): Promise<T>;
}

interface EngineSession {
  email: string;
  organization_id: string | null;
}

const keyOf = (s: EngineSession) => `${s.email}|${s.organization_id ?? ""}`;
const toSession = (s: EngineSession, expired = false): Session => ({
  key: keyOf(s),
  email: s.email,
  organization_id: s.organization_id,
  expired,
});

/**
 * Sesión Desk (P1): la sesión vive en el motor. Tokens cortos por auth.token.
 * csrf: el borde con Bearer no lo exige; se devuelve vacío.
 */
export function createDeskSession(
  host: DeskAuthHost,
  /** Resuelve workspaceId -> sessionKey (lo dice la plataforma, no se calcula aquí). */
  sessionKeyOfWorkspace: (workspaceId: string) => string | null = () => null,
): SessionSource & { refresh(): Promise<Session[]> } {
  let sessions: Session[] = [];
  const expired = new Set<string>();
  const listeners = new Set<() => void>();
  const rebuild = (list: EngineSession[]) => {
    sessions = list.map((s) => toSession(s, expired.has(keyOf(s))));
    listeners.forEach((f) => f());
  };
  const markExpired = (key: string) => {
    expired.add(key);
    sessions = sessions.map((s) => (s.key === key ? { ...s, expired: true } : s));
    listeners.forEach((f) => f());
  };

  return {
    list: () => sessions,
    async tokenFor(ref) {
      const key = sessions.some((s) => s.key === ref) ? ref : sessionKeyOfWorkspace(ref);
      if (!key) return null;
      const [email, org] = key.split("|");
      try {
        const r = await host.call<{ token: string } | string>("auth.token", {
          email,
          organization_id: org || null,
        });
        return typeof r === "string" ? r : r.token;
      } catch (e) {
        markExpired(key);
        throw e;
      }
    },
    async csrf() {
      return "";
    },
    invalidateCsrf() {},
    onUnauthorized(sessionKey) {
      if (sessionKey) markExpired(sessionKey);
    },
    async add() {
      const before = new Set(sessions.map((s) => s.key));
      const list = await host.call<EngineSession[]>("auth.add");
      rebuild(list);
      return sessions.find((s) => !before.has(s.key)) ?? sessions[sessions.length - 1]!;
    },
    async remove(key) {
      const [email, org] = key.split("|");
      await host.call("auth.remove", { email, organization_id: org || null });
      expired.delete(key);
      sessions = sessions.filter((s) => s.key !== key);
      listeners.forEach((f) => f());
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    async refresh() {
      rebuild(await host.call<EngineSession[]>("auth.list"));
      return sessions;
    },
  };
}
