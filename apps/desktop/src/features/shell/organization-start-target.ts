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
