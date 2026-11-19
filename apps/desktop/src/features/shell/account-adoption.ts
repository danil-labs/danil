import type { PendingUnions } from "./account-transfers.ts";

/** Un workspace local que se puede adoptar en la organización personal (`adoption_candidates`). */
export type AdoptionCandidate = { id: string; name: string; created_at?: number; adoptable?: boolean; reason?: string };
type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
type Send = (context: string, method: string, path: string, body?: unknown, key?: string) => Promise<{ status: number; body?: unknown; empty_reason?: unknown }>;
export type AdoptionMemory = { key: (id: string) => string; skip: (id: string) => boolean; refuse: (id: string) => void };
export type AdoptionResult = { adopted: string[]; unavailable: boolean };

/**
 * Adopta, una sola vez, los workspaces locales en la organización personal Free
 * del correo (plan de cuentas § 7.2, A11): primero el servidor (`POST
 * /v1/workspaces/adopt`, idempotente por llave), después el sello aquí con la
 * cuenta que devolvió. No mueve tareas. Un servidor sin la ruta (404, 501) corta
 * sin tocar nada; `409 id_taken` no se vuelve a pedir.
 */
export async function adoptLocals(
  invoke: Invoke,
  header: Record<string, unknown>,
  send: Send,
  free: { context_id: string; org: string },
  memory: AdoptionMemory,
  pending: PendingUnions,
): Promise<AdoptionResult> {
  const adopted: string[] = [];
  let candidates: AdoptionCandidate[];
  try {
    candidates = await invoke<AdoptionCandidate[]>("adoption_candidates", header);
  } catch {
    return { adopted, unavailable: false };
  }
  for (const c of candidates) {
    if (c.adoptable === false || memory.skip(c.id)) continue;
    let reply: Awaited<ReturnType<Send>>;
    try {
      reply = await send(free.context_id, "POST", "/v1/workspaces/adopt", { engine_workspace_id: c.id, name: c.name }, memory.key(c.id));
    } catch {
      continue;
    }
    if (reply.status === 404 || reply.status === 501) return { adopted, unavailable: true };
    if (reply.status === 409) {
      memory.refuse(c.id);
      continue;
    }
    const body = reply.body as { id?: unknown } | undefined;
    const accountId = typeof body?.id === "string" ? body.id : typeof body?.id === "number" && Number.isSafeInteger(body.id) ? String(body.id) : null;
    if (reply.status < 200 || reply.status >= 300 || reply.empty_reason || !accountId) continue;
    try {
      await invoke("adopt_account_workspace", { ...header, id: c.id, account: { org: free.org, account_id: accountId } });
    } catch {
      continue;
    }
    adopted.push(c.id);
    // La unión del Free router con la cuenta nueva va aparte y se reintenta (`retryUnions`).
    pending.add({ id: c.id, context: free.context_id, org: free.org, account_id: accountId });
  }
  return { adopted, unavailable: false };
}

/** La llave estable de cada adopción y los rechazos, en las preferencias de esta computadora. */
export function prefsAdoptionMemory(read: <T>(key: string, fallback: T) => T, write: (key: string, value: unknown) => void, uuid: () => string): AdoptionMemory {
  const KEYS = "workspaces.adoption_keys";
  const REFUSED = "workspaces.adoption_refused";
  return {
    key: (id) => {
      const keys = read<Record<string, string>>(KEYS, {});
      if (!keys[id]) write(KEYS, { ...keys, [id]: uuid() });
      return read<Record<string, string>>(KEYS, {})[id];
    },
    skip: (id) => read<string[]>(REFUSED, []).includes(id),
    refuse: (id) => write(REFUSED, [...new Set([...read<string[]>(REFUSED, []), id])]),
  };
}
