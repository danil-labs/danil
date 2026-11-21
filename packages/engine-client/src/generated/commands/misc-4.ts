// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface DetachSessionSourceParams {
  project: string;
  session: string;
  source: string;
}
export type DetachSessionSourceOutput = null;

export interface DetachSourceParams {
  project: string;
  source: string;
}
export type DetachSourceOutput = null;

export interface DiscardAccountParams {
  provider: string;
  id: string;
}
export type DiscardAccountOutput = boolean;

export interface DiscardTaskChangesParams {
  project: string;
  id: string;
  files: string[];
}
export type DiscardTaskChangesOutput = null;

export interface DisconnectExternalParams {
  workspace: string;
  connection: string;
}
export type DisconnectExternalOutput = unknown;

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

export interface EnsureProjectParams {
  project: string;
}
export type EnsureProjectOutput = unknown;

export interface EnvSecretRemoveParams {
  folder: string;
  name: string;
}
export type EnvSecretRemoveOutput = unknown;

export interface EnvSecretSetParams {
  folder: string;
  name: string;
  value: string;
  replace?: boolean | null;
}
export type EnvSecretSetOutput = unknown;

export type EnvSecretsListParams = Record<string, never>;
export type EnvSecretsListOutput = unknown;

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

export const COMMANDS_MISC_4 = {
  detach_session_source: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  detach_source: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  discard_account: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  discard_task_changes: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  disconnect_external: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  disconnect_git_host: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  disconnect_google_drive: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  disconnect_known_mcp: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  download_artifact: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  empty_build_cache: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  ensure_project: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  env_secret_remove: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  env_secret_set: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  env_secrets_list: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  "events subscribe": { kind: "rpc", scope: null, authority: "read", channel: null, relay: false },
  "events unsubscribe": { kind: "rpc", scope: null, authority: "read", channel: null, relay: false },
  "executor release activate": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "executor release rollback": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "executor release stage": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "executor release status": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  export_chat: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
} as const;
