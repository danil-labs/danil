/**
 * Las máquinas de la organización por el borde (`/v1/machines`), vistas desde Desk.
 * Es el cliente único de `@terminus/computers` (`machines.ts`). Todas las llamadas al
 * borde pasan por el comando Rust `danil_edge_fetch`: el access vive en Rust y nunca
 * llega a la webview. Un 404 o un 501 llega como `not_available_yet` y la nube queda
 * «no disponible»: se oculta con gracia y se reintenta sola, guiada por
 * `GET /v1/capabilities` (Desk compilado no se recompila por cambios del servidor).
 * El canal de datos no pasa por aquí: va directo al relay con el ticket, solo a un origen exacto (`DEFAULT_RELAY_ORIGINS`).
 */
import { type CapabilityList, type Computer, type Fetch, type MachinesAnswer, announces, capabilityList, machineToComputer, machinesClient, mayCall } from "@terminus/computers";

/** Solo una base para armar rutas `/v1/...`; la webview no llama a este origen (lo hace Rust). */
export const EDGE_ENDPOINT = "https://edge.danil.ai/v1";
export const CLOUD_RETRY_MS = 30_000;
// Primer reintento de una lectura transitoria; el techo conserva el sondeo existente.
export const CLOUD_RETRY_INITIAL_MS = 1_000;
type CloudRows = { state: "ready"; computers: Computer[]; renewInChannel: boolean } | { state: "unavailable" | "retrying" | "denied" };

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type EdgeError = { detail?: unknown; status?: unknown };

export type CloudMachines = ReturnType<typeof createCloudMachines>;

/** Lo que contesta `danil_edge_fetch`: el status del borde tal cual, su cuerpo y `Location`. */
type EdgeReply = { status: number; body: unknown; location?: string };

/** `danil_edge_fetch` con la forma de un `fetch`. Sin sesión (`Err no_session`) es 401; sin red, 503; nunca lleva tokens. */
export function edgeFetch(invoke: Invoke, onProblem?: (error: unknown) => void): Fetch {
  return async (input, init) => {
    const method = init?.method ?? "GET";
    // Ruta y query (la página siguiente de `/v1/machines`); Rust solo deja pasar las del contrato.
    const url = new URL(input);
    const path = url.pathname + url.search;
    let reply: EdgeReply;
    try {
      reply = (await invoke("danil_edge_fetch", method === "GET" ? { method, path } : { method, path, body: {} })) as EdgeReply;
    } catch (raw) {
      const code = raw && typeof raw === "object" ? (raw as EdgeError).detail : undefined;
      const status = code === "no_session" ? 401 : 503;
      return { status, ok: false, json: async () => null };
    }
    const status = typeof reply?.status === "number" ? reply.status : 503;
    // Un rechazo del contrato (p. ej. `403 organization_selection_required`) se lo cuenta a quien lo atiende.
    const code = (reply?.body as { code?: unknown } | null)?.code;
    if (status === 403 && typeof code === "string") onProblem?.({ detail: code, status, body: reply.body });
    const location = typeof reply?.location === "string" ? reply.location : null;
    return { status, ok: status < 400, headers: { get: (name: string) => (name.toLowerCase() === "location" ? location : null) }, json: async () => reply?.body ?? null };
  };
}

export function createCloudMachines(invoke: Invoke, onProblem?: (error: unknown) => void, endpoint = EDGE_ENDPOINT) {
  const fetch = edgeFetch(invoke, onProblem);
  const client = machinesClient({ endpoint, fetch });
  /**
   * Lo que el borde anuncia, con la lectura común de Desk y la web (`@terminus/computers`):
   * `denied` sin acceso; `null` sin catálogo (404/501); `undefined` un fallo transitorio
   * (otro status, red o un cuerpo que no es una lista).
   */
  async function capabilities(): Promise<CapabilityList | null | undefined | "denied"> {
    try {
      const response = await fetch(`${endpoint}/capabilities`);
      if (response.status === 401 || response.status === 403) return "denied";
      if (response.status === 404 || response.status === 501) return null;
      if (response.status !== 200) return undefined;
      return capabilityList(await response.json()) ?? undefined;
    } catch {
      return undefined;
    }
  }
  return {
    client,
    capabilities,
    /** Solo la ausencia explícita de la capacidad o de la ruta oculta la nube. */
    async rows(): Promise<CloudRows> {
      const caps = await capabilities();
      if (caps === "denied") return { state: "denied" };
      if (caps === undefined) return { state: "retrying" };
      if (!mayCall(caps, "machines")) return { state: "unavailable" };
      const answer: MachinesAnswer<unknown> = await client.list();
      if (answer.kind === "ok") return { state: "ready", computers: (answer.value as Parameters<typeof machineToComputer>[0][]).map(machineToComputer), renewInChannel: announces(caps, "machines.session.renew") };
      if (answer.kind === "unavailable") return { state: "unavailable" };
      if (answer.kind === "unauthorized" || answer.kind === "license" || answer.kind === "no_account") return { state: "denied" };
      return { state: "retrying" };
    },
  };
}
