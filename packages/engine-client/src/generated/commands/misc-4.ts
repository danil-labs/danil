// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface DiscardTaskChangesParams {
  project: string;
  id: string;
  files: string[];
}
export type DiscardTaskChangesOutput = null;

export interface DisconnectGitHostParams {
  id: string;
  scope?: string | null;
}
export type DisconnectGitHostOutput = null;

export interface DisconnectGoogleDriveParams {
  workspace?: string | null;
}
export type DisconnectGoogleDriveOutput = null;

export interface DisconnectKnownMcpParams {
  id: string;
}
export type DisconnectKnownMcpOutput = null;

export interface DownloadArtifactParams {
  path: string;
  version?: number | null;
  destino: string;
}
export type DownloadArtifactOutput = unknown;

export type EmptyBuildCacheParams = Record<string, never>;
export type EmptyBuildCacheOutput = unknown;

export type CliEngineStartParams = Record<string, never>;
export type CliEngineStartOutput = null;

export type CliEngineStatusParams = Record<string, never>;
export type CliEngineStatusOutput = null;

export type CliEngineStopParams = Record<string, never>;
export type CliEngineStopOutput = null;

export interface EnsureProjectParams {
  project: string;
}
export type EnsureProjectOutput = unknown;

export type CliEventsSubscribeParams = Record<string, never>;
export type CliEventsSubscribeOutput = null;

export type CliEventsUnsubscribeParams = Record<string, never>;
export type CliEventsUnsubscribeOutput = null;

export type CliExecutorReleaseActivateParams = Record<string, never>;
export type CliExecutorReleaseActivateOutput = null;

export type CliExecutorReleaseRollbackParams = Record<string, never>;
export type CliExecutorReleaseRollbackOutput = null;

export type CliExecutorReleaseStageParams = Record<string, never>;
export type CliExecutorReleaseStageOutput = null;

export type CliExecutorReleaseStatusParams = Record<string, never>;
export type CliExecutorReleaseStatusOutput = null;

export interface ExportChatParams {
  project: string;
  id: string;
}
export type ExportChatOutput = unknown;

export interface FileSizeParams {
  path: string;
}
export type FileSizeOutput = number;

export interface FinishBrowserLoginParams {
  id: string;
  scope?: string | null;
}
export type FinishBrowserLoginOutput = unknown;

export interface FinishGitHostSetupParams {
  id: string;
  scope?: string | null;
}
export type FinishGitHostSetupOutput = unknown;

export interface FinishGoogleDriveLoginParams {
  workspace?: string | null;
}
export type FinishGoogleDriveLoginOutput = unknown;

export const COMMANDS_MISC_4 = {
  discard_task_changes: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  disconnect_git_host: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  disconnect_google_drive: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  disconnect_known_mcp: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  download_artifact: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  empty_build_cache: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  "engine start": { kind: "cli", scope: null, authority: "admin", channel: null },
  "engine status": { kind: "cli", scope: null, authority: "admin", channel: null },
  "engine stop": { kind: "cli", scope: null, authority: "admin", channel: null },
  ensure_project: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  "events subscribe": { kind: "rpc", scope: null, authority: "read", channel: null },
  "events unsubscribe": { kind: "rpc", scope: null, authority: "read", channel: null },
  "executor release activate": { kind: "cli", scope: null, authority: "admin", channel: null },
  "executor release rollback": { kind: "cli", scope: null, authority: "admin", channel: null },
  "executor release stage": { kind: "cli", scope: null, authority: "admin", channel: null },
  "executor release status": { kind: "cli", scope: null, authority: "admin", channel: null },
  export_chat: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  file_size: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  finish_browser_login: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  finish_git_host_setup: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  finish_google_drive_login: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
} as const;
