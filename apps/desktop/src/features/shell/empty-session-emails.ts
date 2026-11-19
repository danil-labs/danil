import { railTileWorkspaces } from "./session-rail-view.ts";

type Group = { family: string; email: string | null; available: readonly { id: string }[] | null; added: ReadonlySet<string> | null };

/** Los correos sin ningún cuadro en el riel (misma regla que `sessionVisible`): una fila por correo. */
export function emptySessionEmails(groups: readonly Group[] | null, open: string | null): { email: string | null; family: string }[] {
  const key = (g: Group) => g.email?.trim().toLowerCase() || `family:${g.family}`;
  const withTiles = new Set((groups ?? []).filter((g) => railTileWorkspaces(g, open).length).map(key));
  const rows = new Map<string, { email: string | null; family: string }>();
  for (const g of groups ?? []) if (!withTiles.has(key(g)) && !rows.has(key(g))) rows.set(key(g), { email: g.email, family: g.family });
  return [...rows.values()];
}
