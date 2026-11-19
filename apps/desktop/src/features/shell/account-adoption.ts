import { accountId as asAccountId, type PendingUnions } from "./account-transfers.ts";

/** Un workspace local que se puede adoptar en la organización personal (`adoption_candidates`). */
export type AdoptionCandidate = { id: string; name: string; created_at?: number; adoptable?: boolean; reason?: string };
type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
type Send = (context: string, method: string, path: string, body?: unknown, key?: string) => Promise<{ status: number; body?: unknown; empty_reason?: unknown }>;
export type AdoptionMemory = { key: (id: string) => string; skip: (org: string, id: string) => boolean; refuse: (org: string, id: string) => void };
export type AdoptionResult = { adopted: string[]; refused: string[]; unavailable: boolean };

/**
 * Adopta, una sola vez, los workspaces locales en la organización personal Free
 * del correo (plan de cuentas § 7.2, A11): primero el servidor (`POST
 * /v1/workspaces/adopt`, idempotente por llave), después el sello aquí con la
 * cuenta que devolvió. No mueve tareas. Un servidor sin la ruta (404, 501) corta
 * sin tocar nada; `409 id_taken` no se vuelve a pedir en esa organización. Otro
 * 409 es pasajero y se repite en el siguiente repaso. El sello no se deshace, así
 * que una respuesta que no corresponde a lo pedido no se sella.
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
  const refused: string[] = [];
  let candidates: AdoptionCandidate[];
  try {
    candidates = await invoke<AdoptionCandidate[]>("adoption_candidates", header);
  } catch {
    return { adopted, refused, unavailable: false };
  }
  for (const c of candidates) {
    if (c.adoptable === false || memory.skip(free.org, c.id)) continue;
    let reply: Awaited<ReturnType<Send>>;
    try {
      reply = await send(free.context_id, "POST", "/v1/workspaces/adopt", { engine_workspace_id: c.id, name: c.name }, memory.key(c.id));
    } catch {
      continue;
    }
    if (reply.status === 404 || reply.status === 501) return { adopted, refused, unavailable: true };
    const body = reply.body as { id?: unknown; code?: unknown; engine_workspace_id?: unknown; org?: unknown } | undefined;
    if (reply.status === 409) {
      if (body?.code === "id_taken") {
        memory.refuse(free.org, c.id);
        refused.push(c.name);
      }
      continue;
    }
    const accountId = asAccountId(body?.id);
    if (reply.status < 200 || reply.status >= 300 || reply.empty_reason || !accountId) continue;
    if ((body?.engine_workspace_id !== undefined && body.engine_workspace_id !== c.id) || (body?.org !== undefined && body.org !== free.org)) continue;
    try {
      await invoke("adopt_account_workspace", { ...header, id: c.id, account: { org: free.org, account_id: accountId } });
    } catch {
      continue;
    }
    adopted.push(c.id);
    // La unión del Free router con la cuenta nueva va aparte y se reintenta (`retryUnions`).
    pending.add({ id: c.id, context: free.context_id, org: free.org, account_id: accountId });
  }
  return { adopted, refused, unavailable: false };
}

/**
 * El Free donde adoptar: solo si hay uno. Con dos correos, cada uno con su Free,
 * el destino lo tiene que elegir la persona (pendiente, con diseño), porque el
 * sello no se deshace; mientras tanto no se adopta.
 */
export function adoptionTarget<G extends { org: string; plan?: string | null }>(groups: readonly G[]): G | undefined {
  const personals = groups.filter((g) => g.plan === "free");
  return new Set(personals.map((g) => g.org)).size === 1 ? personals[0] : undefined;
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
    // El rechazo es de esa organización: con el Free de otro correo se puede intentar.
    skip: (org, id) => read<string[]>(REFUSED, []).includes(`${org}:${id}`),
    refuse: (org, id) => write(REFUSED, [...new Set([...read<string[]>(REFUSED, []), `${org}:${id}`])]),
  };
}
