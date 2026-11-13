/**
 * El único módulo de máquinas de la nube (R4): la máquina de la organización por
 * `/v1/machines` del borde (contratos del MVP § 5). Lo usan Desk y la web.
 *
 * - Lista, estado, `start` (202 con operación y su sondeo) y ticket del canal de datos.
 * - Un 404 o un 501 de la colección es `unavailable`: el servidor aún no la tiene y quien
 *   llama reintenta solo (`retryUnavailable`). Un 404 de una máquina es `missing`.
 * - El canal de datos va por `wss://` con el subprotocolo `ticket.*`, nunca `bearer.*`.
 *
 * Sin APIs del DOM: `fetch`, el reloj y la espera se inyectan.
 */
import { type Answer, type Computer, type Fetch, apiUrl, errorCodeOf, globalFetch } from "./api.ts";
import { requestId } from "./relay.ts";

/** Una fila de `GET /v1/machines`. Todo salvo `machine_id` y `state` es opcional: el contrato crece sin recompilar. */
export type Machine = {
  machine_id: string;
  name?: string | null;
  /** `MachineState` de `machine-provisioning`; un enum abierto. */
  state: string;
  /** `connected | disconnected`: si el motor de la máquina es alcanzable. */
  connection?: string | null;
  organization_id?: string | null;
  person_id?: string | null;
};

export type MachineOperation = { operation_id: string; kind?: string; status: string; created_at?: string; error?: { code?: string } | null };

/** Lo que entrega un ticket: la URL ya validada y el ticket de un solo uso. */
export type Admission = { url: string; ticket: string; session_expires_at?: string | null };

/** `Answer` más «el servidor aún no tiene esta ruta» (404 o 501 de una colección). */
export type MachinesAnswer<T> = Answer<T> | { kind: "unavailable"; status: number };

export type MachinesConfig = {
  /** El borde con su versión: `https://edge.danil.ai/v1`. */
  endpoint: string;
  /** El portador de la sesión: el Bearer de Desk. La web usa su cookie y no pasa por aquí. */
  getToken: () => Promise<string>;
  fetch?: Fetch;
  /** Orígenes del relay que se aceptan en la URL del ticket (`RELAY_ORIGIN`). */
  relayOrigins?: readonly string[];
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Cuánto se espera a que termine una operación de encendido. */
  operationTimeoutMs?: number;
};

/** Hoy, según el código del prototipo, el relay vive en estos dos nombres (N2 de Mauricio; es un parámetro). */
export const DEFAULT_RELAY_ORIGINS: readonly string[] = ["wss://machines.danil.ai", "wss://computers.danil.ai"];
export const OPERATION_TIMEOUT_MS = 330_000;
const POLL_FIRST_MS = 500;
const POLL_MAX_MS = 4_000;
const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

/** `application/problem+json` trae `code`; un cuerpo de antes, `{error}`. */
const problemCode = (body: unknown): string | undefined => {
  const code = (body as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : errorCodeOf(body);
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Lo que las pantallas de máquinas y flota ya entienden (`Computer`). `running` solo es
 * `online` si el motor está conectado; un estado que no conocemos es `unknown`, no un error.
 */
export function machineToComputer(m: Machine): Computer {
  const connected = m.connection === "connected";
  const state =
    m.state === "running" ? (connected || m.connection == null ? "online" : "offline")
    : m.state === "reserved" || m.state === "provisioning" ? "provisioning"
    : m.state === "starting" ? "starting"
    : m.state === "stopped" || m.state === "stopping" ? "stopped"
    : "unknown";
  return { computer_id: m.machine_id, name: m.name ?? null, state, wakeable: true, provider: null };
}

/** `Location` como ruta bajo `/v1`, solo si es del mismo borde (sin host); si no, se ignora. */
function locationOf(raw: string | null | undefined): string | null {
  return typeof raw === "string" && /^\/v1\/[A-Za-z0-9_\-\/]+$/.test(raw) ? raw.slice(3) : null;
}

function machineOf(raw: unknown): Machine | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r.machine_id !== "string" || !r.machine_id || typeof r.state !== "string") return null;
  return r as unknown as Machine;
}

function operationOf(raw: unknown): MachineOperation | null {
  const r = (raw as { operation?: unknown } | null)?.operation as Record<string, unknown> | null | undefined;
  if (!r || typeof r.operation_id !== "string" || !r.operation_id) return null;
  // Un estado que no conocemos se trata como `pending`, nunca como terminado.
  const status = typeof r.status === "string" && (TERMINAL.has(r.status) || r.status === "running") ? r.status : "pending";
  return { ...(r as unknown as MachineOperation), status };
}

/** Una URL de ticket solo vale si es `wss:` (un `https:` del puente se normaliza), de un origen conocido, con la ruta de esa máquina y sin extras. */
export function admissionUrl(raw: unknown, machineId: string, origins: readonly string[]): string | null {
  if (typeof raw !== "string") return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol !== "wss:") return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== `/v1/machines/${encodeURIComponent(machineId)}/session`) return null;
  const allowed = origins.map((o) => new URL(o.replace(/^https?:/i, "wss:")).origin);
  return allowed.includes(url.origin) ? url.href : null;
}

export function machinesClient(config: MachinesConfig) {
  const f = config.fetch ?? globalFetch;
  const now = config.now ?? Date.now;
  const sleep = config.sleep ?? defaultSleep;
  const origins = config.relayOrigins ?? DEFAULT_RELAY_ORIGINS;
  const url = (path: string) => apiUrl(config.endpoint, path);
  const idPath = (id: string) => `/machines/${encodeURIComponent(id)}`;

  async function call<T>(collection: boolean, method: string, path: string, read: (body: unknown, response?: Awaited<ReturnType<Fetch>>) => T, ok: number[] = [200]): Promise<MachinesAnswer<T>> {
    let response: Awaited<ReturnType<Fetch>>;
    try {
      const headers: Record<string, string> = { authorization: `Bearer ${await config.getToken()}` };
      if (method === "GET") response = await f(url(path), { method, headers });
      else response = await f(url(path), { method, headers: { ...headers, "content-type": "application/json", "Idempotency-Key": requestId() }, body: "{}" });
    } catch {
      return { kind: "error", status: null };
    }
    const status = response.status;
    if (status === 401) return { kind: "unauthorized" };
    if (collection && (status === 404 || status === 501)) return { kind: "unavailable", status };
    if (status === 404) return { kind: "missing" };
    const body = await response.json().catch(() => null);
    if (status === 403) {
      const code = problemCode(body);
      if (code === "license_required") return { kind: "license" };
      return code ? { kind: "error", status, code } : { kind: "error", status };
    }
    if (!ok.includes(status)) {
      const code = problemCode(body);
      return code ? { kind: "error", status, code } : { kind: "error", status };
    }
    try {
      return { kind: "ok", value: read(body, response) };
    } catch {
      return { kind: "error", status };
    }
  }

  const readMachine = (body: unknown) => {
    const m = machineOf(body);
    if (!m) throw new Error("invalid_machine");
    return m;
  };

  return {
    list: () =>
      call(true, "GET", "/machines", (body) => {
        const items = (body as { items?: unknown } | null)?.items;
        if (!Array.isArray(items)) throw new Error("invalid_machines");
        return items.flatMap((row) => {
          const m = machineOf(row);
          return m ? [m] : [];
        });
      }),

    get: (id: string) => call(false, "GET", idPath(id), readMachine),

    /**
     * Enciende y espera: `202 {operation, machine}` y se sondea la operación hasta que termina
     * (o hasta el plazo); entonces lee la máquina. `failed` y `cancelled` contestan `error` con el
     * código de la operación; `409 not_remotely_startable` conserva su código.
     */
    async start(id: string): Promise<MachinesAnswer<Machine>> {
      const accepted = await call(false, "POST", `${idPath(id)}/start`, (body, response) => ({ operation: operationOf(body), machine: machineOf((body as { machine?: unknown } | null)?.machine), location: locationOf(response?.headers?.get("location")) }), [200, 202]);
      if (accepted.kind !== "ok") return accepted;
      const first = accepted.value.operation;
      if (!first) return { kind: "error", status: 202, code: "invalid_operation" };
      const deadline = now() + (config.operationTimeoutMs ?? OPERATION_TIMEOUT_MS);
      // El cliente sigue `Location` (hoy `/v1/operations/{id}`); sin él, la ruta del contrato.
      const operationPath = accepted.value.location ?? `/operations/${encodeURIComponent(first.operation_id)}`;
      let operation = first;
      let wait = POLL_FIRST_MS;
      while (!TERMINAL.has(operation.status)) {
        if (now() >= deadline) return { kind: "error", status: null, code: "operation_timeout" };
        await sleep(wait);
        wait = Math.min(wait * 2, POLL_MAX_MS);
        const next = await call(false, "GET", operationPath, (body) => {
          const op = operationOf(body);
          if (!op) throw new Error("invalid_operation");
          return op;
        });
        // Un fallo pasajero del sondeo no tira el encendido: se reintenta hasta el plazo.
        if (next.kind === "unauthorized" || next.kind === "license") return next;
        if (next.kind === "missing") return { kind: "error", status: 404, code: "operation_not_found" };
        if (next.kind === "ok") operation = next.value;
      }
      if (operation.status !== "succeeded") return { kind: "error", status: null, code: operation.error?.code ?? `operation_${operation.status}` };
      const machine = await call(false, "GET", idPath(id), readMachine);
      return machine.kind === "ok" ? machine : accepted.value.machine ? { kind: "ok", value: accepted.value.machine } : machine;
    },

    /** Un ticket de un solo uso para el canal de datos. Si la URL no pasa la validación, el ticket no sale de aquí. */
    async admission(id: string): Promise<MachinesAnswer<Admission>> {
      const issued = await call(
        false,
        "POST",
        `${idPath(id)}/tickets`,
        (body) => {
          const b = body as { ticket?: unknown; url?: unknown; session_expires_at?: unknown } | null;
          if (typeof b?.ticket !== "string" || !b.ticket) throw new Error("invalid_admission");
          return { ticket: b.ticket, url: b.url, session_expires_at: typeof b.session_expires_at === "string" ? b.session_expires_at : null };
        },
        [200, 201],
      );
      if (issued.kind !== "ok") return issued;
      const url = admissionUrl(issued.value.url, id, origins);
      if (!url) return { kind: "error", status: null, code: "invalid_admission_url" };
      return { kind: "ok", value: { url, ticket: issued.value.ticket, session_expires_at: issued.value.session_expires_at } };
    },
  };
}

/** Reintenta una lectura que contestó `unavailable` (el servidor aún no la tiene), con espera creciente, hasta que `stop()` o una respuesta distinta. */
export async function retryUnavailable<T>(read: () => Promise<MachinesAnswer<T>>, opts: { sleep?: (ms: number) => Promise<void>; stop?: () => boolean; first?: number; max?: number; onUnavailable?: () => void } = {}): Promise<MachinesAnswer<T>> {
  const sleep = opts.sleep ?? defaultSleep;
  let wait = opts.first ?? 5_000;
  for (;;) {
    const answer = await read();
    if (answer.kind !== "unavailable" || opts.stop?.()) return answer;
    opts.onUnavailable?.();
    await sleep(wait);
    wait = Math.min(wait * 2, opts.max ?? 5 * 60_000);
  }
}

/** Lo que la flota entiende de un encendido: encendida, no se pudo, o la nube no la enciende. */
export function wokeOf(answer: MachinesAnswer<unknown>): boolean | "not_startable" {
  if (answer.kind === "ok") return true;
  return answer.kind === "error" && answer.code === "not_remotely_startable" ? "not_startable" : false;
}
