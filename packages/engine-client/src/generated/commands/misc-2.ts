// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type ChatParams = Record<string, never>;
export type ChatOutput = null;

export type ChatBackgroundParams = Record<string, never>;
export type ChatBackgroundOutput = unknown | null;

export interface ChatVisualPartParams {
  project: string;
  session: string;
  file: string;
  offset: number;
  size: number;
  revision?: string | null;
}
export type ChatVisualPartOutput = unknown;

export interface CheckEnvironmentParams {
  force?: boolean | null;
}
export type CheckEnvironmentOutput = unknown;

export interface CheckGitHostParams {
  id: string;
  scope?: string | null;
}
export type CheckGitHostOutput = unknown;

export interface CheckGoogleDriveParams {
  workspace?: string | null;
}
export type CheckGoogleDriveOutput = unknown;

export interface CheckIntegrationParams {
  id: unknown;
}
export type CheckIntegrationOutput = unknown;

export type CheckMcpParams = Record<string, never>;
export type CheckMcpOutput = ([string, unknown])[];

export interface ChooseChatBackgroundParams {
  path?: string | null;
}
export type ChooseChatBackgroundOutput = null;

export interface CliTaskOpenedParams {
  operation: string;
  error?: string | null;
}
export type CliTaskOpenedOutput = null;

export type CliClientGrantParams = Record<string, never>;
export type CliClientGrantOutput = null;

export type CliClientListParams = Record<string, never>;
export type CliClientListOutput = null;

export type CliClientRevokeParams = Record<string, never>;
export type CliClientRevokeOutput = null;

export type CliClientRotateParams = Record<string, never>;
export type CliClientRotateOutput = null;

export type CliClientShowParams = Record<string, never>;
export type CliClientShowOutput = null;

export interface CloneProjectParams {
  url: string;
  name: string;
  directory?: string | null;
  operation: string;
  workspace: string;
  portfolio?: string | null;
  gitHost?: string | null;
  space?: string | null;
  id?: string | null;
}
export type CloneProjectOutput = unknown;

export interface CloseMcpAppParams {
  connectionId: string;
}
export type CloseMcpAppOutput = null;

export interface ClosePortParams {
  session: string;
  pid: number;
  puerto: number;
}
export type ClosePortOutput = unknown;

export interface CloseProcessParams {
  session: string;
  pid: number;
}
export type CloseProcessOutput = unknown;

export type CollectOrphansParams = Record<string, never>;
export type CollectOrphansOutput = unknown;

export type CliConfigGetParams = Record<string, never>;
export type CliConfigGetOutput = null;

export const COMMANDS_MISC_2 = {
  chat: { kind: "cli", scope: null, authority: "task", channel: null },
  chat_background: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  chat_visual_part: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  check_environment: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  check_git_host: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  check_google_drive: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  check_integration: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  check_mcp: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  choose_chat_background: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  cli_task_opened: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  "client grant": { kind: "cli", scope: null, authority: "admin", channel: null },
  "client list": { kind: "cli", scope: null, authority: "admin", channel: null },
  "client revoke": { kind: "cli", scope: null, authority: "admin", channel: null },
  "client rotate": { kind: "cli", scope: null, authority: "admin", channel: null },
  "client show": { kind: "cli", scope: null, authority: "admin", channel: null },
  clone_project: { kind: "stream", scope: "workspace", authority: "admin", channel: "progress" },
  close_mcp_app: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  close_port: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  close_process: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  collect_orphans: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  "config get": { kind: "cli", scope: null, authority: "read", channel: null },
} as const;
