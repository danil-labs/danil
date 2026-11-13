/**
 * Las máquinas de la organización por el borde (`/v1/machines`), vistas desde Desk.
 * Es el cliente único de `@terminus/computers` (`machines.ts`) con el Bearer de la
 * sesión de Desk: el access vive en Rust (`desk_access_token`, del login por navegador)
 * y la webview solo lo pide por IPC, nunca lo guarda. Sin sesión de Desk o sin ese
 * comando, la nube queda «no disponible» y se reintenta; el motor local no se toca.
 */
import { type Computer, type MachinesAnswer, machineToComputer, machinesClient } from "@terminus/computers";

/** El borde con su versión; el único origen HTTP de la nube para Desk. */
export const EDGE_ENDPOINT = "https://edge.danil.ai/v1";
export const CLOUD_RETRY_MS = 30_000;

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export type CloudMachines = ReturnType<typeof createCloudMachines>;

export function createCloudMachines(invoke: Invoke, endpoint = EDGE_ENDPOINT) {
  const client = machinesClient({
    endpoint,
    getToken: async () => {
      const token = await invoke("desk_access_token", {});
      if (typeof token !== "string" || !token) throw new Error("no_session");
      return token;
    },
  });
  return {
    client,
    /** Las máquinas como filas de flota; `available: false` cuando el servidor o la sesión aún no las tienen (se reintenta solo). */
    async rows(): Promise<{ available: boolean; computers: Computer[] }> {
      const answer: MachinesAnswer<unknown> & { value?: unknown } = await client.list();
      if (answer.kind === "ok") return { available: true, computers: (answer.value as Parameters<typeof machineToComputer>[0][]).map(machineToComputer) };
      // `error` sin estado es «sin sesión» o sin red; `unavailable`, un 404 o 501 del borde.
      return { available: false, computers: [] };
    },
  };
}
