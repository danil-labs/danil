// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface SaveAgentProfileParams {
  project: string;
  name: string;
  displayName?: string | null;
  body?: string | null;
  veil: number;
}
export type SaveAgentProfileOutput = unknown;

export interface SaveQueueParams {
  project: string;
  session: string;
  queued: unknown[];
}
export type SaveQueueOutput = null;

export interface SelectGitHostAreaParams {
  id: string;
  area: string;
  enabled: boolean;
  scope?: string | null;
}
export type SelectGitHostAreaOutput = unknown;

export interface SendMessageParams {
  provider: string;
  project: string;
  session?: string | null;
  prompt: string;
  model?: string | null;
  effort?: string | null;
  permissionMode?: string | null;
  attachments?: string[] | null;
  sources?: string[] | null;
  excludedSources?: string[] | null;
  respuestas?: unknown[] | null;
  baseRef?: string | null;
  agent?: string | null;
  taskFromAgent?: boolean | null;
  fromAgent?: string | null;
  fromChannel?: string | null;
  replyTo?: unknown | null;
  hops?: number | null;
  taskMentions?: unknown[] | null;
  recipients?: unknown[] | null;
  fromTask?: unknown | null;
  space?: string | null;
  unwrapSnapshot?: boolean | null;
}
export type SendMessageOutput = string;

export type SetupRequiredParams = Record<string, never>;
export type SetupRequiredOutput = boolean;

export interface ShareSpaceParams {
  id: string;
}
export type ShareSpaceOutput = unknown;

export interface SleepSessionParams {
  project: string;
  session: string;
}
export type SleepSessionOutput = null;

export interface SourceDetailParams {
  id: string;
  mirar: boolean;
}
export type SourceDetailOutput = unknown;

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

export type StatusParams = Record<string, never>;
export type StatusOutput = null;

export type StopLocalModelParams = Record<string, never>;
export type StopLocalModelOutput = null;

export const COMMANDS_MISC_9 = {
  save_agent_profile: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  save_queue: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  select_git_host_area: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  send_message: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  setup_required: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  share_space: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  sleep_session: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  source_detail: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
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
  status: { kind: "cli", scope: null, authority: "read", channel: null },
  stop_local_model: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
} as const;
