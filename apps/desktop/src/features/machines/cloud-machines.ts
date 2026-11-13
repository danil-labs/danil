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

import { edgeUntil, type EdgeReply as NativeReply, type Patience } from "../../lib/edge.ts";

/** Solo una base para armar rutas `/v1/...`; la webview no llama a este origen (lo hace Rust). */
export const EDGE_ENDPOINT = "https://edge.danil.ai/v1";
export const CLOUD_RETRY_MS = 30_000;
// Primer reintento de una lectura transitoria; el techo conserva el sondeo existente.
export const CLOUD_RETRY_INITIAL_MS = 1_000;
type CloudRows = { state: "ready"; computers: Computer[]; renewInChannel: boolean } | { state: "unavailable" | "retrying" | "denied" };

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type EdgeError = { detail?: unknown; status?: unknown; retry_after_ms?: number; body?: unknown };

export type CloudMachines = ReturnType<typeof createCloudMachines>;

/** El adaptador conserva el recibo nativo; solo las escrituras necesitan reintento por intención. */
export function edgeFetch(invoke: Invoke, onProblem?: (error: unknown) => void, patience: Patience = {}): Fetch {
  const send = <T>(method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string) =>
    invoke("danil_edge_fetch", { method, path, ...(method === "POST" ? { body, idempotencyKey } : {}) }) as Promise<NativeReply<T>>;
  return async (input, init) => {
    const method = init?.method === "POST" ? "POST" : "GET";
    const path = new URL(input).pathname;
    let reply: NativeReply;
    try {
      reply = method === "GET" ? await send(method, path) : await edgeUntil(method, path, JSON.parse(init?.body ?? "{}"), {
        ...patience, idempotencyKey: init?.headers?.["Idempotency-Key"],
      }, send);
    } catch (raw) {
      const error = raw as EdgeError | null;
      const status = typeof error?.status === "number" ? error.status : error?.detail === "no_session" ? 401 : 503;
      reply = { status, body: error?.body ?? raw, retry_after_ms: error?.retry_after_ms };
    }
    const status = typeof reply?.status === "number" ? reply.status : 503;
    const code = (reply?.body as { code?: unknown; detail?: unknown } | null)?.code ?? (reply?.body as EdgeError | null)?.detail;
    if (status === 403 && typeof code === "string") onProblem?.({ detail: code, status, body: reply.body });
    const location = typeof reply?.location === "string" ? reply.location : null;
    const retryAfter = typeof reply?.retry_after_ms === "number" ? String(Math.ceil(reply.retry_after_ms / 1000)) : null;
    return { status, ok: status < 400, headers: { get: (name: string) => {
      if (name.toLowerCase() === "location") return location;
      if (name.toLowerCase() === "retry-after") return retryAfter;
      return null;
    } }, json: async () => reply?.body ?? null };
  };
}

export function createCloudMachines(invoke: Invoke, onProblem?: (error: unknown) => void, endpoint = EDGE_ENDPOINT) {
  const fetch = edgeFetch(invoke, onProblem);
  const client = machinesClient({ endpoint, fetch });
  /** `denied`: sin acceso; `null`: sin catálogo; `undefined`: fallo transitorio. */
  async function capabilities(): Promise<Set<string> | null | undefined | "denied"> {
    try {
      const response = await fetch(`${endpoint}/capabilities`);
      if (response.status === 401 || response.status === 403) return "denied";
      if (response.status === 404 || response.status === 501) return null;
      if (response.status !== 200) return undefined;
      const items = ((await response.json()) as { items?: unknown } | null)?.items;
      if (!Array.isArray(items)) return undefined;
      return new Set(items.filter((c) => c?.status === "available" && typeof c.name === "string").map((c) => c.name as string));
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
      if (caps && !caps.has("machines")) return { state: "unavailable" };
      const answer: MachinesAnswer<unknown> = await client.list();
      if (answer.kind === "ok") return { state: "ready", computers: (answer.value as Parameters<typeof machineToComputer>[0][]).map(machineToComputer), renewInChannel: !!caps?.has("machines.session.renew") };
      if (answer.kind === "unavailable") return { state: "unavailable" };
      if (answer.kind === "unauthorized" || answer.kind === "license" || answer.kind === "no_account") return { state: "denied" };
      return { state: "retrying" };
    },
  };
}
