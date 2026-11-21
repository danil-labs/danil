// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface SetWorkspaceWorktreesRootParams {
  id: string;
  root?: string | null;
}
export type SetWorkspaceWorktreesRootOutput = unknown;

export const COMMANDS_SET_3 = {
  set_workspace_worktrees_root: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
} as const;
