/**
 * Las máquinas de la organización por el borde (`/v1/machines`), vistas desde Desk.
 * Es el cliente único de `@terminus/computers` (`machines.ts`). Todas las llamadas al
 * borde pasan por el comando Rust `danil_edge_fetch`: el access vive en Rust y nunca
 * llega a la webview. Un 404 o un 501 llega como `not_available_yet` y la nube queda
 * «no disponible»: se oculta con gracia y se reintenta sola, guiada por
 * `GET /v1/capabilities` (Desk compilado no se recompila por cambios del servidor).
 * El canal de datos no pasa por aquí: va directo al relay con el ticket (`wss://*.danil.ai`).
 */
import { type Computer, type Fetch, type MachinesAnswer, machineToComputer, machinesClient } from "@terminus/computers";

/** Solo una base para armar rutas `/v1/...`; la webview no llama a este origen (lo hace Rust). */
export const EDGE_ENDPOINT = "https://edge.danil.ai/v1";
export const CLOUD_RETRY_MS = 30_000;

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type EdgeError = { detail?: unknown; status?: unknown };

export type CloudMachines = ReturnType<typeof createCloudMachines>;

/** `danil_edge_fetch` con la forma de un `fetch`: el error de Rust vuelve a ser un estado HTTP, sin tokens. */
export function edgeFetch(invoke: Invoke, onProblem?: (error: unknown) => void): Fetch {
  return async (input, init) => {
    const method = init?.method ?? "GET";
    const path = new URL(input).pathname;
    const reply = (status: number, body: unknown = null) => ({ status, ok: status < 400, json: async () => body });
    try {
      const body = await invoke("danil_edge_fetch", method === "GET" ? { method, path } : { method, path, body: {} });
      return reply(200, body);
    } catch (raw) {
      const e = (raw && typeof raw === "object" ? raw : {}) as EdgeError;
      const code = typeof e.detail === "string" ? e.detail : "";
      if (code === "no_session") return reply(401);
      if (code === "not_available_yet") return reply(501);
      if (code === "unavailable") return reply(503);
      if (typeof e.status === "number") {
        // Un rechazo del contrato (p. ej. `403 organization_selection_required`) se lo cuenta a quien lo atiende, con la forma de Rust.
        onProblem?.(raw);
        return reply(e.status, { code });
      }
      throw raw;
    }
  };
}

export function createCloudMachines(invoke: Invoke, onProblem?: (error: unknown) => void, endpoint = EDGE_ENDPOINT) {
  const fetch = edgeFetch(invoke, onProblem);
  const client = machinesClient({ endpoint, fetch });
  /** Lo que el borde anuncia como disponible; `null` si no sirve `/v1/capabilities` (entonces no guía nada). */
  async function capabilities(): Promise<Set<string> | null> {
    try {
      const response = await fetch(`${endpoint}/capabilities`);
      if (response.status !== 200) return null;
      const items = ((await response.json()) as { items?: unknown } | null)?.items;
      if (!Array.isArray(items)) return null;
      return new Set(items.filter((c) => c?.status === "available" && typeof c.name === "string").map((c) => c.name as string));
    } catch {
      return null;
    }
  }
  return {
    client,
    capabilities,
    /** Las máquinas como filas de flota; `available: false` cuando el servidor, la capacidad o la sesión aún no están (se reintenta solo). */
    async rows(): Promise<{ available: boolean; computers: Computer[] }> {
      const caps = await capabilities();
      if (caps && !caps.has("machines")) return { available: false, computers: [] };
      const answer: MachinesAnswer<unknown> = await client.list();
      if (answer.kind === "ok") return { available: true, computers: (answer.value as Parameters<typeof machineToComputer>[0][]).map(machineToComputer) };
      return { available: false, computers: [] };
    },
  };
}
