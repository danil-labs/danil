import { mergeAttention } from "@terminus/protocol";
import { displayWorkspaceContext } from "../../../../apps/desktop/src/lib/workspace-context.ts";

export function mergeContextAttention<E extends { workspace: string; context?: string }>(current: E[], next: E[]): E[] {
  const contexts = new Set([...current, ...next].map((row) => row.context));
  return [...contexts].flatMap((context) => {
    const before = current.filter((row) => row.context === context);
    const update = next.filter((row) => row.context === context);
    return (update.length || context === undefined ? mergeAttention(before, update) : before).map((row) => ({ ...row, ...(context === undefined ? {} : { context }) }));
  });
}

export function contextAttentionOf<Task>(rows: readonly { workspace: string; context?: string; tasks: Task[] }[], workspace: string | null): Task[] {
  return rows.find((row) => row.workspace === workspace && (row.context ?? null) === displayWorkspaceContext())?.tasks ?? [];
}
