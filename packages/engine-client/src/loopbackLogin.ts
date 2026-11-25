import type { InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "./client.ts";
import { canListenLoopback, cancelLoopbackLogin, listenLoopbackLogin, type LoopbackListenParams } from "../../host/src/loopbackLogin.ts";
import { listen } from "../../host/src/serviceEvents.ts";

export type LoopbackLoginOrigin =
  | { kind: "account"; provider: string; account: string }
  | { kind: "mcp"; server: string };

export type LoopbackLoginEvent = {
  login_id: string;
  origin: LoopbackLoginOrigin;
  port: number;
  path: string;
  expires_at: number;
  machine?: string;
  context?: string;
};

export type LoopbackLoginPending = {
  login_id: string;
  origin: LoopbackLoginOrigin;
  port: number;
  path: string;
  state: string;
  expires_at: number;
};

export function loopbackLoginPending(options?: InvokeOptions): Promise<LoopbackLoginPending[]> {
  return invoke<LoopbackLoginPending[]>("loopback_login_pending", {}, options);
}

export function loopbackLoginDeliver(
  args: { login_id: string; target: string },
  options?: InvokeOptions,
): Promise<void> {
  return invoke<void>("loopback_login_deliver", args, options);
}

export type LoopbackBridgeDeps = {
  canListen: () => boolean;
  pending: (options?: InvokeOptions) => Promise<LoopbackLoginPending[]>;
  listen: (params: LoopbackListenParams) => Promise<string>;
  cancel: (loginId: string) => Promise<void>;
  deliver: (args: { login_id: string; target: string }, options?: InvokeOptions) => Promise<void>;
};

const defaultDeps: LoopbackBridgeDeps = {
  canListen: canListenLoopback,
  pending: loopbackLoginPending,
  listen: listenLoopbackLogin,
  cancel: cancelLoopbackLogin,
  deliver: loopbackLoginDeliver,
};

type ActiveEntry = {
  account: string | null;
  cancelled: boolean;
};

function remoteMachineOf(payload: LoopbackLoginEvent | null | undefined): string | null {
  const m = payload?.machine;
  if (typeof m !== "string" || !m || m === "local") return null;
  return m;
}

function accountOf(origin: LoopbackLoginOrigin | null | undefined): string | null {
  return origin?.kind === "account" && typeof origin.account === "string" && origin.account
    ? origin.account
    : null;
}

/**
 * Coordina el puente de loopback remoto en Desk: al recibir `loopback-login` de
 * otra máquina consulta `loopback_login_pending`, abre el listener nativo en
 * `127.0.0.1:<port>` y entrega `target` con `loopback_login_deliver`.
 *
 * Nunca escribe `target`, `state`, `code` ni URLs de autenticación en logs, y
 * ante cualquier fallo cae en silencio al flujo existente de pegar URL.
 */
export function createLoopbackLoginBridge(deps: LoopbackBridgeDeps = defaultDeps) {
  const active = new Map<string, ActiveEntry>();

  async function handleEvent(payload: LoopbackLoginEvent): Promise<void> {
    if (!deps.canListen()) return;
    const machine = remoteMachineOf(payload);
    if (!machine) return;
    const loginId = typeof payload?.login_id === "string" ? payload.login_id : "";
    if (!loginId || active.has(loginId)) return;

    const entry: ActiveEntry = { account: accountOf(payload.origin), cancelled: false };
    active.set(loginId, entry);

    const headers: Record<string, string> = { "x-terminus-machine": machine };
    if (typeof payload.context === "string" && payload.context) {
      headers["x-danil-context"] = payload.context;
    }
    const options: InvokeOptions = { headers };

    try {
      const list = await deps.pending(options);
      if (entry.cancelled) return;
      const item = Array.isArray(list) ? list.find((row) => row?.login_id === loginId) : null;
      if (
        !item ||
        typeof item.state !== "string" ||
        !item.state ||
        typeof item.port !== "number" ||
        !Number.isInteger(item.port) ||
        item.port <= 0 ||
        item.port > 65535 ||
        typeof item.path !== "string" ||
        !item.path.startsWith("/") ||
        typeof item.expires_at !== "number"
      ) {
        return;
      }
      if (!entry.account) entry.account = accountOf(item.origin);

      const target = await deps.listen({
        loginId: item.login_id,
        port: item.port,
        path: item.path,
        state: item.state,
        expiresAt: item.expires_at,
      });
      if (entry.cancelled || typeof target !== "string" || !target.startsWith("/")) return;

      await deps.deliver({ login_id: item.login_id, target }, options);
    } catch {
      // Cualquier error (puerto ocupado, vencido, cancelado, motor sin soporte) cae al fallback manual.
    } finally {
      if (active.get(loginId) === entry) active.delete(loginId);
    }
  }

  function cancelLogin(loginId: string): void {
    const entry = active.get(loginId);
    if (!entry) return;
    entry.cancelled = true;
    active.delete(loginId);
    void deps.cancel(loginId);
  }

  function cancelForAccount(accountId: string): void {
    if (!accountId) return;
    for (const [loginId, entry] of [...active.entries()]) {
      if (entry.account === accountId) {
        entry.cancelled = true;
        active.delete(loginId);
        void deps.cancel(loginId);
      }
    }
  }

  function cancelAll(): void {
    for (const [loginId, entry] of [...active.entries()]) {
      entry.cancelled = true;
      active.delete(loginId);
      void deps.cancel(loginId);
    }
  }

  return {
    handleEvent,
    cancelLogin,
    cancelForAccount,
    cancelAll,
    activeCount: () => active.size,
  };
}

const sharedBridge = createLoopbackLoginBridge();

/** Cancela cualquier listener loopback asociado a una cuenta que terminó o se canceló. */
export function cancelLoopbackForAccount(accountId: string): void {
  sharedBridge.cancelForAccount(accountId);
}

/**
 * Monta los oyentes globales del puente de loopback en Desk.
 * Usa literales en `listen(...)` para que `scripts/guards/bridge.mjs` valide el contrato.
 */
export function mountLoopbackLoginBridge(): () => void {
  const unLoopback = listen<LoopbackLoginEvent>("loopback-login", (event) => {
    void sharedBridge.handleEvent(event.payload);
  });
  const unAccount = listen<{ account?: string; kind?: string }>("account", (event) => {
    if (event.payload?.kind === "done" && typeof event.payload.account === "string") {
      sharedBridge.cancelForAccount(event.payload.account);
    }
  });
  return () => {
    void unLoopback.then((stop) => stop());
    void unAccount.then((stop) => stop());
    sharedBridge.cancelAll();
  };
}
