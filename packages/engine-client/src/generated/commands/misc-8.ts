// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface QueueReadyParams {
  project: string;
  session: string;
}
export type QueueReadyOutput = boolean;

export interface ReclaimStorageParams {
  project: string;
  session: string;
  rutas: string[];
}
export type ReclaimStorageOutput = unknown;

export interface RecordExportParams {
  referencia: unknown;
  via: string;
  destino: string;
  bytes: number;
}
export type RecordExportOutput = null;

export interface RecreateTaskWorkParams {
  project: string;
  id: string;
}
export type RecreateTaskWorkOutput = null;

export interface ReintentarReanudacionPorEntregasParams {
  project: string;
  session: string;
}
export type ReintentarReanudacionPorEntregasOutput = string;

export interface RenameProjectParams {
  id: string;
  name: string;
}
export type RenameProjectOutput = unknown;

export interface RenameSessionParams {
  project: string;
  id: string;
  title: string;
}
export type RenameSessionOutput = null;

export interface RenameSpaceParams {
  id: string;
  name: string;
}
export type RenameSpaceOutput = unknown;

export interface RenameWorkspaceParams {
  id: string;
  name: string;
}
export type RenameWorkspaceOutput = unknown;

export interface RepoBranchesParams {
  cloneUrl: string;
  gitHost?: string | null;
  defaultBranch?: string | null;
}
export type RepoBranchesOutput = unknown;

export type RequestCloseParams = Record<string, never>;
export type RequestCloseOutput = null;

export interface ResealAccountCredentialParams {
  workspace: string;
  credential: string;
  version: number;
  targets: unknown[];
}
export type ResealAccountCredentialOutput = unknown[];

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

export const COMMANDS_MISC_8 = {
  queue_ready: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  reclaim_storage: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  record_export: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  recreate_task_work: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  reintentar_reanudacion_por_entregas: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  rename_project: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  rename_session: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  rename_space: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  rename_workspace: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  repo_branches: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  request_close: { kind: "desktop", scope: null, authority: "admin", channel: null },
  reseal_account_credential: { kind: "invoke", scope: null, authority: "admin", channel: null },
  respond_permission: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  restore_task_work: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  restore_version: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  resume_awaiting_quota: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  reuse_project: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  run: { kind: "cli", scope: null, authority: "task", channel: null },
  run_activity_command: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  run_shell_command: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  save_agent_declaration: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
} as const;
