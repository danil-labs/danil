import { accountId as asAccountId, type PendingUnions } from "./account-transfers.ts";

/** Un workspace local que se puede adoptar en la organización personal (`adoption_candidates`). */
export type AdoptionCandidate = { id: string; name: string; created_at?: number; adoptable?: boolean; reason?: string };
type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
type Send = (context: string, method: string, path: string, body?: unknown, key?: string) => Promise<{ status: number; body?: unknown; empty_reason?: unknown }>;
export type AdoptionMemory = { key: (id: string) => string; skip: (org: string, id: string) => boolean; refuse: (org: string, id: string) => void };
export type AdoptionResult = { adopted: string[]; refused: string[]; unavailable: boolean };

/** La prueba de posesión que firma el motor (`adoption_proof`, A17). */
type AdoptionProof = { jwk: { kty: "EC"; crv: "P-256"; x: string; y: string }; jkt: string; sig: string };
const B64 = /^[A-Za-z0-9_-]+$/;
/** 32 bytes en base64url sin relleno: el reto y la huella RFC 7638 (SHA-256). */
const B64_32 = /^[A-Za-z0-9_-]{43}$/;

function proofOf(value: unknown): AdoptionProof | null {
  const p = value as { jwk?: Record<string, unknown>; jkt?: unknown; sig?: unknown } | null;
  const jwk = p?.jwk;
  if (!jwk || Object.keys(jwk).sort().join() !== "crv,kty,x,y" || jwk.kty !== "EC" || jwk.crv !== "P-256") return null;
  if (![jwk.x, jwk.y, p.jkt].every((v) => typeof v === "string" && B64_32.test(v))) return null;
  if (typeof p.sig !== "string" || !B64.test(p.sig)) return null;
  return { jwk: { kty: "EC", crv: "P-256", x: jwk.x as string, y: jwk.y as string }, jkt: p.jkt as string, sig: p.sig as string };
}

/**
 * Sin la ruta (404, 501), con la adopción apagada (`503 adoption_disabled`), sin
 * organización personal marcada (`409 adoption_requires_personal`) o sin plan
 * Free (`409 adoption_requires_free`), los locales se quedan así y se vuelve a
 * intentar en el siguiente inicio de sesión.
 */
function stops(reply: { status: number; body?: unknown }) {
  const code = (reply.body as { code?: unknown } | undefined)?.code;
  return reply.status === 404 || reply.status === 501 || (reply.status === 503 && code === "adoption_disabled") || (reply.status === 409 && (code === "adoption_requires_personal" || code === "adoption_requires_free"));
}

/** El `sub` de la persona en ese contexto: el que firma la prueba y el servidor compara con la sesión. */
async function personOf(send: Send, context: string, known: string | null) {
  if (known) return known;
  const reply = await send(context, "GET", "/v1/identity/me").catch(() => null);
  const id = (reply?.body as { id?: unknown } | undefined)?.id;
  return reply?.status === 200 && typeof id === "string" && id ? id : null;
}

/**
 * Adopta, una sola vez, los workspaces locales en la organización personal Free
 * del correo (plan de cuentas § 7.2, A11, con la prueba de posesión de A17 §
 * 10.1). Por cada candidato: el reto del servidor (`POST
 * /v1/workspaces/adopt/challenge`), la prueba que firma el motor con la llave del
 * workspace (`adoption_proof`), `POST /v1/workspaces/adopt` con esa prueba y, al
 * final, el sello aquí con la cuenta que devolvió. Solo se sella si el servidor
 * repite el `jkt` de este motor (`possession.jkt`): uno que ignoró la prueba no
 * sella nada. No mueve tareas. `409 id_taken` no se vuelve a pedir en esa
 * organización; otro 409 o una prueba rechazada se repiten en el siguiente
 * repaso con un reto nuevo; un 429 del reto termina el repaso. El sello no se deshace, así que una respuesta que no
 * corresponde a lo pedido no se sella.
 */
export async function adoptLocals(
  invoke: Invoke,
  header: Record<string, unknown>,
  send: Send,
  free: { context_id: string; org: string },
  memory: AdoptionMemory,
  pending: PendingUnions,
  person: string | null = null,
): Promise<AdoptionResult> {
  const adopted: string[] = [];
  const refused: string[] = [];
  let candidates: AdoptionCandidate[];
  try {
    candidates = await invoke<AdoptionCandidate[]>("adoption_candidates", header);
  } catch {
    return { adopted, refused, unavailable: false };
  }
  candidates = candidates.filter((c) => c.adoptable !== false && !memory.skip(free.org, c.id));
  if (!candidates.length) return { adopted, refused, unavailable: false };
  const sub = await personOf(send, free.context_id, person);
  if (!sub) return { adopted, refused, unavailable: false };
  for (const c of candidates) {
    let reply: Awaited<ReturnType<Send>>;
    let proof: AdoptionProof | null;
    let nonce: string;
    try {
      const challenge = await send(free.context_id, "POST", "/v1/workspaces/adopt/challenge", { engine_workspace_id: c.id });
      if (stops(challenge)) return { adopted, refused, unavailable: true };
      // El límite de retos: este repaso termina y el siguiente lo vuelve a intentar.
      if (challenge.status === 429) break;
      const value = (challenge.body as { nonce?: unknown } | undefined)?.nonce;
      if (challenge.status !== 200 || challenge.empty_reason || typeof value !== "string" || !B64_32.test(value)) continue;
      nonce = value;
      proof = proofOf(await invoke("adoption_proof", { ...header, id: c.id, nonce, org: free.org, sub }));
      if (!proof) continue;
      // Cada intento lleva un reto distinto, así que su llave también: la repetición segura entre intentos
      // la da el servidor (mismo id, misma llave de posesión y misma organización responden la misma cuenta).
      const body = { engine_workspace_id: c.id, name: c.name, proof: { nonce, jwk: proof.jwk, sig: proof.sig } };
      reply = await send(free.context_id, "POST", "/v1/workspaces/adopt", body, `${memory.key(c.id)}.${nonce}`);
    } catch {
      continue;
    }
    if (stops(reply)) return { adopted, refused, unavailable: true };
    const body = reply.body as { id?: unknown; code?: unknown; engine_workspace_id?: unknown; org?: unknown; possession?: { jkt?: unknown } } | undefined;
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
    if (body?.possession?.jkt !== proof.jkt) continue;
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
