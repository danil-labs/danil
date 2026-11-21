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

/** Las máquinas que son esta computadora: una por organización donde el motor la inscribió. */
async function selfMachines(): Promise<Set<string>> {
  try {
    const s = await invoke<{ organizations?: Array<{ machine_id?: string }> }>("danil_connected_status", {});
    return new Set((s.organizations ?? []).map((o) => o.machine_id).filter((id): id is string => Boolean(id)));
  } catch {
    return new Set();
  }
}

/** Host de Danil Desk: el IPC de Tauri hacia el motor local (comandos RPC1 por nombre). */
export function createTauriHost(): Host {
  let self = new Set<string>();
  const load = () => selfMachines().then((ids) => (self = ids));
  void load();
  // La inscripción cambia al iniciar o cerrar sesión: se vuelve a leer cuando el motor avisa.
  void tauriListen("person-session", () => void load());
  return {
    kind: "desk",
    isLocal: (machineId) => self.has(machineId),
    invoke,
    call: (method, params) => invoke(method, params),
    listen: (event, cb) => tauriListen(event, (e) => cb(e.payload)),
    openExternal: async (url) => {
      if (!/^https:\/\//i.test(url)) throw new Error("unsupported_url");
      await invoke("open_external", { target: url });
    },
  };
}
