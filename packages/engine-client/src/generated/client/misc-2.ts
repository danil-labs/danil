// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { AttachmentPreviewParams, AttachmentPreviewOutput, BackupTaskWorkParams, BackupTaskWorkOutput, CallMcpAppToolParams, CallMcpAppToolOutput, ChangeAgentFoldersParams, ChangeAgentFoldersOutput, ChatParams, ChatOutput, ChatBackgroundParams, ChatBackgroundOutput, ChatVisualPartParams, ChatVisualPartOutput, CheckEnvironmentParams, CheckEnvironmentOutput, CheckGitHostParams, CheckGitHostOutput, CheckGoogleDriveParams, CheckGoogleDriveOutput, CheckIntegrationParams, CheckIntegrationOutput, CheckMcpParams, CheckMcpOutput, ChooseChatBackgroundParams, ChooseChatBackgroundOutput, ClearFreeRouterGrantParams, ClearFreeRouterGrantOutput, CliTaskOpenedParams, CliTaskOpenedOutput, CliClientGrantParams, CliClientGrantOutput, CliClientListParams, CliClientListOutput, CliClientRevokeParams, CliClientRevokeOutput, CliClientRotateParams, CliClientRotateOutput, CliClientShowParams, CliClientShowOutput, CloneProjectParams, CloneProjectOutput } from "../commands/misc-2.ts";

export function bind_misc_2(t: EngineTransport) {
  return {
    attachment_preview: (params: AttachmentPreviewParams) => t.call("attachment_preview", params) as Promise<AttachmentPreviewOutput>,
    backup_task_work: (params: BackupTaskWorkParams) => t.call("backup_task_work", params) as Promise<BackupTaskWorkOutput>,
    call_mcp_app_tool: (params: CallMcpAppToolParams) => t.call("call_mcp_app_tool", params) as Promise<CallMcpAppToolOutput>,
    change_agent_folders: (params: ChangeAgentFoldersParams) => t.call("change_agent_folders", params) as Promise<ChangeAgentFoldersOutput>,
    chat: () => t.call("chat", {}) as Promise<ChatOutput>,
    chat_background: () => t.call("chat_background", {}) as Promise<ChatBackgroundOutput>,
    chat_visual_part: (params: ChatVisualPartParams) => t.call("chat_visual_part", params) as Promise<ChatVisualPartOutput>,
    check_environment: (params?: CheckEnvironmentParams) => t.call("check_environment", params) as Promise<CheckEnvironmentOutput>,
    check_git_host: (params: CheckGitHostParams) => t.call("check_git_host", params) as Promise<CheckGitHostOutput>,
    check_google_drive: (params?: CheckGoogleDriveParams) => t.call("check_google_drive", params) as Promise<CheckGoogleDriveOutput>,
    check_integration: (params: CheckIntegrationParams) => t.call("check_integration", params) as Promise<CheckIntegrationOutput>,
    check_mcp: () => t.call("check_mcp", {}) as Promise<CheckMcpOutput>,
    choose_chat_background: (params?: ChooseChatBackgroundParams) => t.call("choose_chat_background", params) as Promise<ChooseChatBackgroundOutput>,
    clear_free_router_grant: (params: ClearFreeRouterGrantParams) => t.call("clear_free_router_grant", params) as Promise<ClearFreeRouterGrantOutput>,
    cli_task_opened: (params: CliTaskOpenedParams) => t.call("cli_task_opened", params) as Promise<CliTaskOpenedOutput>,
    "client grant": () => t.call("client grant", {}) as Promise<CliClientGrantOutput>,
    "client list": () => t.call("client list", {}) as Promise<CliClientListOutput>,
    "client revoke": () => t.call("client revoke", {}) as Promise<CliClientRevokeOutput>,
    "client rotate": () => t.call("client rotate", {}) as Promise<CliClientRotateOutput>,
    "client show": () => t.call("client show", {}) as Promise<CliClientShowOutput>,
    clone_project: (params: CloneProjectParams) => t.call("clone_project", params) as Promise<CloneProjectOutput>,
  };
}
