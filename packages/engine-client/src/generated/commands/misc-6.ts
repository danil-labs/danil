// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type InstancesParams = Record<string, never>;
export type InstancesOutput = null;

export type KeepAwakeStatusParams = Record<string, never>;
export type KeepAwakeStatusOutput = unknown;

export type CliKeepAwakeSetParams = Record<string, never>;
export type CliKeepAwakeSetOutput = null;

export type CliKeepAwakeStatusParams = Record<string, never>;
export type CliKeepAwakeStatusOutput = null;

export interface LoadQueueParams {
  project: string;
  session: string;
}
export type LoadQueueOutput = unknown[];

export interface LoadSessionParams {
  project: string;
  id: string;
}
export type LoadSessionOutput = unknown;

export type LocalDownloadsParams = Record<string, never>;
export type LocalDownloadsOutput = unknown[];

export type LocalRuntimeParams = Record<string, never>;
export type LocalRuntimeOutput = unknown;

export interface LoginAccountParams {
  provider: string;
  id: string;
  mode: string;
}
export type LoginAccountOutput = null;

export interface MarkTaskSeenParams {
  workspace: string;
  session: string;
}
export type MarkTaskSeenOutput = null;

export interface MaterializeWorkspaceParams {
  id: string;
}
export type MaterializeWorkspaceOutput = unknown;

export interface MoveSessionParams {
  project: string;
  id: string;
  to: string;
}
export type MoveSessionOutput = null;

export interface MoveTaskToSpaceParams {
  project: string;
  id: string;
  space: string;
}
export type MoveTaskToSpaceOutput = unknown;

export type CliNoticeFetchParams = Record<string, never>;
export type CliNoticeFetchOutput = null;

export type CliNoticeTakeParams = Record<string, never>;
export type CliNoticeTakeOutput = null;

export type NotifyParams = Record<string, never>;
export type NotifyOutput = null;

export type ObservabilityConnectParams = Record<string, never>;
export type ObservabilityConnectOutput = unknown;

export type ObservabilityDisconnectParams = Record<string, never>;
export type ObservabilityDisconnectOutput = null;

export interface OfficePreviewParams {
  path: string;
}
export type OfficePreviewOutput = unknown;

export interface OpenExternalParams {
  target: string;
}
export type OpenExternalOutput = null;

export interface OpenFileExternalParams {
  target: string;
}
export type OpenFileExternalOutput = null;

export const COMMANDS_MISC_6 = {
  instances: { kind: "cli", scope: null, authority: "admin", channel: null },
  keep_awake_status: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  "keep-awake set": { kind: "cli", scope: null, authority: "admin", channel: null },
  "keep-awake status": { kind: "cli", scope: null, authority: "read", channel: null },
  load_queue: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  load_session: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  local_downloads: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  local_runtime: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  login_account: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  mark_task_seen: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  materialize_workspace: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  move_session: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  move_task_to_space: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  "notice fetch": { kind: "cli", scope: null, authority: "read", channel: null },
  "notice take": { kind: "cli", scope: null, authority: "read", channel: null },
  notify: { kind: "cli", scope: null, authority: "task", channel: null },
  observability_connect: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  observability_disconnect: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  office_preview: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  open_external: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  open_file_external: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
} as const;
