// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
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

export interface SetProviderConsentParams {
  provider: string;
  accepted: boolean;
}
export type SetProviderConsentOutput = unknown;

export interface SetRootParams {
  source: string;
}
export type SetRootOutput = null;

export interface SetSessionModelParams {
  project: string;
  id: string;
  model?: string | null;
  effort?: string | null;
}
export type SetSessionModelOutput = null;

export interface SetSessionPinnedParams {
  project: string;
  id: string;
  pinned: boolean;
}
export type SetSessionPinnedOutput = null;

export interface SetSessionProviderParams {
  project: string;
  session: string;
  provider: string;
}
export type SetSessionProviderOutput = null;

export interface SetSessionStageParams {
  project: string;
  id: string;
  stage?: unknown | null;
}
export type SetSessionStageOutput = null;

export interface SetSkillSourceEnabledParams {
  id: string;
  enabled: boolean;
}
export type SetSkillSourceEnabledOutput = null;

export interface SetSourceBranchParams {
  project: string;
  source: string;
  branch: string;
}
export type SetSourceBranchOutput = unknown;

export interface SetSourceSkillParams {
  source: string;
  skill: string;
  on: boolean;
}
export type SetSourceSkillOutput = null;

export interface SetSpaceFoldersParams {
  id: string;
  folders: string[];
}
export type SetSpaceFoldersOutput = unknown;

export interface SetTaskArchivedParams {
  project: string;
  id: string;
  archived: boolean;
  space?: string | null;
}
export type SetTaskArchivedOutput = unknown | null;

export interface SetWorkspaceHostGithubParams {
  id: string;
  enabled: boolean;
}
export type SetWorkspaceHostGithubOutput = unknown;

export interface SetWorkspaceLanguageParams {
  id: string;
  lengua?: string | null;
}
export type SetWorkspaceLanguageOutput = unknown;

export interface SetWorkspaceLogoParams {
  id: string;
  source?: string | null;
}
export type SetWorkspaceLogoOutput = unknown;

export interface SetWorkspaceLogoPngParams {
  id: string;
  pngBase64: string;
}
export type SetWorkspaceLogoPngOutput = unknown;

export interface SetWorkspaceOutputLanguageParams {
  id: string;
  lengua?: string | null;
}
export type SetWorkspaceOutputLanguageOutput = unknown;

export interface SetWorkspacePermissionModeParams {
  id: string;
  mode?: string | null;
}
export type SetWorkspacePermissionModeOutput = unknown;

export interface SetWorkspaceSourceParams {
  kind: string;
  locator: string;
}
export type SetWorkspaceSourceOutput = unknown;

export interface SetWorkspaceTerminalThemeParams {
  id: string;
  theme?: string | null;
}
export type SetWorkspaceTerminalThemeOutput = unknown;

export const COMMANDS_SET_2 = {
  set_project_setup_command: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  set_project_work_tree: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  set_provider_consent: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  set_root: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  set_session_model: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  set_session_pinned: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  set_session_provider: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  set_session_stage: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  set_skill_source_enabled: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  set_source_branch: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  set_source_skill: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  set_space_folders: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  set_task_archived: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  set_workspace_host_github: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  set_workspace_language: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  set_workspace_logo: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  set_workspace_logo_png: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  set_workspace_output_language: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  set_workspace_permission_mode: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  set_workspace_source: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  set_workspace_terminal_theme: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
} as const;
