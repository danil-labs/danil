// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { ListTaskMentionsParams, ListTaskMentionsOutput, ListTaskTreesParams, ListTaskTreesOutput, ListWorkspaceAttentionParams, ListWorkspaceAttentionOutput, ListWorkspacesParams, ListWorkspacesOutput } from "../commands/list-3.ts";

export function bind_list_3(t: EngineTransport) {
  return {
    list_task_mentions: () => t.call("list_task_mentions", {}) as Promise<ListTaskMentionsOutput>,
    list_task_trees: (params: ListTaskTreesParams) => t.call("list_task_trees", params) as Promise<ListTaskTreesOutput>,
    list_workspace_attention: () => t.call("list_workspace_attention", {}) as Promise<ListWorkspaceAttentionOutput>,
    list_workspaces: () => t.call("list_workspaces", {}) as Promise<ListWorkspacesOutput>,
  };
}
