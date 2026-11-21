// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface SetActiveAccountParams {
  provider: string;
  id: string;
}
export type SetActiveAccountOutput = null;

export interface SetActiveLocalModelParams {
  id: string;
}
export type SetActiveLocalModelOutput = null;

export interface SetActiveWorkspaceParams {
  id: string;
}
export type SetActiveWorkspaceOutput = null;

export interface SetAgentAvatarParams {
  project: string;
  name: string;
  source?: string | null;
}
export type SetAgentAvatarOutput = unknown;

export interface SetAgentBackgroundParams {
  project: string;
  name: string;
  source?: string | null;
}
export type SetAgentBackgroundOutput = unknown;

export interface SetAgentHiddenParams {
  project: string;
  name: string;
  hidden: boolean;
}
export type SetAgentHiddenOutput = unknown;

export interface SetAgentModelParams {
  project: string;
  name: string;
  provider?: string | null;
  model?: string | null;
  effort?: string | null;
}
export type SetAgentModelOutput = unknown;

export interface SetApiKeyParams {
  provider: string;
  id: string;
  key: string;
}
export type SetApiKeyOutput = null;

export interface SetChatBackgroundParams {
  preset?: string | null;
  path?: string | null;
  dataUrl?: string | null;
  veil?: unknown | null;
}
export type SetChatBackgroundOutput = unknown;

export interface SetEffortParams {
  project: string;
  session: string;
  effort?: string | null;
}
export type SetEffortOutput = null;

export interface SetGoUsageKeyParams {
  provider: string;
  id: string;
  key: string;
}
export type SetGoUsageKeyOutput = null;

export interface SetGoogleDriveDesktopUseParams {
  used: boolean;
}
export type SetGoogleDriveDesktopUseOutput = null;

export interface SetIntegrationEnabledParams {
  id: unknown;
  workspace: string;
  enabled: boolean;
}
export type SetIntegrationEnabledOutput = null;

export interface SetKeepAwakeParams {
  mode: unknown;
}
export type SetKeepAwakeOutput = unknown;

export interface SetMemoryProviderParams {
  id: string;
  block?: string | null;
  readWrite: boolean;
}
export type SetMemoryProviderOutput = unknown;

export interface SetPermissionModeParams {
  project: string;
  session: string;
  mode: string;
}
export type SetPermissionModeOutput = null;

export interface SetProfileParams {
  name: string;
}
export type SetProfileOutput = unknown;

export interface SetProjectBaseBranchParams {
  project: string;
  reference: string;
}
export type SetProjectBaseBranchOutput = null;

export interface SetProjectDirectoryParams {
  directory?: string | null;
}
export type SetProjectDirectoryOutput = string;

export interface SetProjectSetupCommandParams {
  project: string;
  command?: string | null;
}
export type SetProjectSetupCommandOutput = null;

export interface SetProjectWorkTreeParams {
  id: string;
  dir?: string | null;
}
export type SetProjectWorkTreeOutput = unknown;

export const COMMANDS_SET_1 = {
  set_active_account: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  set_active_local_model: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  set_active_workspace: { kind: "invoke", scope: null, authority: "admin", channel: null },
  set_agent_avatar: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  set_agent_background: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  set_agent_hidden: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  set_agent_model: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  set_api_key: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  set_chat_background: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  set_effort: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  set_go_usage_key: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  set_google_drive_desktop_use: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  set_integration_enabled: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  set_keep_awake: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  set_memory_provider: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  set_permission_mode: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  set_profile: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  set_project_base_branch: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  set_project_directory: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  set_project_setup_command: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  set_project_work_tree: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
} as const;
