/** Un workspace de esta computadora que el servidor trasladó de una cuenta a otra (plan de cuentas § 8, A12). */
export type AccountMove = { id: string; context: string; from: { org: string; account_id: string }; to: { org: string; account_id: string } };
/** Una unión del Free router que falta tras un traslado: se reintenta en cada repaso hasta que el motor la acepte. */
export type PendingUnion = { id: string; context: string; org: string; account_id: string };
export type PendingUnions = { list: () => PendingUnion[]; add: (union: PendingUnion) => void; remove: (id: string) => void };
type Local = { id: string; account: { org: string; account_id: string } };
type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

/** `tenancy.accounts.id` es `bigint`: texto decimal, o un número solo si es un entero seguro. */
export function accountId(value: unknown): string | null {
  if (typeof value === "string") return /^[1-9][0-9]{0,18}$/.test(value) ? value : null;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : null;
}

/** `moved_from` como texto o como `{org?, account_id}`, mientras `workspaces` no fija la forma. */
function origin(value: unknown): { org: string | null; account_id: string } | null {
  if (value && typeof value === "object") {
    const id = accountId((value as { account_id?: unknown }).account_id);
    const org = (value as { org?: unknown }).org;
    return id ? { org: typeof org === "string" && org ? org : null, account_id: id } : null;
  }
  const id = accountId(value);
  return id ? { org: null, account_id: id } : null;
}

/**
 * Los traslados que el catálogo de una organización declara para los workspaces
 * sellados aquí: la cuenta nueva trae el mismo `engine_workspace_id` y
 * `moved_from` con la cuenta vieja (si trae `org`, tiene que ser la del sello).
 * Sin esos campos (un servidor anterior) no hay nada que hacer.
 */
export function movesFor(local: readonly Local[], org: string, context: string, items: readonly unknown[]): AccountMove[] {
  const moves: AccountMove[] = [];
  for (const raw of items) {
    const item = raw as { id?: unknown; org?: unknown; engine_workspace_id?: unknown; moved_from?: unknown; archived?: unknown };
    const engine = typeof item.engine_workspace_id === "string" && item.engine_workspace_id ? item.engine_workspace_id : null;
    const id = accountId(item.id);
    const from = origin(item.moved_from);
    if (!engine || !id || !from || item.archived === true) continue;
    const to = { org: typeof item.org === "string" && item.org ? item.org : org, account_id: id };
    const here = local.find((w) => w.id === engine && w.account.account_id === from.account_id && (from.org === null || from.org === w.account.org));
    if (here && !(here.account.org === to.org && here.account.account_id === to.account_id)) moves.push({ id: engine, context, from: here.account, to });
  }
  return moves;
}

/**
 * Vuelve a sellar y deja pendiente la unión del Free router con la cuenta nueva;
 * en ese orden, porque la unión exige repetir el sello. Un re-sellado que falla
 * se repite en el siguiente repaso, porque el catálogo sigue declarando el traslado.
 */
export async function applyMoves(invoke: Invoke, header: Record<string, unknown>, moves: readonly AccountMove[], pending: PendingUnions) {
  let applied = 0;
  for (const move of moves) {
    try {
      await invoke("reseal_account_workspace", { ...header, id: move.id, from: move.from, to: move.to });
    } catch { continue; }
    applied++;
    pending.add({ id: move.id, context: move.context, org: move.to.org, account_id: move.to.account_id });
  }
  return applied;
}

/** Las uniones pendientes, en cada repaso: la que el motor acepta sale de la lista. */
export async function retryUnions(invoke: Invoke, header: Record<string, unknown>, pending: PendingUnions, personOf: (context: string) => string | null) {
  for (const union of pending.list()) {
    const person = personOf(union.context);
    if (!person) continue;
    try {
      await invoke("set_free_router_union", { ...header, workspace: union.id, platformAccount: union.account_id, org: union.org, sub: person });
      pending.remove(union.id);
    } catch { /* Sin red o sin motor: sigue pendiente. */ }
  }
}

/** La lista en las preferencias de esta computadora: sobrevive a un reinicio. */
export function prefsPendingUnions(read: <T>(key: string, fallback: T) => T, write: (key: string, value: unknown) => void, key = "workspaces.pending_unions"): PendingUnions {
  const all = () => read<PendingUnion[]>(key, []).filter((u) => u && typeof u.id === "string" && typeof u.context === "string");
  return {
    list: all,
    add: (union) => write(key, [...all().filter((u) => u.id !== union.id), union]),
    remove: (id) => write(key, all().filter((u) => u.id !== id)),
  };
}
