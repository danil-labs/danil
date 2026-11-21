import type { SessionRailGroup } from "./session-groups.ts";

export function organizationStartTarget(groups: readonly SessionRailGroup[], workspace: string, context: string | null, defaultContext: string | null) {
  const selected = groups.find((group) => group.context_id === (context ?? defaultContext));
  if (selected?.available?.some((row) => row.id === workspace) && selected.added?.has(workspace)) return { id: workspace, context: selected.context_id };
  for (const group of selected ? [selected, ...groups.filter((row) => row !== selected)] : groups) {
    const row = group.available?.find((item) => group.added?.has(item.id));
    if (row) return { id: row.id, context: group.context_id };
  }
  return null;
}

/** W6: el workspace de la URL y su dueño (`account` = sub del correo, `org`); el contexto se resuelve de nuevo, nunca se guarda. */
export function requestedStartTarget(groups: readonly SessionRailGroup[], families: readonly { family: string; sub?: string }[], search: string) {
  const params = new URLSearchParams(search);
  const [id, org, sub] = ["workspace", "org", "account"].map((name) => params.get(name));
  if (!id || !org || !sub) return null;
  const family = families.find((f) => f.sub === sub)?.family;
  const group = family ? groups.find((g) => g.org === org && g.family === family) : undefined;
  return group ? { id, context: group.context_id } : null;
}
