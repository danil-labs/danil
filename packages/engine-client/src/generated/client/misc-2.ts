// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { ChatParams, ChatOutput, ChatBackgroundParams, ChatBackgroundOutput, ChatVisualPartParams, ChatVisualPartOutput, CheckEnvironmentParams, CheckEnvironmentOutput, CheckGitHostParams, CheckGitHostOutput, CheckGoogleDriveParams, CheckGoogleDriveOutput, CheckIntegrationParams, CheckIntegrationOutput, CheckMcpParams, CheckMcpOutput, ChooseChatBackgroundParams, ChooseChatBackgroundOutput, CliTaskOpenedParams, CliTaskOpenedOutput, CliClientGrantParams, CliClientGrantOutput, CliClientListParams, CliClientListOutput, CliClientRevokeParams, CliClientRevokeOutput, CliClientRotateParams, CliClientRotateOutput, CliClientShowParams, CliClientShowOutput, CloneProjectParams, CloneProjectOutput, CloseMcpAppParams, CloseMcpAppOutput, ClosePortParams, ClosePortOutput, CloseProcessParams, CloseProcessOutput, CollectOrphansParams, CollectOrphansOutput, CliConfigGetParams, CliConfigGetOutput } from "../commands/misc-2.ts";

export function bind_misc_2(t: EngineTransport) {
  return {
    chat: () => t.call("chat", {}) as Promise<ChatOutput>,
    chat_background: () => t.call("chat_background", {}) as Promise<ChatBackgroundOutput>,
    chat_visual_part: (params: ChatVisualPartParams) => t.call("chat_visual_part", params) as Promise<ChatVisualPartOutput>,
    check_environment: (params?: CheckEnvironmentParams) => t.call("check_environment", params) as Promise<CheckEnvironmentOutput>,
    check_git_host: (params: CheckGitHostParams) => t.call("check_git_host", params) as Promise<CheckGitHostOutput>,
    check_google_drive: (params?: CheckGoogleDriveParams) => t.call("check_google_drive", params) as Promise<CheckGoogleDriveOutput>,
    check_integration: (params: CheckIntegrationParams) => t.call("check_integration", params) as Promise<CheckIntegrationOutput>,
    check_mcp: () => t.call("check_mcp", {}) as Promise<CheckMcpOutput>,
    choose_chat_background: (params?: ChooseChatBackgroundParams) => t.call("choose_chat_background", params) as Promise<ChooseChatBackgroundOutput>,
    cli_task_opened: (params: CliTaskOpenedParams) => t.call("cli_task_opened", params) as Promise<CliTaskOpenedOutput>,
    "client grant": () => t.call("client grant", {}) as Promise<CliClientGrantOutput>,
    "client list": () => t.call("client list", {}) as Promise<CliClientListOutput>,
    "client revoke": () => t.call("client revoke", {}) as Promise<CliClientRevokeOutput>,
    "client rotate": () => t.call("client rotate", {}) as Promise<CliClientRotateOutput>,
    "client show": () => t.call("client show", {}) as Promise<CliClientShowOutput>,
    clone_project: (params: CloneProjectParams) => t.call("clone_project", params) as Promise<CloneProjectOutput>,
    close_mcp_app: (params: CloseMcpAppParams) => t.call("close_mcp_app", params) as Promise<CloseMcpAppOutput>,
    close_port: (params: ClosePortParams) => t.call("close_port", params) as Promise<ClosePortOutput>,
    close_process: (params: CloseProcessParams) => t.call("close_process", params) as Promise<CloseProcessOutput>,
    collect_orphans: () => t.call("collect_orphans", {}) as Promise<CollectOrphansOutput>,
    "config get": () => t.call("config get", {}) as Promise<CliConfigGetOutput>,
  };
}
