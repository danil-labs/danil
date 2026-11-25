import { taskPriority } from "../../../../ui/src/index.ts";
import { delegatedAttention } from "../../../../ui/src/lib/tasks/index.ts";
import type { SessionRow } from "../screens/Sessions";

export { delegatedAttention };

/** El riel enseña lo pendiente: `list_delegated_sessions` trae también las archivadas, que solo pinta la tarjeta del lanzamiento. */
export function delegatedRailRows(rows: SessionRow[], all: boolean, live: readonly string[], approvals: readonly string[]): SessionRow[] {
  const pending = rows.filter(row => !row.archived);
  return all ? pending : pending.filter(row => taskPriority(delegatedAttention([row], live, approvals)));
}
