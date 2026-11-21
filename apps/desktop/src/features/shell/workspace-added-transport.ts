/**
 * Las piezas sin estado de los agregados (`workspace-added-sync.ts`): el transporte de Desk,
 * el de la web y el registro guardado en `lib/prefs`. Ninguno decide qué es de Danil.
 */
import { EdgeError } from "@terminus/computers";
import type { AddedRecord, AddedStore, AddedTransport, PendingOp, PreferencesReply } from "./workspace-added-sync.ts";
import { edgePath } from "../../platform/client.ts";

const PREFERENCES = "workspaces/preferences";
const ENGINE_ID = /^[A-Za-z0-9_-]{1,128}$/;
/** Un id que el borde rechazaría por forma no sale: se contesta como el 422 del contrato. */
const MALFORMED: PreferencesReply = { status: 422, body: { code: "invalid_workspace_id" } };

/** `edgeFetch` de `lib/edge.ts`: una llamada, el status del borde tal cual; sin red, rechaza. */
export type EdgeSend = (method: "GET" | "PUT" | "DELETE", path: string, body?: unknown) => Promise<{ status: number; body?: unknown }>;

/**
 * Desk, con el Bearer en Rust. Nunca `edgeUntil`: su `onProblem` abriría el selector de
 * organización ante un `403 organization_selection_required`, y aquí ese 403 es «sin lista de la cuenta».
 */
export function edgeAddedTransport(send: EdgeSend): AddedTransport {
  const reply = async (method: "GET" | "PUT" | "DELETE", path: string, body?: unknown): Promise<PreferencesReply> => {
    const r = await send(method, edgePath(path), body);
    return { status: r.status, body: r.body };
  };
  const one = (method: "PUT" | "DELETE", id: string) => (ENGINE_ID.test(id) ? reply(method, `${PREFERENCES}/added/${id}`) : Promise.resolve(MALFORMED));
  return {
    get: () => reply("GET", PREFERENCES),
    put: (id) => one("PUT", id),
    remove: (id) => one("DELETE", id),
    seed: (added) => reply("PUT", PREFERENCES, { added: [...added], if_version: 0 }),
  };
}

/** `platformTransport` de `web/platform-session.ts`: la cookie de la página y CSRF en cada escritura. */
export type WebSend = {
  call(path: string, init?: RequestInit): Promise<Response>;
  mutation(path: string, init?: RequestInit): Promise<Response>;
};

/** La web. Un `EdgeError` (también el de `identity/csrf`) se vuelve `{status, body: {code}}`; un fallo de red rechaza. */
export function webAddedTransport(send: WebSend): AddedTransport {
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
  const one = (method: "PUT" | "DELETE", id: string) =>
    ENGINE_ID.test(id) ? reply(() => send.mutation(`${PREFERENCES}/added/${id}`, { method })) : Promise.resolve(MALFORMED);
  return {
    get: () => reply(() => send.call(PREFERENCES)),
    put: (id) => one("PUT", id),
    remove: (id) => one("DELETE", id),
    seed: (added) =>
      reply(() =>
        send.mutation(PREFERENCES, {
          method: "PUT",
          headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify({ added: [...added], if_version: 0 }),
        }),
      ),
  };
}

/** La clave de `lib/prefs`: `{ "<persona>:<organización>": AddedRecord }`. */
export const ADDED_KEY = "workspaces.added.sync";

const idsOf = (raw: unknown): string[] | null => (Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string" && ENGINE_ID.test(id)) : null);
const pendingOf = (raw: unknown): PendingOp[] =>
  Array.isArray(raw)
    ? raw.filter((p): p is PendingOp => !!p && typeof p === "object" && (p.op === "add" || p.op === "remove") && typeof p.id === "string")
    : [];

/** El registro por (persona, organización) sobre una lectura y una escritura de `lib/prefs`; lo ilegible no cuenta. */
export function prefsAddedStore(read: () => unknown, write: (all: Record<string, AddedRecord>) => void): AddedStore {
  const all = (): Record<string, AddedRecord> => {
    const value = read();
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, AddedRecord>) : {};
  };
  return {
    read(key) {
      const raw = all()[key] as unknown;
      if (!raw || typeof raw !== "object") return null;
      const record = raw as { local?: unknown; pending?: unknown };
      return { local: idsOf(record.local), pending: pendingOf(record.pending) };
    },
    write(key, record) {
      write({ ...all(), [key]: record });
    },
  };
}
