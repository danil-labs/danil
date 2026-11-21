// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type SourceFreshnessParams = Record<string, never>;
export type SourceFreshnessOutput = unknown[];

export type SourcesInUseParams = Record<string, never>;
export type SourcesInUseOutput = string[];

export type CliSpaceCreateParams = Record<string, never>;
export type CliSpaceCreateOutput = null;

export type CliSpaceDeleteParams = Record<string, never>;
export type CliSpaceDeleteOutput = null;

export type CliSpaceListParams = Record<string, never>;
export type CliSpaceListOutput = null;

export type CliSpaceRenameParams = Record<string, never>;
export type CliSpaceRenameOutput = null;

export interface SpaceDeletePreviewParams {
  id: string;
}
export type SpaceDeletePreviewOutput = unknown;

export interface StartBrowserLoginParams {
  id: string;
  scope?: string | null;
}
export type StartBrowserLoginOutput = unknown;

export interface StartGoogleDriveLoginParams {
  workspace?: string | null;
}
export type StartGoogleDriveLoginOutput = unknown;

export interface StartLocalModelParams {
  id: string;
}
export type StartLocalModelOutput = string;

export interface StartProjectCloneParams {
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
export type StartProjectCloneOutput = unknown;

export interface StateCopyParams {
  workspace: string;
  machine: string;
  resource: string;
  version?: string | null;
}
export type StateCopyOutput = unknown;

export interface StateMachinesParams {
  version?: string | null;
}
export type StateMachinesOutput = unknown;

export interface StateManifestParams {
  workspace?: string | null;
}
export type StateManifestOutput = unknown;

export interface StateResourceParams {
  workspace?: string | null;
  resource: string;
  version?: string | null;
}
export type StateResourceOutput = unknown;

export type StatusParams = Record<string, never>;
export type StatusOutput = null;

export type StopLocalModelParams = Record<string, never>;
export type StopLocalModelOutput = null;

export interface StopShellCommandParams {
  session: string;
}
export type StopShellCommandOutput = boolean;

export interface StopTaskProcessesParams {
  session: string;
  workspace?: string | null;
}
export type StopTaskProcessesOutput = unknown;

export interface StopTurnParams {
  project: string;
  session: string;
}
export type StopTurnOutput = null;

export interface SubmitLoginCodeParams {
  id: string;
  code: string;
}
export type SubmitLoginCodeOutput = null;

export const COMMANDS_MISC_10 = {
  source_freshness: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  sources_in_use: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  "space create": { kind: "cli", scope: null, authority: "admin", channel: null },
  "space delete": { kind: "cli", scope: null, authority: "admin", channel: null },
  "space list": { kind: "cli", scope: null, authority: "read", channel: null },
  "space rename": { kind: "cli", scope: null, authority: "admin", channel: null },
  space_delete_preview: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  start_browser_login: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  start_google_drive_login: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  start_local_model: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  start_project_clone: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  state_copy: { kind: "invoke", scope: null, authority: "admin", channel: null },
  state_machines: { kind: "invoke", scope: null, authority: "admin", channel: null },
  state_manifest: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  state_resource: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  status: { kind: "cli", scope: null, authority: "read", channel: null },
  stop_local_model: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  stop_shell_command: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  stop_task_processes: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  stop_turn: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  submit_login_code: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
} as const;
