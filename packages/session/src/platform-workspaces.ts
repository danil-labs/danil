import { z } from "zod";
import type { EdgeTransport } from "../../platform-client/src/edge.ts";

export const workspaceId = z.string().regex(/^[1-9]\d*$/);
const workspace = z.object({ id: workspaceId, org: z.string(), name: z.string(), role: z.string(), engine_workspace_id: z.string().min(1).nullish() });
const page = z.object({ items: z.array(workspace), next_cursor: z.string().min(1).nullable() });
export type PlatformWorkspace = z.infer<typeof workspace>;

export async function listWorkspaces(call: EdgeTransport["call"]): Promise<PlatformWorkspace[]> {
  const items: PlatformWorkspace[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const result = page.parse(await (await call(`workspaces${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`)).json());
    items.push(...result.items);
    cursor = result.next_cursor;
    if (cursor && cursors.has(cursor)) throw new Error("Repeated workspace cursor");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return items;
}
