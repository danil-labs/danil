// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { SetActiveAccountParams, SetActiveAccountOutput, SetActiveLocalModelParams, SetActiveLocalModelOutput, SetActiveWorkspaceParams, SetActiveWorkspaceOutput, SetAgentAvatarParams, SetAgentAvatarOutput, SetAgentBackgroundParams, SetAgentBackgroundOutput, SetAgentHiddenParams, SetAgentHiddenOutput, SetAgentModelParams, SetAgentModelOutput, SetApiKeyParams, SetApiKeyOutput, SetChatBackgroundParams, SetChatBackgroundOutput, SetEffortParams, SetEffortOutput, SetFreeRouterGrantParams, SetFreeRouterGrantOutput, SetFreeRouterUnionParams, SetFreeRouterUnionOutput, SetGoUsageKeyParams, SetGoUsageKeyOutput, SetGoogleDriveDesktopUseParams, SetGoogleDriveDesktopUseOutput, SetIntegrationEnabledParams, SetIntegrationEnabledOutput, SetKeepAwakeParams, SetKeepAwakeOutput, SetMemoryProviderParams, SetMemoryProviderOutput, SetPermissionModeParams, SetPermissionModeOutput, SetProfileParams, SetProfileOutput, SetProjectBaseBranchParams, SetProjectBaseBranchOutput, SetProjectDirectoryParams, SetProjectDirectoryOutput } from "../commands/set-1.ts";

export function bind_set_1(t: EngineTransport) {
  return {
    set_active_account: (params: SetActiveAccountParams) => t.call("set_active_account", params) as Promise<SetActiveAccountOutput>,
    set_active_local_model: (params: SetActiveLocalModelParams) => t.call("set_active_local_model", params) as Promise<SetActiveLocalModelOutput>,
    set_active_workspace: (params: SetActiveWorkspaceParams) => t.call("set_active_workspace", params) as Promise<SetActiveWorkspaceOutput>,
    set_agent_avatar: (params: SetAgentAvatarParams) => t.call("set_agent_avatar", params) as Promise<SetAgentAvatarOutput>,
    set_agent_background: (params: SetAgentBackgroundParams) => t.call("set_agent_background", params) as Promise<SetAgentBackgroundOutput>,
    set_agent_hidden: (params: SetAgentHiddenParams) => t.call("set_agent_hidden", params) as Promise<SetAgentHiddenOutput>,
    set_agent_model: (params: SetAgentModelParams) => t.call("set_agent_model", params) as Promise<SetAgentModelOutput>,
    set_api_key: (params: SetApiKeyParams) => t.call("set_api_key", params) as Promise<SetApiKeyOutput>,
    set_chat_background: (params?: SetChatBackgroundParams) => t.call("set_chat_background", params) as Promise<SetChatBackgroundOutput>,
    set_effort: (params: SetEffortParams) => t.call("set_effort", params) as Promise<SetEffortOutput>,
    set_free_router_grant: (params: SetFreeRouterGrantParams) => t.call("set_free_router_grant", params) as Promise<SetFreeRouterGrantOutput>,
    set_free_router_union: (params: SetFreeRouterUnionParams) => t.call("set_free_router_union", params) as Promise<SetFreeRouterUnionOutput>,
    set_go_usage_key: (params: SetGoUsageKeyParams) => t.call("set_go_usage_key", params) as Promise<SetGoUsageKeyOutput>,
    set_google_drive_desktop_use: (params: SetGoogleDriveDesktopUseParams) => t.call("set_google_drive_desktop_use", params) as Promise<SetGoogleDriveDesktopUseOutput>,
    set_integration_enabled: (params: SetIntegrationEnabledParams) => t.call("set_integration_enabled", params) as Promise<SetIntegrationEnabledOutput>,
    set_keep_awake: (params: SetKeepAwakeParams) => t.call("set_keep_awake", params) as Promise<SetKeepAwakeOutput>,
    set_memory_provider: (params: SetMemoryProviderParams) => t.call("set_memory_provider", params) as Promise<SetMemoryProviderOutput>,
    set_permission_mode: (params: SetPermissionModeParams) => t.call("set_permission_mode", params) as Promise<SetPermissionModeOutput>,
    set_profile: (params: SetProfileParams) => t.call("set_profile", params) as Promise<SetProfileOutput>,
    set_project_base_branch: (params: SetProjectBaseBranchParams) => t.call("set_project_base_branch", params) as Promise<SetProjectBaseBranchOutput>,
    set_project_directory: (params?: SetProjectDirectoryParams) => t.call("set_project_directory", params) as Promise<SetProjectDirectoryOutput>,
  };
}
