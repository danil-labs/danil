// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface ResealAccountCredentialParams {
  workspace: string;
  credential: string;
  version: number;
  targets: unknown[];
}
export type ResealAccountCredentialOutput = unknown[];

export interface ResealAccountWorkspaceParams {
  id: string;
  from: unknown;
  to: unknown;
}
export type ResealAccountWorkspaceOutput = unknown;

export interface RespondPermissionParams {
  session: string;
  requestId: string;
  allow: boolean;
  revision?: number | null;
}
export type RespondPermissionOutput = unknown;

export interface RestoreTaskWorkParams {
  project: string;
  id: string;
  destination: string;
}
export type RestoreTaskWorkOutput = null;

export interface RestoreVersionParams {
  referencia: unknown;
}
export type RestoreVersionOutput = unknown;

export interface ResumeAwaitingQuotaParams {
  provider: string;
}
export type ResumeAwaitingQuotaOutput = number;

export interface ReuseProjectParams {
  workspace: string;
  project: string;
  space?: string | null;
}
export type ReuseProjectOutput = unknown;

export type RunParams = Record<string, never>;
export type RunOutput = null;

export interface RunActivityCommandParams {
  project: string;
  title: string;
  activity?: string | null;
  command: string;
}
export type RunActivityCommandOutput = unknown;

export interface RunShellCommandParams {
  project: string;
  session?: string | null;
  command: string;
  queueId?: string | null;
  provider?: string | null;
  model?: string | null;
  effort?: string | null;
  permissionMode?: string | null;
  space?: string | null;
  agent?: string | null;
  baseRef?: string | null;
  runId?: string | null;
  unwrapSnapshot?: boolean | null;
}
export type RunShellCommandOutput = unknown;

export interface SaveAgentDeclarationParams {
  project: string;
  name: string;
  description: string;
  instructions: string;
}
export type SaveAgentDeclarationOutput = unknown;

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

export type CliSecretRunParams = Record<string, never>;
export type CliSecretRunOutput = null;

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

export interface ShareFolderParams {
  id: string;
}
export type ShareFolderOutput = unknown;

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

export const COMMANDS_MISC_9 = {
  reseal_account_credential: { kind: "invoke", scope: null, authority: "admin", channel: null },
  reseal_account_workspace: { kind: "invoke", scope: null, authority: "admin", channel: null },
  respond_permission: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  restore_task_work: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  restore_version: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  resume_awaiting_quota: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  reuse_project: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  run: { kind: "cli", scope: null, authority: "task", channel: null },
  run_activity_command: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  run_shell_command: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  save_agent_declaration: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  save_agent_profile: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  save_queue: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  "secret run": { kind: "cli", scope: null, authority: "task", channel: null },
  select_git_host_area: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  send_message: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  setup_required: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  share_folder: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  share_space: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  sleep_session: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  source_detail: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
} as const;
