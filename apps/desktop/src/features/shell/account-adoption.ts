import { accountId as asAccountId, type PendingUnions } from "./account-transfers.ts";
import { WORKSPACES_ADOPT_CHALLENGE_PATH, WORKSPACES_ADOPT_PATH, workspacesPagePath } from "../../platform/workspaces.ts";

/** Un workspace local que se puede adoptar en la organización personal (`adoption_candidates`). */
export type AdoptionCandidate = { id: string; name: string; created_at?: number; adoptable?: boolean; reason?: string };
type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
type Send = (context: string, method: string, path: string, body?: unknown, key?: string) => Promise<{ status: number; body?: unknown; empty_reason?: unknown }>;
export type AdoptionMemory = { key: (id: string) => string; skip: (org: string, id: string) => boolean; refuse: (org: string, id: string) => void; forget?: () => void };
export type AdoptionClaimed = { id: string; name: string };
/** Un local que no se pudo traer, con la causa que el aviso enseña. */
export type AdoptionFailure = { id: string; name: string; reason: string };
export type AdoptionResult = {
  adopted: AdoptionClaimed[];
  /** Ya estaban en la plataforma: solo se selló aquí y no se cuentan como traídos. */
  already: AdoptionClaimed[];
  refused: AdoptionFailure[];
  failed: AdoptionFailure[];
  unavailable: boolean;
  cause: string | null;
  /** Candidatos que se intentaron; `0` es «no había nada que traer». */
  attempted: number;
};

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
 * intentar en el siguiente inicio de sesión o al reintentar el aviso.
 */
function stopCause(reply: { status: number; body?: unknown }): string | null {
  const code = (reply.body as { code?: unknown } | undefined)?.code;
  if (reply.status === 404 || reply.status === 501) return "adoption_route_missing";
  if (reply.status === 503 && code === "adoption_disabled") return "adoption_disabled";
  if (reply.status === 409 && code === "adoption_requires_personal") return "adoption_requires_personal";
  if (reply.status === 409 && code === "adoption_requires_free") return "adoption_requires_free";
  return null;
}

/** El `sub` de la persona en ese contexto: el que firma la prueba y el servidor compara con la sesión. */
async function personOf(send: Send, context: string, known: string | null) {
  if (known) return known;
  const reply = await send(context, "GET", "/v1/identity/me").catch(() => null);
  const id = (reply?.body as { id?: unknown } | undefined)?.id;
  return reply?.status === 200 && typeof id === "string" && id ? id : null;
}

/** Las cuentas de la organización por id de motor: lo que la plataforma ya tiene. */
async function platformByEngine(send: Send, context: string): Promise<Map<string, string> | null> {
  const found = new Map<string, string>();
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const reply = await send(context, "GET", workspacesPagePath(cursor)).catch(() => null);
    if (!reply || reply.status !== 200) return null;
    const body = reply.body as { items?: unknown[]; next_cursor?: string | null };
    for (const raw of body.items ?? []) {
      const row = raw as { id?: unknown; engine_workspace_id?: unknown };
      const account = asAccountId(row.id);
      if (account && typeof row.engine_workspace_id === "string" && row.engine_workspace_id) found.set(row.engine_workspace_id, account);
    }
    cursor = typeof body.next_cursor === "string" ? body.next_cursor : null;
    if (cursor && seen.has(cursor)) break;
    if (cursor) seen.add(cursor);
  } while (cursor);
  return found;
}

/**
 * Adopta, una sola vez, los workspaces locales en la organización personal Free
 * del correo (plan de cuentas § 7.2, A11, con la prueba de posesión de A17 §
 * 10.1). Por cada candidato: el reto del servidor (`POST
 * /v1/workspaces/adopt/challenge`), la prueba que firma el motor con la llave del
 * workspace (`adoption_proof`), `POST /v1/workspaces/adopt` con esa prueba y, al
 * final, el sello aquí con la cuenta que devolvió. Solo se sella si el servidor
 * repite el `jkt` de este motor (`possession.jkt`): uno que ignoró la prueba no
 * sella nada. Un id que la plataforma ya tiene se omite y solo se sella. No
 * mueve tareas. `409 id_taken` no se vuelve a pedir en esa organización; otro
 * 409, una prueba rechazada o un fallo del sello se cuentan en `failed` y se
 * repiten en el siguiente repaso con un reto nuevo; un 429 del reto termina el
 * repaso. El sello no se deshace, así que una respuesta que no corresponde a lo
 * pedido no se sella.
 */
export async function adoptLocals(
  invoke: Invoke,
  header: Record<string, unknown>,
  send: Send,
  free: { context_id: string; org: string },
  memory: AdoptionMemory,
  pending: PendingUnions,
  person: string | null = null,
  progress: (id: string, name: string, step: "waiting" | "working" | "done") => void = () => {},
): Promise<AdoptionResult> {
  const adopted: AdoptionClaimed[] = [];
  const already: AdoptionClaimed[] = [];
  const refused: AdoptionFailure[] = [];
  const failed: AdoptionFailure[] = [];
  const empty = { adopted, already, refused, failed, unavailable: false, cause: null, attempted: 0 };
  let candidates: AdoptionCandidate[];
  try {
    candidates = await invoke<AdoptionCandidate[]>("adoption_candidates", header);
  } catch {
    return { ...empty, cause: "engine" };
  }
  for (const c of candidates) {
    if (c.adoptable === false) failed.push({ id: c.id, name: c.name, reason: c.reason ?? "not_adoptable" });
  }
  candidates = candidates.filter((c) => c.adoptable !== false && !memory.skip(free.org, c.id));
  if (!candidates.length) return empty;
  for (const c of candidates) progress(c.id, c.name, "waiting");
  const sub = await personOf(send, free.context_id, person);
  if (!sub) return { ...empty, cause: "no_person", attempted: 0 };
  const platform = await platformByEngine(send, free.context_id);
  let attempted = 0;
  for (const c of candidates) {
    attempted++;
    progress(c.id, c.name, "working");
    const known = platform?.get(c.id);
    if (known) {
      // La plataforma ya la tiene: no se reclama otra vez, solo se recupera el sello local.
      try {
        await invoke("adopt_account_workspace", { ...header, id: c.id, account: { org: free.org, account_id: known } });
        already.push({ id: c.id, name: c.name });
        progress(c.id, c.name, "done");
        pending.add({ id: c.id, context: free.context_id, org: free.org, account_id: known });
      } catch {
        failed.push({ id: c.id, name: c.name, reason: "seal" });
      }
      continue;
    }
    let reply: Awaited<ReturnType<Send>>;
    let proof: AdoptionProof | null;
    let nonce: string;
    try {
      const challenge = await send(free.context_id, "POST", WORKSPACES_ADOPT_CHALLENGE_PATH, { engine_workspace_id: c.id });
      const stop = stopCause(challenge);
      if (stop) return { adopted, already, refused, failed, unavailable: true, cause: stop, attempted };
      // El límite de retos: este repaso termina y el siguiente lo vuelve a intentar.
      if (challenge.status === 429) break;
      const value = (challenge.body as { nonce?: unknown } | undefined)?.nonce;
      if (challenge.status !== 200 || challenge.empty_reason || typeof value !== "string" || !B64_32.test(value)) {
        failed.push({ id: c.id, name: c.name, reason: `challenge_${challenge.status}` });
        continue;
      }
      nonce = value;
      proof = proofOf(await invoke("adoption_proof", { ...header, id: c.id, nonce, org: free.org, sub }));
      if (!proof) {
        failed.push({ id: c.id, name: c.name, reason: "proof" });
        continue;
      }
      // Cada intento lleva un reto distinto, así que su llave también: la repetición segura entre intentos
      // la da el servidor (mismo id, misma llave de posesión y misma organización responden la misma cuenta).
      const body = { engine_workspace_id: c.id, name: c.name, proof: { nonce, jwk: proof.jwk, sig: proof.sig } };
      reply = await send(free.context_id, "POST", WORKSPACES_ADOPT_PATH, body, `${memory.key(c.id)}.${nonce}`);
    } catch {
      failed.push({ id: c.id, name: c.name, reason: "network" });
      continue;
    }
    const stop = stopCause(reply);
    if (stop) return { adopted, already, refused, failed, unavailable: true, cause: stop, attempted };
    const body = reply.body as { id?: unknown; code?: unknown; engine_workspace_id?: unknown; org?: unknown; possession?: { jkt?: unknown } } | undefined;
    if (reply.status === 409) {
      const reason = typeof body?.code === "string" ? body.code : "conflict";
      if (reason === "id_taken") {
        memory.refuse(free.org, c.id);
        refused.push({ id: c.id, name: c.name, reason });
      } else failed.push({ id: c.id, name: c.name, reason });
      continue;
    }
    const accountId = asAccountId(body?.id);
    if (reply.status < 200 || reply.status >= 300 || reply.empty_reason || !accountId) {
      failed.push({ id: c.id, name: c.name, reason: `adopt_${reply.status}` });
      continue;
    }
    if ((body?.engine_workspace_id !== undefined && body.engine_workspace_id !== c.id) || (body?.org !== undefined && body.org !== free.org) || body?.possession?.jkt !== proof.jkt) {
      failed.push({ id: c.id, name: c.name, reason: "reply_mismatch" });
      continue;
    }
    try {
      await invoke("adopt_account_workspace", { ...header, id: c.id, account: { org: free.org, account_id: accountId } });
    } catch {
      // La cuenta ya es de la persona en la plataforma: el siguiente repaso la sella (`already`).
      failed.push({ id: c.id, name: c.name, reason: "seal" });
      continue;
    }
    adopted.push({ id: c.id, name: c.name });
    progress(c.id, c.name, "done");
    // La unión del Free router con la cuenta nueva va aparte y se reintenta (`retryUnions`).
    pending.add({ id: c.id, context: free.context_id, org: free.org, account_id: accountId });
  }
  return { adopted, already, refused, failed, unavailable: false, cause: null, attempted };
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

/**
 * El destino es la organización **personal** de la persona, no cualquiera con plan
 * Free: un equipo puede tener plan Free y no puede recibir adopciones. identity la
 * marca con `type: "personal"`; un servidor anterior que no lo manda cae al plan.
 */
export async function adoptionTargetOf<G extends { context_id: string; org: string; plan?: string | null }>(groups: readonly G[], send: Send): Promise<G | undefined> {
  if (!groups.length) return undefined;
  const me = await send(groups[0].context_id, "GET", "/v1/identity/me").catch(() => null);
  if (!me || me.status !== 200) return adoptionTarget(groups);
  const organizations = (me.body as { organizations?: unknown } | null)?.organizations;
  if (!Array.isArray(organizations)) return adoptionTarget(groups);
  const personal = organizations.flatMap((raw) => {
    const org = raw as { id?: unknown; type?: unknown };
    return typeof org.id === "string" && org.type === "personal" ? [org.id] : [];
  });
  if (!personal.length) return adoptionTarget(groups);
  return personal.length === 1 ? groups.find((g) => g.org === personal[0]) : undefined;
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
    // Un rechazo inesperado se vuelve a intentar en el siguiente arranque (plan de ligar locales § 2.6).
    forget: () => write(REFUSED, []),
  };
}
