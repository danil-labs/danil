// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface HasMcpAppParams {
  server: string;
  tool: string;
}
export type HasMcpAppOutput = boolean;

export interface ImportChatBackgroundParams {
  source: string;
}
export type ImportChatBackgroundOutput = string;

export interface ImportChatBackgroundDataParams {
  dataUrl: string;
}
export type ImportChatBackgroundDataOutput = string;

export type CliInboxListParams = Record<string, never>;
export type CliInboxListOutput = null;

export type CliInboxTakeParams = Record<string, never>;
export type CliInboxTakeOutput = null;

export interface InjectMessageParams {
  project: string;
  session: string;
  prompt: string;
  queueId?: string | null;
  attachments?: string[] | null;
  taskMentions?: unknown[] | null;
  recipients?: unknown[] | null;
}
export type InjectMessageOutput = null;

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

export interface LocalOrchestratorConnectParams {
  workspace: string;
  folder?: string | null;
  label: string;
  permissionMode?: string | null;
}
export type LocalOrchestratorConnectOutput = unknown;

export interface LocalOrchestratorDisconnectParams {
  workspace: string;
  id: string;
}
export type LocalOrchestratorDisconnectOutput = unknown;

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

export const COMMANDS_MISC_6 = {
  has_mcp_app: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  import_chat_background: { kind: "invoke", scope: null, authority: "admin", channel: null },
  import_chat_background_data: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  "inbox list": { kind: "cli", scope: null, authority: "read", channel: null },
  "inbox take": { kind: "cli", scope: null, authority: "task", channel: null },
  inject_message: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  instances: { kind: "cli", scope: null, authority: "admin", channel: null },
  keep_awake_status: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  "keep-awake set": { kind: "cli", scope: null, authority: "admin", channel: null },
  "keep-awake status": { kind: "cli", scope: null, authority: "read", channel: null },
  load_queue: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  load_session: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  local_downloads: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  local_orchestrator_connect: { kind: "invoke", scope: null, authority: "admin", channel: null },
  local_orchestrator_disconnect: { kind: "invoke", scope: null, authority: "admin", channel: null },
  local_runtime: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  login_account: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  mark_task_seen: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  materialize_workspace: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  move_session: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  move_task_to_space: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
} as const;
