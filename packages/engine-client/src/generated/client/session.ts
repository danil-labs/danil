// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { CliSessionAttachParams, CliSessionAttachOutput, CliSessionDetachParams, CliSessionDetachOutput, CliSessionListParams, CliSessionListOutput, SessionFolderParams, SessionFolderOutput, SessionUsageParams, SessionUsageOutput, SessionWorktreeParams, SessionWorktreeOutput } from "../commands/session.ts";

export function bind_session(t: EngineTransport) {
  return {
    "session attach": () => t.call("session attach", {}) as Promise<CliSessionAttachOutput>,
    "session detach": () => t.call("session detach", {}) as Promise<CliSessionDetachOutput>,
    "session list": () => t.call("session list", {}) as Promise<CliSessionListOutput>,
    session_folder: (params: SessionFolderParams) => t.call("session_folder", params) as Promise<SessionFolderOutput>,
    session_usage: (params: SessionUsageParams) => t.call("session_usage", params) as Promise<SessionUsageOutput>,
    session_worktree: (params: SessionWorktreeParams) => t.call("session_worktree", params) as Promise<SessionWorktreeOutput>,
  };
}
