import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";
import type { Host } from "./index.ts";

const ENGINE_DOWN_RETRIES = 20;
const ENGINE_DOWN_WAIT_MS = 500;

const codeOf = (e: unknown): string | undefined =>
  typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : undefined;

/**
 * Antes de que la ventana tenga motor, el proxy de Tauri contesta `engine_down`
 * sin ejecutar nada: se espera y se repite. Cualquier otro fallo cruza tal cual.
 */
async function invoke<T>(command: string, args?: unknown): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await tauriInvoke<T>(command, (args ?? {}) as Record<string, unknown>);
    } catch (e) {
      if (codeOf(e) !== "engine_down" || i >= ENGINE_DOWN_RETRIES) throw e;
      await new Promise((r) => setTimeout(r, ENGINE_DOWN_WAIT_MS));
    }
  }
}

/** Host de Danil Desk: el IPC de Tauri hacia el motor local (comandos RPC1 por nombre). */
export function createTauriHost(): Host {
  return {
    kind: "desk",
    invoke,
    call: (method, params) => invoke(method, params),
    listen: (event, cb) => tauriListen(event, (e) => cb(e.payload)),
    openExternal: async (url) => {
      await invoke("open_external", { target: url });
    },
  };
}
