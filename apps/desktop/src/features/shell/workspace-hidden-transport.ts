/**
 * Las piezas sin estado de la sincronización de ocultos (`workspace-hidden-sync.ts`):
 * el transporte de Desk y el de la web, el alcance (persona, organización, ids que sirve
 * su máquina) y el registro guardado en `lib/prefs`. El cableado vive en `workspace-hidden-wiring.ts`.
 */
import { EdgeError } from "@terminus/computers";
import type { PendingOp, PreferencesReply, PreferencesTransport, SyncRecord, SyncScope, SyncStore } from "./workspace-hidden-sync.ts";

const PREFERENCES = "workspaces/preferences";
const ENGINE_ID = /^[A-Za-z0-9_-]{1,128}$/;
/** Un id que el borde rechazaría por forma no sale: se contesta como el 422 del contrato. */
const MALFORMED: PreferencesReply = { status: 422, body: { code: "invalid_workspace_id" } };

/** `danil_edge_fetch` (`lib/edge.ts` `edgeFetch`): una llamada, el status del borde tal cual; sin red, rechaza. */
export type EdgeSend = (method: "GET" | "PUT" | "DELETE", path: string) => Promise<{ status: number; body?: unknown }>;

/**
 * Desk, con el Bearer en Rust. Nunca `edgeUntil`: su `onProblem` abriría el selector de
 * organización ante un `403 organization_selection_required`, y aquí ese 403 es «solo local».
 */
export function edgePreferencesTransport(send: EdgeSend): PreferencesTransport {
  const reply = async (method: "GET" | "PUT" | "DELETE", path: string): Promise<PreferencesReply> => {
    const r = await send(method, `/v1/${path}`);
    return { status: r.status, body: r.body };
  };
  return {
    get: () => reply("GET", PREFERENCES),
    put: (id) => (ENGINE_ID.test(id) ? reply("PUT", `${PREFERENCES}/hidden/${id}`) : Promise.resolve(MALFORMED)),
    remove: (id) => (ENGINE_ID.test(id) ? reply("DELETE", `${PREFERENCES}/hidden/${id}`) : Promise.resolve(MALFORMED)),
  };
}

/** `platformTransport` de `web/platform-session.ts`: la cookie de la página y CSRF en cada escritura. */
export type WebSend = {
  call(path: string, init?: RequestInit): Promise<Response>;
  mutation(path: string, init?: RequestInit): Promise<Response>;
};

/**
 * La web. Un `EdgeError` (status del borde, también el de `identity/csrf`) se vuelve
 * `{status, body: {code}}`; un fallo de red o un CSRF inválido rechaza.
 */
export function webPreferencesTransport(send: WebSend): PreferencesTransport {
  const reply = async (run: () => Promise<Response>): Promise<PreferencesReply> => {
    let response: Response;
    try {
      response = await run();
    } catch (e) {
      if (e instanceof EdgeError) return { status: e.status, body: { code: e.code } };
      throw e;
    }
    const body = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    return body === undefined ? { status: response.status } : { status: response.status, body };
  };
  const write = (method: "PUT" | "DELETE", id: string) =>
    ENGINE_ID.test(id) ? reply(() => send.mutation(`${PREFERENCES}/hidden/${id}`, { method })) : Promise.resolve(MALFORMED);
  return {
    get: () => reply(() => send.call(PREFERENCES)),
    put: (id) => write("PUT", id),
    remove: (id) => write("DELETE", id),
  };
}

/** Lo que importa de una fila de máquina (`MachineInfo` de `@terminus/fleet`). */
export type ServingRow = { organization?: { id: string; workspaces: readonly { id: string }[] } | null };

/**
 * El alcance: la persona, la organización activa y los ids que sirven sus máquinas.
 * Sin persona, sin organización o sin una fila de esa organización: `null`, y todo es local.
 */
export function syncScope(person: string | null | undefined, organization: string | null | undefined, rows: readonly ServingRow[]): SyncScope | null {
  if (!person || !organization) return null;
  const served = new Set<string>();
  for (const row of rows) if (row.organization?.id === organization) for (const w of row.organization.workspaces) served.add(w.id);
  return served.size ? { person, organization, served } : null;
}

/** La clave de `lib/prefs`: `{ "<persona>:<organización>": SyncRecord }`. */
export const SYNC_KEY = "workspaces.hidden.sync";

const pendingOf = (raw: unknown): PendingOp[] =>
  Array.isArray(raw)
    ? raw.filter((p): p is PendingOp => !!p && typeof p === "object" && (p.op === "add" || p.op === "remove") && typeof p.id === "string")
    : [];

/** El registro por (persona, organización) sobre una lectura y una escritura de `lib/prefs`; lo ilegible no cuenta. */
export function prefsSyncStore(read: () => unknown, write: (all: Record<string, SyncRecord>) => void): SyncStore {
  const all = (): Record<string, SyncRecord> => {
    const value = read();
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, SyncRecord>) : {};
  };
  return {
    read(key) {
      const raw = all()[key] as unknown;
      if (!raw || typeof raw !== "object") return null;
      const record = raw as { migrated?: unknown; pending?: unknown };
      return { migrated: record.migrated === true, pending: pendingOf(record.pending) };
    },
    write(key, record) {
      write({ ...all(), [key]: record });
    },
  };
}
