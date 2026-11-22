/**
 * Dominio machines del borde: `/v1/machines` y `/v1/capabilities`. Es el único lugar del front que
 * escribe estas rutas y el único cliente de máquinas de la nube (R4): la máquina de la organización por
 * `/v1/machines` del borde (contratos del MVP § 5). Lo usan Desk, la web y el teléfono.
 *
 * - Lista, estado, `start` (202 con operación y su sondeo) y ticket del canal de datos.
 * - Un 404 o un 501 de la colección es `unavailable`: el servidor aún no la tiene y quien
 *   llama reintenta solo. Un 404 de una máquina es `missing`.
 * - El canal de datos va por `wss://` con el subprotocolo `ticket.*`, nunca `bearer.*`.
 *
 * Sin APIs del DOM: `fetch`, el reloj y la espera se inyectan.
 */
import { type Computer, apiUrl, errorCodeOf, globalFetch } from "../../computers/src/api.ts";
import { requestId } from "../../computers/src/relay.ts";
import type { MachineState } from "../../computers/src/machine.ts";
import type { Machine, MachineList, MachineTicket, Operation } from "./generated/types.ts";
import type { Admission, MachinesAnswer, MachinesConfig, MachinesResponse } from "./machines-config.ts";

/** El catálogo de capacidades del borde: Desk compilado lo lee para no recompilarse cuando cambia el servidor. */
export const CAPABILITIES_PATH = "/v1/capabilities";

/** La URL de capacidades bajo un endpoint del borde que ya termina en `/v1`. */
export const capabilitiesUrl = (endpoint: string) => `${endpoint}/capabilities`;

/** Las respuestas del dominio salen del OpenAPI vendorizado (`contract/openapi.json`, R2 y R7). */
export type { Machine } from "./generated/types.ts";

/**
 * Los relays que sirven a `edge.danil.ai`, por origen exacto (machine-session.v1, Apertura §2): el puente de
 * hoy (`computers`, `COMPUTE_RELAY_ORIGIN`) y el relay del contrato. Es la única lista para Desk y la web;
 * un relay con otro nombre se añade aquí. Nunca un comodín: otro subdominio de Danil no recibe el ticket.
 */
export const DEFAULT_RELAY_ORIGINS: readonly string[] = ["wss://machines-session.danil.ai", "wss://connect.danil.ai"];
const OPERATION_TIMEOUT_MS = 330_000;
const POLL_FIRST_MS = 500;
const POLL_MAX_MS = 4_000;
const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
/** Los `MachineState` del ciclo de encendido; desde otro (o uno desconocido) no se ofrece encenderla. */
const POWER_STATES = new Set(["running", "starting", "stopping", "stopped"]);

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
export function machineToComputer(m: Machine): Computer & { state: MachineState } {
  const connected = m.connection === "connected";
  // El contrato cierra `state` en cuatro valores; `reserved` llega igual (hallazgo para danil-contracts) y uno desconocido degrada.
  const raw: string | undefined = m.state as string | undefined;
  const state =
    raw === "running" ? (connected ? "online" : "offline")
    : raw === "reserved" ? "provisioning"
    : raw === "starting" ? "starting"
    : raw === "stopped" || raw === "stopping" ? "stopped"
    : "unknown";
  // `wakeable` es «VM administrada», no «apagada ahora»: se apaga sola sin que la lista lo sepa. Una personal no se enciende desde la nube.
  return {
    computer_id: m.machine_id, name: m.name ?? null, state, wakeable: POWER_STATES.has(raw ?? "") && m.kind !== "personal", provider: null,
    ...(typeof m.kind === "string" ? { kind: m.kind } : {}),
    ...(typeof m.organization_id === "string" && m.organization_id ? { organization_id: m.organization_id } : {}),
  };
}

function machineOf(raw: unknown): Machine | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r.machine_id !== "string" || !r.machine_id || typeof r.state !== "string") return null;
  return r as Machine;
}

/** La operación del contrato y su estado ya normalizado (`status` no está en el contrato: hallazgo para danil-contracts). */
type Polled = { operation: Operation; status: string };

function operationOf(raw: unknown): Polled | null {
  const r = (raw as { operation?: unknown } | null)?.operation as Operation | null | undefined;
  if (!r || typeof r.operation_id !== "string" || !r.operation_id) return null;
  // Un estado que no conocemos se trata como `pending`, nunca como terminado.
  const status = typeof r.status === "string" && (TERMINAL.has(r.status) || r.status === "running") ? r.status : "pending";
  return { operation: r, status };
}

/** El ticket exige wss, origen configurado exacto y la ruta de su máquina, sin credenciales ni query. */
function admissionUrl(raw: unknown, machineId: string, origins: readonly string[]): string | null {
  if (typeof raw !== "string") return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "wss:") return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== `/v1/machines/${encodeURIComponent(machineId)}/session`) return null;
  const allowed = origins.some(origin => {
    try {
      const base = new URL(origin.replace(/^https?:/i, "wss:"));
      return base.protocol === "wss:" && base.pathname === "/" && !base.username && !base.password && !base.search && !base.hash && base.origin === url.origin;
    } catch { return false; }
  });
  return allowed ? url.href : null;
}

/** El cursor opaco codificado según RFC 3986 (también `!'()*`), la forma que la lista de rutas de Desk admite. */
const cursorParam = (cursor: string) => encodeURIComponent(cursor).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function machinesClient(config: MachinesConfig) {
  const f = config.fetch ?? globalFetch;
  const now = config.now ?? Date.now;
  const sleep = config.sleep ?? defaultSleep;
  const origins = config.relayOrigins ?? DEFAULT_RELAY_ORIGINS;
  const url = (path: string) => apiUrl(config.endpoint, path);
  const idPath = (id: string) => `/machines/${encodeURIComponent(id)}`;

  function failure<T>(collection: boolean, status: number | null, body: unknown, retryAfter: string | null): MachinesAnswer<T> {
    const meta = retryAfter ? { retryAfter } : {};
    if (status === 401) return { kind: "unauthorized", ...meta };
    if (status === 501 || (collection && status === 404)) return { kind: "unavailable", status, ...meta };
    if (status === 404) return { kind: "missing", ...meta };
    const code = problemCode(body);
    if (status === 403 && code === "license_required") return { kind: "license", ...meta };
    return { kind: "error", status, ...(code ? { code } : {}), ...meta };
  }

  async function call<T>(collection: boolean, method: string, path: string, read: (body: unknown) => T, { ok = [200], received, signal, body: payload, key }: { ok?: number[]; received?: (response: MachinesResponse) => void; signal?: AbortSignal; body?: string; key?: string } = {}): Promise<MachinesAnswer<T>> {
    let response: MachinesResponse;
    try {
      signal?.throwIfAborted();
      const write = method === "GET" ? undefined : { method, headers: { "content-type": "application/json", "Idempotency-Key": key ?? requestId() }, body: payload ?? "{}" };
      if (config.transport) {
        const route = path.replace(/^\//, "");
        response = method === "GET" ? await config.transport.call(route, signal ? { signal } : undefined) : await config.transport.mutation(route, write);
      } else {
        const headers: Record<string, string> = { ...(write?.headers ?? {}) };
        if (config.getToken) headers.authorization = `Bearer ${await config.getToken()}`;
        response = await f(url(path), { ...write, method, headers, ...(signal ? { signal } : {}) });
      }
    } catch (error) {
      const problem = error as { status?: number; code?: string; retryAfter?: string } | null;
      return failure(collection, typeof problem?.status === "number" ? problem.status : null, problem, typeof problem?.retryAfter === "string" ? problem.retryAfter : null);
    }
    received?.(response);
    const status = response.status;
    const retryAfter = response.headers?.get("retry-after") ?? null;
    const body = await response.json().catch(() => null);
    if (!ok.includes(status)) return failure(collection, status, body, retryAfter);
    try {
      return { kind: "ok", value: read(body), ...(retryAfter ? { retryAfter } : {}) };
    } catch {
      return { kind: "error", status, code: "invalid_machine_response" };
    }
  }

  function pollingDelay(value: string | null | undefined, fallback: number) {
    if (!value) return fallback;
    if (/^\d+$/.test(value)) return Number(value) * 1000;
    const at = Date.parse(value);
    return Number.isFinite(at) ? Math.max(0, at - now()) : fallback;
  }

  /** Solo `/v1/operations/{id}` con un id de caracteres seguros: sin `%`, `\\`, `.` ni separadores que el navegador normalice hacia otra ruta. */
  const operationPath = (location: string | null) => location && /^\/v1\/operations\/[A-Za-z0-9_-]{1,128}$/.test(location) ? location.slice("/v1".length) : null;

  const readMachine = (body: unknown) => {
    const m = machineOf(body);
    if (!m) throw new Error("invalid_machine");
    return m;
  };

  return {
    async list(signal?: AbortSignal): Promise<MachinesAnswer<Machine[]>> {
      const items: Machine[] = [];
      const cursors = new Set<string>();
      let cursor: string | null = null;
      do {
        const answer: MachinesAnswer<{ items: Machine[]; next: string | null }> = await call(true, "GET", `/machines${cursor ? `?cursor=${cursorParam(cursor)}` : ""}`, body => {
          const page = body as MachineList | null;
          if (!Array.isArray(page?.items) || (page.next_cursor != null && typeof page.next_cursor !== "string")) throw new Error("invalid_machines");
          const rows = page.items.map(machineOf);
          if (rows.some(row => !row)) throw new Error("invalid_machine");
          return { items: rows as Machine[], next: typeof page.next_cursor === "string" ? page.next_cursor : null };
        }, { signal });
        if (answer.kind !== "ok") return answer;
        items.push(...answer.value.items);
        cursor = answer.value.next;
        if (cursor && cursors.has(cursor)) return { kind: "error", status: 200, code: "repeated_machine_cursor" };
        if (cursor) cursors.add(cursor);
      } while (cursor);
      return { kind: "ok", value: items };
    },

    get: (id: string) => call(false, "GET", idPath(id), readMachine),

    /**
     * Enciende y espera: `202 {operation, machine}` y se sondea la operación hasta que termina
     * (o hasta el plazo); entonces lee la máquina. `failed` y `cancelled` contestan `error` con el
     * código de la operación; `409 not_remotely_startable` conserva su código.
     */
    async start(id: string): Promise<MachinesAnswer<Machine>> {
      let location: string | null = null;
      const accepted = await call(false, "POST", `${idPath(id)}/start`, body => ({ operation: operationOf(body) }), { ok: [200, 202], received: response => { location = response.headers?.get("location") ?? null; } });
      if (accepted.kind !== "ok") return accepted;
      const first = accepted.value.operation;
      if (!first) return { kind: "error", status: 202, code: "invalid_operation" };
      const path = operationPath(location);
      if (!TERMINAL.has(first.status) && !path) return { kind: "error", status: 202, code: "invalid_operation_location" };
      const deadline = now() + (config.operationTimeoutMs ?? OPERATION_TIMEOUT_MS);
      let operation = first;
      let wait = pollingDelay(accepted.retryAfter, POLL_FIRST_MS);
      while (!TERMINAL.has(operation.status)) {
        const remaining = deadline - now();
        if (remaining <= 0 || wait > remaining) return { kind: "error", status: null, code: "operation_timeout" };
        await sleep(wait);
        const next = await call(false, "GET", path!, body => {
          const op = operationOf(body);
          if (!op) throw new Error("invalid_operation");
          return op;
        });
        wait = pollingDelay(next.retryAfter, Math.min(Math.max(wait * 2, POLL_FIRST_MS), POLL_MAX_MS));
        if (next.kind === "unauthorized" || next.kind === "license" || next.kind === "unavailable" || next.kind === "no_account") return next;
        if (next.kind === "missing") return { kind: "error", status: 404, code: "operation_not_found" };
        if (next.kind === "ok") operation = next.value;
        else if (next.status !== null && next.status < 500 && next.status !== 429) return next;
      }
      if (operation.status !== "succeeded") return { kind: "error", status: null, code: operation.operation.error?.code ?? `operation_${operation.status}` };
      return call(false, "GET", idPath(id), readMachine);
    },

    /**
     * Enciende una VM apagada por una acción de la persona: `POST …/tickets {"wake": true}` con la MISMA
     * `Idempotency-Key` en cada intento. `503 machine_starting` pide esperar `Retry-After` y reintentar hasta el
     * `201` (normalmente menos de 2 s). Nunca se llama al cargar, listar ni en segundo plano: sin `wake`, una
     * VM apagada contesta `409 machine_stopped` y no se enciende. El ticket de esta respuesta se descarta.
     */
    async wake(id: string): Promise<MachinesAnswer<true>> {
      const key = requestId();
      const deadline = now() + (config.operationTimeoutMs ?? OPERATION_TIMEOUT_MS);
      for (;;) {
        const answer = await call(false, "POST", `${idPath(id)}/tickets`, () => true as const, { ok: [200, 201], body: '{"wake":true}', key });
        if (answer.kind !== "error" || answer.status !== 503 || answer.code !== "machine_starting") return answer;
        const wait = pollingDelay(answer.retryAfter, 2_000);
        if (now() + wait > deadline) return { kind: "error", status: 503, code: "operation_timeout" };
        await sleep(wait);
      }
    },

    /** Un ticket de un solo uso para el canal de datos. Si la URL no pasa la validación, el ticket no sale de aquí. */
    async admission(id: string): Promise<MachinesAnswer<Admission>> {
      const issued = await call(
        false,
        "POST",
        `${idPath(id)}/tickets`,
        (body) => {
          const b = body as MachineTicket | null;
          if (typeof b?.ticket !== "string" || !b.ticket) throw new Error("invalid_admission");
          return { ticket: b.ticket, url: b.url, session_expires_at: typeof b.session_expires_at === "string" ? b.session_expires_at : null,
            ...(typeof b.protocol === "string" ? { protocol: b.protocol } : {}), ...(typeof b.expires_at === "string" ? { expires_at: b.expires_at } : {}) };
        },
        { ok: [200, 201] },
      );
      if (issued.kind !== "ok") return issued;
      const url = admissionUrl(issued.value.url, id, origins);
      if (!url) return { kind: "error", status: null, code: "invalid_admission_url" };
      return { kind: "ok", value: { url, ticket: issued.value.ticket, session_expires_at: issued.value.session_expires_at,
        ...(issued.value.protocol ? { protocol: issued.value.protocol } : {}), ...(issued.value.expires_at ? { expires_at: issued.value.expires_at } : {}) } };
    },
  };
}

/** Lo que la flota entiende de un encendido: encendida, no se pudo, o la nube no la enciende. */
export function wokeOf(answer: MachinesAnswer<unknown>): boolean | "not_startable" {
  if (answer.kind === "ok") return true;
  return answer.kind === "error" && answer.code === "not_remotely_startable" ? "not_startable" : false;
}
