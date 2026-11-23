import type { ReturnGroup } from "../../../session/src/account-add-return.ts";

export function accountReturnTarget(groups: readonly ReturnGroup[] | null, before: readonly string[]) {
  for (const group of groups ?? []) {
    if (before.includes(group.context_id)) continue;
    const row = group.available?.find((workspace) => group.added?.has(workspace.id));
    if (row) return { id: row.id, context: group.context_id };
  }
  return null;
}
