// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { SaveAgentProfileParams, SaveAgentProfileOutput, SaveQueueParams, SaveQueueOutput, SelectGitHostAreaParams, SelectGitHostAreaOutput, SendMessageParams, SendMessageOutput, SetupRequiredParams, SetupRequiredOutput, ShareSpaceParams, ShareSpaceOutput, SleepSessionParams, SleepSessionOutput, SourceDetailParams, SourceDetailOutput, SourceFreshnessParams, SourceFreshnessOutput, SourcesInUseParams, SourcesInUseOutput, CliSpaceCreateParams, CliSpaceCreateOutput, CliSpaceDeleteParams, CliSpaceDeleteOutput, CliSpaceListParams, CliSpaceListOutput, CliSpaceRenameParams, CliSpaceRenameOutput, SpaceDeletePreviewParams, SpaceDeletePreviewOutput, StartBrowserLoginParams, StartBrowserLoginOutput, StartGoogleDriveLoginParams, StartGoogleDriveLoginOutput, StartLocalModelParams, StartLocalModelOutput, StartProjectCloneParams, StartProjectCloneOutput, StatusParams, StatusOutput, StopLocalModelParams, StopLocalModelOutput } from "../commands/misc-9.ts";

export function bind_misc_9(t: EngineTransport) {
  return {
    save_agent_profile: (params: SaveAgentProfileParams) => t.call("save_agent_profile", params) as Promise<SaveAgentProfileOutput>,
    save_queue: (params: SaveQueueParams) => t.call("save_queue", params) as Promise<SaveQueueOutput>,
    select_git_host_area: (params: SelectGitHostAreaParams) => t.call("select_git_host_area", params) as Promise<SelectGitHostAreaOutput>,
    send_message: (params: SendMessageParams) => t.call("send_message", params) as Promise<SendMessageOutput>,
    setup_required: () => t.call("setup_required", {}) as Promise<SetupRequiredOutput>,
    share_space: (params: ShareSpaceParams) => t.call("share_space", params) as Promise<ShareSpaceOutput>,
    sleep_session: (params: SleepSessionParams) => t.call("sleep_session", params) as Promise<SleepSessionOutput>,
    source_detail: (params: SourceDetailParams) => t.call("source_detail", params) as Promise<SourceDetailOutput>,
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
    status: () => t.call("status", {}) as Promise<StatusOutput>,
    stop_local_model: () => t.call("stop_local_model", {}) as Promise<StopLocalModelOutput>,
  };
}
