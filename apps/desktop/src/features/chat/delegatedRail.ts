import { taskPriority } from "@terminus/design";
import { delegatedAttention } from "@terminus/tasks";
import type { SessionRow } from "../projects/Sessions";

export { delegatedAttention };

/** El riel enseña lo pendiente: `list_delegated_sessions` trae también las archivadas, que solo pinta la tarjeta del lanzamiento. */
export function delegatedRailRows(rows: SessionRow[], all: boolean, live: readonly string[], approvals: readonly string[]): SessionRow[] {
  const pending = rows.filter(row => !row.archived);
  return all ? pending : pending.filter(row => taskPriority(delegatedAttention([row], live, approvals)));
}
