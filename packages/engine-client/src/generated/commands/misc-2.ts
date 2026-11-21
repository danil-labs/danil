// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface AttachmentPreviewParams {
  project: string;
  id: string;
  rel: string;
}
export type AttachmentPreviewOutput = unknown;

export interface BackupTaskWorkParams {
  project: string;
  id: string;
}
export type BackupTaskWorkOutput = null;

export interface CallMcpAppToolParams {
  connectionId: string;
  name: string;
  arguments: unknown;
}
export type CallMcpAppToolOutput = unknown;

export interface ChangeAgentFoldersParams {
  scope: unknown;
  name: string;
  change: unknown;
}
export type ChangeAgentFoldersOutput = string[] | null;

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

export interface ClearFreeRouterGrantParams {
  workspace: string;
}
export type ClearFreeRouterGrantOutput = null;

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

export const COMMANDS_MISC_2 = {
  attachment_preview: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  backup_task_work: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  call_mcp_app_tool: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  change_agent_folders: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  chat: { kind: "cli", scope: null, authority: "task", channel: null },
  chat_background: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  chat_visual_part: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  check_environment: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  check_git_host: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  check_google_drive: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  check_integration: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  check_mcp: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  choose_chat_background: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  clear_free_router_grant: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  cli_task_opened: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  "client grant": { kind: "cli", scope: null, authority: "admin", channel: null },
  "client list": { kind: "cli", scope: null, authority: "admin", channel: null },
  "client revoke": { kind: "cli", scope: null, authority: "admin", channel: null },
  "client rotate": { kind: "cli", scope: null, authority: "admin", channel: null },
  "client show": { kind: "cli", scope: null, authority: "admin", channel: null },
  clone_project: { kind: "stream", scope: "workspace", authority: "admin", channel: "progress" },
} as const;
