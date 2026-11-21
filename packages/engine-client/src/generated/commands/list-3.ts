// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type ListTaskMentionsParams = Record<string, never>;
export type ListTaskMentionsOutput = unknown[];

export interface ListTaskTreesParams {
  project: string;
  session: string;
}
export type ListTaskTreesOutput = unknown[];

export type ListWorkspaceAttentionParams = Record<string, never>;
export type ListWorkspaceAttentionOutput = unknown[];

export type ListWorkspacesParams = Record<string, never>;
export type ListWorkspacesOutput = unknown;

export const COMMANDS_LIST_3 = {
  list_task_mentions: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  list_task_trees: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  list_workspace_attention: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  list_workspaces: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
} as const;
