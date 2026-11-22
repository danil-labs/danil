import type { SessionRailGroup } from "./session-groups.ts";

/** Los workspaces de un grupo que tienen cuadro en el riel: los agregados y el abierto. */
export function railTileWorkspaces<W extends { id: string }>(group: { available: readonly W[] | null; added: ReadonlySet<string> | null }, open: string | null): readonly W[] {
  return (group.available ?? []).filter((w) => group.added?.has(w.id) || w.id === open);
}

/** Los ids de sesiones cerradas no se convierten en locales, aunque aún estén en el índice. */
export function sessionVisible<T extends { id: string; name: string; logo: string | null }>(list: readonly T[], open: string | null, hidden: ReadonlySet<string>, groups: readonly SessionRailGroup[], known: ReadonlySet<string>): T[] {
  const local = list.filter((w) => !known.has(w.id) && (w.id === open || !hidden.has(w.id)));
  const remote = groups.flatMap((g) => railTileWorkspaces(g, open).map((w) => list.find((row) => row.id === w.id) ?? { ...w, logo: null } as T));
  return [...local, ...remote.filter((w, i) => remote.findIndex((row) => row.id === w.id) === i)];
}

/** `free` solo lo puede aportar la unión de E1 y W1a; el nombre o la máquina no lo clasifican. */
export function freeSessionRow(group: Pick<SessionRailGroup, "plan" | "free" | "empty_reason">) {
  return !group.empty_reason && group.plan === "free" ? group.free ?? null : null;
}

export function sessionStartTarget(list: readonly { id: string }[], open: string | null, hidden: ReadonlySet<string>, groups: readonly SessionRailGroup[]): string | null {
  if (!open || groups.some((g) => !g.available || !g.added)) return null;
  const group = groups.find((g) => g.available?.some((w) => w.id === open));
  if (!group || group.added?.has(open)) return null;
  const first = groups.flatMap((g) => (g.available ?? []).filter((w) => g.added?.has(w.id)))[0];
  const ids = new Set(groups.flatMap((g) => (g.available ?? []).map((w) => w.id)));
  return first?.id ?? list.find((w) => !ids.has(w.id) && !hidden.has(w.id))?.id ?? null;
}
