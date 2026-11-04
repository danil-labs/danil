/**
 * La sesión de Atención en el escritorio, sin token: `agents_bff_fetch` lo pone en Rust.
 * Siempre es la sesión principal de la ventana (`{}`), la misma que usa el BFF.
 */
import { enterWorkspace } from "../../../../../packages/attention/src/workspace-account.ts";
import type { InboxSession } from "../../../../../packages/attention/src/inbox.ts";

type Invoke = (command: string, args: Record<string, unknown>) => Promise<unknown>;
type Transport = { request: typeof fetch; prefix: string };

export type WindowSession = InboxSession & { rememberWorkspace: (key: string | null) => void };

export function windowSession(invoke: Invoke, transport: () => Transport): WindowSession {
  let workspaceKey: string | null = null;
  const session: WindowSession = {
    // Lo lee `sessionFetch` para la cabecera, que la ventana descarta.
    getToken: async () => "window",
    // Entrar a otro workspace (`enterWorkspace`) cambia la cuenta de la sesión: el token nuevo la trae.
    unauthorized: () => invoke("agents_session_refresh", {}).then((renewed) => renewed === true, () => false),
    workspaceKey: () => workspaceKey,
    rememberWorkspace(value) {
      workspaceKey = value;
    },
    async reenter() {
      if (!workspaceKey) return false;
      const bff = transport();
      try {
        await enterWorkspace(session, bff.request, bff.prefix, workspaceKey);
        return true;
      } catch {
        return false;
      }
    },
  };
  return session;
}
