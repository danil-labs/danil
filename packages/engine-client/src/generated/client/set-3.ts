// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { SetWorkspaceWorktreesRootParams, SetWorkspaceWorktreesRootOutput } from "../commands/set-3.ts";

export function bind_set_3(t: EngineTransport) {
  return {
    set_workspace_worktrees_root: (params: SetWorkspaceWorktreesRootParams) => t.call("set_workspace_worktrees_root", params) as Promise<SetWorkspaceWorktreesRootOutput>,
  };
}
