/**
 * El directorio de la cuenta desde la ventana: el mismo `GET /v1/me/workspaces`
 * de la web, con el token de cliente del motor. La persona elige con qué sesión
 * (`account`); sin ella, la del workspace abierto o, si no es de ninguna
 * cuenta, la principal. Enlazar, subir y desenlazar van por Rust con la sesión de
 * persona de la ventana: Computers no acepta ahí el token de cliente.
 */
import { type Answer, listDirectory, setDirectoryPins } from "@terminus/computers";
import { invoke } from "../../lib/invoke.ts";
import type { Capabilities } from "../../lib/platform.ts";
import { listen } from "../../lib/serviceEvents";
import { type DanilSessionInfo, railSession, sessionKey, type WorkspaceAccount } from "../settings/danil-sessions.ts";

type ClientToken = { token: string; expires_at: number; endpoint: string };

async function accountOf(account?: string | null): Promise<string> {
  let key = account ?? null;
  if (!key) {
    const of = await invoke<WorkspaceAccount>("danil_workspace_account", {}).catch(() => null);
    key = of?.signed_in ? of.account : null;
    // El directorio es de la persona: con un workspace abierto que no es de ninguna cuenta, el de la sesión principal.
    if (!key && !of?.account) {
      const sessions = await invoke<DanilSessionInfo[]>("danil_sessions", {}).catch(() => null);
      const session = Array.isArray(sessions) ? railSession(sessions, of) : null;
      key = session ? sessionKey(session) : null;
    }
  }
  if (!key) throw Object.assign(new Error("no_account"), { detail: "no_account" });
  return key;
}

async function clientOf(account?: string | null): Promise<ClientToken> {
  return invoke<ClientToken>("account_relay_token", { account: await accountOf(account) });
}

/** La sesión de la ventana de la cuenta principal se guarda sin nombre; las demás, con el suyo. */
async function windowAccount(account?: string | null): Promise<string | undefined> {
  const key = await accountOf(account);
  const sessions = await invoke<DanilSessionInfo[]>("danil_sessions", {}).catch(() => null);
  const main = Array.isArray(sessions) ? sessions.find((s) => s.default)?.account : null;
  return main === key ? undefined : key;
}

const detailOf = (error: unknown): string | null =>
  error && typeof error === "object" && "detail" in error && typeof error.detail === "string" ? error.detail : null;

/** Una orden con la sesión de persona de la ventana; rechaza con el código de Computers (`no_session` sin ella). */
async function asPerson(send: (who: string | undefined) => Promise<unknown>, account: string | null | undefined, fallback: string): Promise<void> {
  const who = await windowAccount(account);
  try {
    await send(who);
  } catch (error) {
    const code = detailOf(error) ?? fallback;
    throw Object.assign(new Error(code), { detail: code });
  }
}

function refused(answer: Answer<unknown>): never {
  const code =
    answer.kind === "error" && answer.status === 403
      ? "not_account_admin"
      : answer.kind === "error" && answer.code
        ? answer.code
        : answer.kind === "unauthorized"
          ? "unauthorized"
          : "directory_unavailable";
  throw Object.assign(new Error(code), { detail: code });
}

export function desktopWorkspaceDirectory(): NonNullable<Capabilities["workspaceDirectory"]> {
  return {
    list: async (account) => {
      const client = await clientOf(account);
      const answer = await listDirectory(client.endpoint, client.token);
      if (answer.kind !== "ok") refused(answer);
      return answer.value;
    },
    pin: async (keys, account) => {
      const client = await clientOf(account);
      const answer = await setDirectoryPins(client.endpoint, client.token, keys);
      if (answer.kind !== "ok") refused(answer);
    },
    link: (workspaceId, danilWorkspaceId, account) =>
      asPerson((who) => invoke("agents_session_link", { account: who, workspaceId, danilWorkspaceId }), account, "link_failed"),
    create: (workspaceId, account) =>
      asPerson((who) => invoke("agents_session_create_danil_workspace", { account: who, workspaceId }), account, "create_failed"),
    unlink: (workspaceId, account) => asPerson((who) => invoke("agents_session_unlink", { account: who, workspaceId }), account, "unlink_failed"),
    onSession: (listener) => {
      let stop: (() => void) | null = null;
      let stopped = false;
      void listen<{ state?: string }>("agents-session", (event) => {
        const state = event.payload?.state;
        if (state === "signed_in" || state === "signed_out") listener(state);
      }).then((unlisten) => {
        if (stopped) unlisten();
        else stop = unlisten;
      });
      return () => {
        stopped = true;
        stop?.();
      };
    },
  };
}
