// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { SetProviderConsentParams, SetProviderConsentOutput, SetRootParams, SetRootOutput, SetSessionPinnedParams, SetSessionPinnedOutput, SetSessionStageParams, SetSessionStageOutput, SetSkillSourceEnabledParams, SetSkillSourceEnabledOutput, SetSourceBranchParams, SetSourceBranchOutput, SetSourceSkillParams, SetSourceSkillOutput, SetSpaceFoldersParams, SetSpaceFoldersOutput, SetTaskArchivedParams, SetTaskArchivedOutput, SetWorkspaceHostGithubParams, SetWorkspaceHostGithubOutput, SetWorkspaceLanguageParams, SetWorkspaceLanguageOutput, SetWorkspaceLogoParams, SetWorkspaceLogoOutput, SetWorkspaceLogoPngParams, SetWorkspaceLogoPngOutput, SetWorkspaceOutputLanguageParams, SetWorkspaceOutputLanguageOutput, SetWorkspacePermissionModeParams, SetWorkspacePermissionModeOutput, SetWorkspaceSourceParams, SetWorkspaceSourceOutput, SetWorkspaceTerminalThemeParams, SetWorkspaceTerminalThemeOutput, SetWorkspaceWorktreesRootParams, SetWorkspaceWorktreesRootOutput } from "../commands/set-2.ts";

export function bind_set_2(t: EngineTransport) {
  return {
    set_provider_consent: (params: SetProviderConsentParams) => t.call("set_provider_consent", params) as Promise<SetProviderConsentOutput>,
    set_root: (params: SetRootParams) => t.call("set_root", params) as Promise<SetRootOutput>,
    set_session_pinned: (params: SetSessionPinnedParams) => t.call("set_session_pinned", params) as Promise<SetSessionPinnedOutput>,
    set_session_stage: (params: SetSessionStageParams) => t.call("set_session_stage", params) as Promise<SetSessionStageOutput>,
    set_skill_source_enabled: (params: SetSkillSourceEnabledParams) => t.call("set_skill_source_enabled", params) as Promise<SetSkillSourceEnabledOutput>,
    set_source_branch: (params: SetSourceBranchParams) => t.call("set_source_branch", params) as Promise<SetSourceBranchOutput>,
    set_source_skill: (params: SetSourceSkillParams) => t.call("set_source_skill", params) as Promise<SetSourceSkillOutput>,
    set_space_folders: (params: SetSpaceFoldersParams) => t.call("set_space_folders", params) as Promise<SetSpaceFoldersOutput>,
    set_task_archived: (params: SetTaskArchivedParams) => t.call("set_task_archived", params) as Promise<SetTaskArchivedOutput>,
    set_workspace_host_github: (params: SetWorkspaceHostGithubParams) => t.call("set_workspace_host_github", params) as Promise<SetWorkspaceHostGithubOutput>,
    set_workspace_language: (params: SetWorkspaceLanguageParams) => t.call("set_workspace_language", params) as Promise<SetWorkspaceLanguageOutput>,
    set_workspace_logo: (params: SetWorkspaceLogoParams) => t.call("set_workspace_logo", params) as Promise<SetWorkspaceLogoOutput>,
    set_workspace_logo_png: (params: SetWorkspaceLogoPngParams) => t.call("set_workspace_logo_png", params) as Promise<SetWorkspaceLogoPngOutput>,
    set_workspace_output_language: (params: SetWorkspaceOutputLanguageParams) => t.call("set_workspace_output_language", params) as Promise<SetWorkspaceOutputLanguageOutput>,
    set_workspace_permission_mode: (params: SetWorkspacePermissionModeParams) => t.call("set_workspace_permission_mode", params) as Promise<SetWorkspacePermissionModeOutput>,
    set_workspace_source: (params: SetWorkspaceSourceParams) => t.call("set_workspace_source", params) as Promise<SetWorkspaceSourceOutput>,
    set_workspace_terminal_theme: (params: SetWorkspaceTerminalThemeParams) => t.call("set_workspace_terminal_theme", params) as Promise<SetWorkspaceTerminalThemeOutput>,
    set_workspace_worktrees_root: (params: SetWorkspaceWorktreesRootParams) => t.call("set_workspace_worktrees_root", params) as Promise<SetWorkspaceWorktreesRootOutput>,
  };
}
