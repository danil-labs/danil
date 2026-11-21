// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type CliSessionAttachParams = Record<string, never>;
export type CliSessionAttachOutput = null;

export type CliSessionDetachParams = Record<string, never>;
export type CliSessionDetachOutput = null;

export type CliSessionListParams = Record<string, never>;
export type CliSessionListOutput = null;

export interface SessionFolderParams {
  project: string;
  id: string;
}
export type SessionFolderOutput = string;

export interface SessionUsageParams {
  project: string;
  session: string;
}
export type SessionUsageOutput = unknown;

export interface SessionWorktreeParams {
  project: string;
  id: string;
}
export type SessionWorktreeOutput = unknown | null;

export const COMMANDS_SESSION = {
  "session attach": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "session detach": { kind: "cli", scope: null, authority: "read", channel: null, relay: false },
  "session list": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  session_folder: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  session_usage: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  session_worktree: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
} as const;
