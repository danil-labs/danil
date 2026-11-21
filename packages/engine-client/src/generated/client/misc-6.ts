// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { InstancesParams, InstancesOutput, KeepAwakeStatusParams, KeepAwakeStatusOutput, CliKeepAwakeSetParams, CliKeepAwakeSetOutput, CliKeepAwakeStatusParams, CliKeepAwakeStatusOutput, LoadQueueParams, LoadQueueOutput, LoadSessionParams, LoadSessionOutput, LocalDownloadsParams, LocalDownloadsOutput, LocalRuntimeParams, LocalRuntimeOutput, LoginAccountParams, LoginAccountOutput, MarkTaskSeenParams, MarkTaskSeenOutput, MaterializeWorkspaceParams, MaterializeWorkspaceOutput, MoveSessionParams, MoveSessionOutput, MoveTaskToSpaceParams, MoveTaskToSpaceOutput, CliNoticeFetchParams, CliNoticeFetchOutput, CliNoticeTakeParams, CliNoticeTakeOutput, NotifyParams, NotifyOutput, ObservabilityConnectParams, ObservabilityConnectOutput, ObservabilityDisconnectParams, ObservabilityDisconnectOutput, OfficePreviewParams, OfficePreviewOutput, OpenExternalParams, OpenExternalOutput, OpenFileExternalParams, OpenFileExternalOutput } from "../commands/misc-6.ts";

export function bind_misc_6(t: EngineTransport) {
  return {
    instances: () => t.call("instances", {}) as Promise<InstancesOutput>,
    keep_awake_status: () => t.call("keep_awake_status", {}) as Promise<KeepAwakeStatusOutput>,
    "keep-awake set": () => t.call("keep-awake set", {}) as Promise<CliKeepAwakeSetOutput>,
    "keep-awake status": () => t.call("keep-awake status", {}) as Promise<CliKeepAwakeStatusOutput>,
    load_queue: (params: LoadQueueParams) => t.call("load_queue", params) as Promise<LoadQueueOutput>,
    load_session: (params: LoadSessionParams) => t.call("load_session", params) as Promise<LoadSessionOutput>,
    local_downloads: () => t.call("local_downloads", {}) as Promise<LocalDownloadsOutput>,
    local_runtime: () => t.call("local_runtime", {}) as Promise<LocalRuntimeOutput>,
    login_account: (params: LoginAccountParams) => t.call("login_account", params) as Promise<LoginAccountOutput>,
    mark_task_seen: (params: MarkTaskSeenParams) => t.call("mark_task_seen", params) as Promise<MarkTaskSeenOutput>,
    materialize_workspace: (params: MaterializeWorkspaceParams) => t.call("materialize_workspace", params) as Promise<MaterializeWorkspaceOutput>,
    move_session: (params: MoveSessionParams) => t.call("move_session", params) as Promise<MoveSessionOutput>,
    move_task_to_space: (params: MoveTaskToSpaceParams) => t.call("move_task_to_space", params) as Promise<MoveTaskToSpaceOutput>,
    "notice fetch": () => t.call("notice fetch", {}) as Promise<CliNoticeFetchOutput>,
    "notice take": () => t.call("notice take", {}) as Promise<CliNoticeTakeOutput>,
    notify: () => t.call("notify", {}) as Promise<NotifyOutput>,
    observability_connect: () => t.call("observability_connect", {}) as Promise<ObservabilityConnectOutput>,
    observability_disconnect: () => t.call("observability_disconnect", {}) as Promise<ObservabilityDisconnectOutput>,
    office_preview: (params: OfficePreviewParams) => t.call("office_preview", params) as Promise<OfficePreviewOutput>,
    open_external: (params: OpenExternalParams) => t.call("open_external", params) as Promise<OpenExternalOutput>,
    open_file_external: (params: OpenFileExternalParams) => t.call("open_file_external", params) as Promise<OpenFileExternalOutput>,
  };
}
