// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { DiscardTaskChangesParams, DiscardTaskChangesOutput, DisconnectGitHostParams, DisconnectGitHostOutput, DisconnectGoogleDriveParams, DisconnectGoogleDriveOutput, DisconnectKnownMcpParams, DisconnectKnownMcpOutput, DownloadArtifactParams, DownloadArtifactOutput, EmptyBuildCacheParams, EmptyBuildCacheOutput, CliEngineStartParams, CliEngineStartOutput, CliEngineStatusParams, CliEngineStatusOutput, CliEngineStopParams, CliEngineStopOutput, EnsureProjectParams, EnsureProjectOutput, CliEventsSubscribeParams, CliEventsSubscribeOutput, CliEventsUnsubscribeParams, CliEventsUnsubscribeOutput, CliExecutorReleaseActivateParams, CliExecutorReleaseActivateOutput, CliExecutorReleaseRollbackParams, CliExecutorReleaseRollbackOutput, CliExecutorReleaseStageParams, CliExecutorReleaseStageOutput, CliExecutorReleaseStatusParams, CliExecutorReleaseStatusOutput, ExportChatParams, ExportChatOutput, FileSizeParams, FileSizeOutput, FinishBrowserLoginParams, FinishBrowserLoginOutput, FinishGitHostSetupParams, FinishGitHostSetupOutput, FinishGoogleDriveLoginParams, FinishGoogleDriveLoginOutput } from "../commands/misc-4.ts";

export function bind_misc_4(t: EngineTransport) {
  return {
    discard_task_changes: (params: DiscardTaskChangesParams) => t.call("discard_task_changes", params) as Promise<DiscardTaskChangesOutput>,
    disconnect_git_host: (params: DisconnectGitHostParams) => t.call("disconnect_git_host", params) as Promise<DisconnectGitHostOutput>,
    disconnect_google_drive: (params?: DisconnectGoogleDriveParams) => t.call("disconnect_google_drive", params) as Promise<DisconnectGoogleDriveOutput>,
    disconnect_known_mcp: (params: DisconnectKnownMcpParams) => t.call("disconnect_known_mcp", params) as Promise<DisconnectKnownMcpOutput>,
    download_artifact: (params: DownloadArtifactParams) => t.call("download_artifact", params) as Promise<DownloadArtifactOutput>,
    empty_build_cache: () => t.call("empty_build_cache", {}) as Promise<EmptyBuildCacheOutput>,
    "engine start": () => t.call("engine start", {}) as Promise<CliEngineStartOutput>,
    "engine status": () => t.call("engine status", {}) as Promise<CliEngineStatusOutput>,
    "engine stop": () => t.call("engine stop", {}) as Promise<CliEngineStopOutput>,
    ensure_project: (params: EnsureProjectParams) => t.call("ensure_project", params) as Promise<EnsureProjectOutput>,
    "events subscribe": () => t.call("events subscribe", {}) as Promise<CliEventsSubscribeOutput>,
    "events unsubscribe": () => t.call("events unsubscribe", {}) as Promise<CliEventsUnsubscribeOutput>,
    "executor release activate": () => t.call("executor release activate", {}) as Promise<CliExecutorReleaseActivateOutput>,
    "executor release rollback": () => t.call("executor release rollback", {}) as Promise<CliExecutorReleaseRollbackOutput>,
    "executor release stage": () => t.call("executor release stage", {}) as Promise<CliExecutorReleaseStageOutput>,
    "executor release status": () => t.call("executor release status", {}) as Promise<CliExecutorReleaseStatusOutput>,
    export_chat: (params: ExportChatParams) => t.call("export_chat", params) as Promise<ExportChatOutput>,
    file_size: (params: FileSizeParams) => t.call("file_size", params) as Promise<FileSizeOutput>,
    finish_browser_login: (params: FinishBrowserLoginParams) => t.call("finish_browser_login", params) as Promise<FinishBrowserLoginOutput>,
    finish_git_host_setup: (params: FinishGitHostSetupParams) => t.call("finish_git_host_setup", params) as Promise<FinishGitHostSetupOutput>,
    finish_google_drive_login: (params?: FinishGoogleDriveLoginParams) => t.call("finish_google_drive_login", params) as Promise<FinishGoogleDriveLoginOutput>,
  };
}
