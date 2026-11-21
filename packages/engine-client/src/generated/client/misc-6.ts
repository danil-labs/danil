// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { HasMcpAppParams, HasMcpAppOutput, ImportChatBackgroundParams, ImportChatBackgroundOutput, ImportChatBackgroundDataParams, ImportChatBackgroundDataOutput, CliInboxListParams, CliInboxListOutput, CliInboxTakeParams, CliInboxTakeOutput, InjectMessageParams, InjectMessageOutput, InstancesParams, InstancesOutput, KeepAwakeStatusParams, KeepAwakeStatusOutput, CliKeepAwakeSetParams, CliKeepAwakeSetOutput, CliKeepAwakeStatusParams, CliKeepAwakeStatusOutput, LoadQueueParams, LoadQueueOutput, LoadSessionParams, LoadSessionOutput, LocalDownloadsParams, LocalDownloadsOutput, LocalOrchestratorConnectParams, LocalOrchestratorConnectOutput, LocalOrchestratorDisconnectParams, LocalOrchestratorDisconnectOutput, LocalRuntimeParams, LocalRuntimeOutput, LoginAccountParams, LoginAccountOutput, MarkTaskSeenParams, MarkTaskSeenOutput, MaterializeWorkspaceParams, MaterializeWorkspaceOutput, MoveSessionParams, MoveSessionOutput, MoveTaskToSpaceParams, MoveTaskToSpaceOutput } from "../commands/misc-6.ts";

export function bind_misc_6(t: EngineTransport) {
  return {
    has_mcp_app: (params: HasMcpAppParams) => t.call("has_mcp_app", params) as Promise<HasMcpAppOutput>,
    import_chat_background: (params: ImportChatBackgroundParams) => t.call("import_chat_background", params) as Promise<ImportChatBackgroundOutput>,
    import_chat_background_data: (params: ImportChatBackgroundDataParams) => t.call("import_chat_background_data", params) as Promise<ImportChatBackgroundDataOutput>,
    "inbox list": () => t.call("inbox list", {}) as Promise<CliInboxListOutput>,
    "inbox take": () => t.call("inbox take", {}) as Promise<CliInboxTakeOutput>,
    inject_message: (params: InjectMessageParams) => t.call("inject_message", params) as Promise<InjectMessageOutput>,
    instances: () => t.call("instances", {}) as Promise<InstancesOutput>,
    keep_awake_status: () => t.call("keep_awake_status", {}) as Promise<KeepAwakeStatusOutput>,
    "keep-awake set": () => t.call("keep-awake set", {}) as Promise<CliKeepAwakeSetOutput>,
    "keep-awake status": () => t.call("keep-awake status", {}) as Promise<CliKeepAwakeStatusOutput>,
    load_queue: (params: LoadQueueParams) => t.call("load_queue", params) as Promise<LoadQueueOutput>,
    load_session: (params: LoadSessionParams) => t.call("load_session", params) as Promise<LoadSessionOutput>,
    local_downloads: () => t.call("local_downloads", {}) as Promise<LocalDownloadsOutput>,
    local_orchestrator_connect: (params: LocalOrchestratorConnectParams) => t.call("local_orchestrator_connect", params) as Promise<LocalOrchestratorConnectOutput>,
    local_orchestrator_disconnect: (params: LocalOrchestratorDisconnectParams) => t.call("local_orchestrator_disconnect", params) as Promise<LocalOrchestratorDisconnectOutput>,
    local_runtime: () => t.call("local_runtime", {}) as Promise<LocalRuntimeOutput>,
    login_account: (params: LoginAccountParams) => t.call("login_account", params) as Promise<LoginAccountOutput>,
    mark_task_seen: (params: MarkTaskSeenParams) => t.call("mark_task_seen", params) as Promise<MarkTaskSeenOutput>,
    materialize_workspace: (params: MaterializeWorkspaceParams) => t.call("materialize_workspace", params) as Promise<MaterializeWorkspaceOutput>,
    move_session: (params: MoveSessionParams) => t.call("move_session", params) as Promise<MoveSessionOutput>,
    move_task_to_space: (params: MoveTaskToSpaceParams) => t.call("move_task_to_space", params) as Promise<MoveTaskToSpaceOutput>,
  };
}
