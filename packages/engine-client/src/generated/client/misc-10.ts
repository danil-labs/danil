// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { SourceFreshnessParams, SourceFreshnessOutput, SourcesInUseParams, SourcesInUseOutput, CliSpaceCreateParams, CliSpaceCreateOutput, CliSpaceDeleteParams, CliSpaceDeleteOutput, CliSpaceListParams, CliSpaceListOutput, CliSpaceRenameParams, CliSpaceRenameOutput, SpaceDeletePreviewParams, SpaceDeletePreviewOutput, StartBrowserLoginParams, StartBrowserLoginOutput, StartGoogleDriveLoginParams, StartGoogleDriveLoginOutput, StartLocalModelParams, StartLocalModelOutput, StartProjectCloneParams, StartProjectCloneOutput, StateCopyParams, StateCopyOutput, StateMachinesParams, StateMachinesOutput, StateManifestParams, StateManifestOutput, StateResourceParams, StateResourceOutput, StatusParams, StatusOutput, StopLocalModelParams, StopLocalModelOutput, StopShellCommandParams, StopShellCommandOutput, StopTaskProcessesParams, StopTaskProcessesOutput, StopTurnParams, StopTurnOutput, SubmitLoginCodeParams, SubmitLoginCodeOutput } from "../commands/misc-10.ts";

export function bind_misc_10(t: EngineTransport) {
  return {
    source_freshness: () => t.call("source_freshness", {}) as Promise<SourceFreshnessOutput>,
    sources_in_use: () => t.call("sources_in_use", {}) as Promise<SourcesInUseOutput>,
    "space create": () => t.call("space create", {}) as Promise<CliSpaceCreateOutput>,
    "space delete": () => t.call("space delete", {}) as Promise<CliSpaceDeleteOutput>,
    "space list": () => t.call("space list", {}) as Promise<CliSpaceListOutput>,
    "space rename": () => t.call("space rename", {}) as Promise<CliSpaceRenameOutput>,
    space_delete_preview: (params: SpaceDeletePreviewParams) => t.call("space_delete_preview", params) as Promise<SpaceDeletePreviewOutput>,
    start_browser_login: (params: StartBrowserLoginParams) => t.call("start_browser_login", params) as Promise<StartBrowserLoginOutput>,
    start_google_drive_login: (params?: StartGoogleDriveLoginParams) => t.call("start_google_drive_login", params) as Promise<StartGoogleDriveLoginOutput>,
    start_local_model: (params: StartLocalModelParams) => t.call("start_local_model", params) as Promise<StartLocalModelOutput>,
    start_project_clone: (params: StartProjectCloneParams) => t.call("start_project_clone", params) as Promise<StartProjectCloneOutput>,
    state_copy: (params: StateCopyParams) => t.call("state_copy", params) as Promise<StateCopyOutput>,
    state_machines: (params?: StateMachinesParams) => t.call("state_machines", params) as Promise<StateMachinesOutput>,
    state_manifest: (params?: StateManifestParams) => t.call("state_manifest", params) as Promise<StateManifestOutput>,
    state_resource: (params: StateResourceParams) => t.call("state_resource", params) as Promise<StateResourceOutput>,
    status: () => t.call("status", {}) as Promise<StatusOutput>,
    stop_local_model: () => t.call("stop_local_model", {}) as Promise<StopLocalModelOutput>,
    stop_shell_command: (params: StopShellCommandParams) => t.call("stop_shell_command", params) as Promise<StopShellCommandOutput>,
    stop_task_processes: (params: StopTaskProcessesParams) => t.call("stop_task_processes", params) as Promise<StopTaskProcessesOutput>,
    stop_turn: (params: StopTurnParams) => t.call("stop_turn", params) as Promise<StopTurnOutput>,
    submit_login_code: (params: SubmitLoginCodeParams) => t.call("submit_login_code", params) as Promise<SubmitLoginCodeOutput>,
  };
}
