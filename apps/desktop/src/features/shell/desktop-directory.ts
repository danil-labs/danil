/**
 * El directorio de workspaces en la ventana de escritorio: el mismo menú del perfil
 * que la web, con la sesión de persona que guarda Rust (`agents_session.rs`). El
 * token nunca llega aquí: cada orden la arma y la firma la ventana.
 */
import type { DirectoryEntry } from "@terminus/computers";
import { invoke } from "../../lib/invoke.ts";
import { capabilities, setCapabilities } from "../../lib/platform";
import { listen } from "../../lib/serviceEvents";

/** Atención de la web: sin ella en esta ventana, un workspace que solo tiene agentes se abre ahí. */
const AGENTS_WEB = "https://alfa-app.danil.ai/inbox";

const codeOf = (error: unknown, fallback: string) =>
  error && typeof error === "object" && "detail" in error && typeof error.detail === "string" ? error.detail : fallback;

/** Rechaza con el código de Computers, como la web. */
async function call(sent: Promise<unknown>, fallback: string): Promise<void> {
  try {
    await sent;
  } catch (error) {
    throw new Error(codeOf(error, fallback));
  }
}

/** Se llama antes de montar la app. Sin sesión de la ventana, la lista falla y el menú no sale. */
export function installDesktopDirectory() {
  setCapabilities({
    ...capabilities(),
    workspaceDirectory: {
      list: async () => {
        const rows = await invoke<DirectoryEntry[]>("agents_session_directory", {});
        if (!Array.isArray(rows)) throw new Error("directory_unavailable");
        return { workspaces: rows, truncated: false };
      },
      pin: (keys) => call(invoke("agents_session_pins", { keys }), "pin_failed"),
      link: (workspaceId, danilWorkspaceId) => call(invoke("agents_session_link", { workspaceId, danilWorkspaceId }), "link_failed"),
      create: (workspaceId) => call(invoke("agents_session_create_danil_workspace", { workspaceId }), "create_failed"),
      openAgents: () => void invoke("site_open_external", { url: AGENTS_WEB }).catch(() => {}),
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
    },
  });
}
