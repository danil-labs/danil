// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { DetachSessionSourceParams, DetachSessionSourceOutput, DetachSourceParams, DetachSourceOutput, DiscardAccountParams, DiscardAccountOutput, DiscardTaskChangesParams, DiscardTaskChangesOutput, DisconnectExternalParams, DisconnectExternalOutput, DisconnectGitHostParams, DisconnectGitHostOutput, DisconnectGoogleDriveParams, DisconnectGoogleDriveOutput, DisconnectKnownMcpParams, DisconnectKnownMcpOutput, DownloadArtifactParams, DownloadArtifactOutput, EmptyBuildCacheParams, EmptyBuildCacheOutput, EnsureProjectParams, EnsureProjectOutput, EnvSecretRemoveParams, EnvSecretRemoveOutput, EnvSecretSetParams, EnvSecretSetOutput, EnvSecretsListParams, EnvSecretsListOutput, CliEventsSubscribeParams, CliEventsSubscribeOutput, CliEventsUnsubscribeParams, CliEventsUnsubscribeOutput, CliExecutorReleaseActivateParams, CliExecutorReleaseActivateOutput, CliExecutorReleaseRollbackParams, CliExecutorReleaseRollbackOutput, CliExecutorReleaseStageParams, CliExecutorReleaseStageOutput, CliExecutorReleaseStatusParams, CliExecutorReleaseStatusOutput, ExportChatParams, ExportChatOutput } from "../commands/misc-4.ts";

export function bind_misc_4(t: EngineTransport) {
  return {
    detach_session_source: (params: DetachSessionSourceParams) => t.call("detach_session_source", params) as Promise<DetachSessionSourceOutput>,
    detach_source: (params: DetachSourceParams) => t.call("detach_source", params) as Promise<DetachSourceOutput>,
    discard_account: (params: DiscardAccountParams) => t.call("discard_account", params) as Promise<DiscardAccountOutput>,
    discard_task_changes: (params: DiscardTaskChangesParams) => t.call("discard_task_changes", params) as Promise<DiscardTaskChangesOutput>,
    disconnect_external: (params: DisconnectExternalParams) => t.call("disconnect_external", params) as Promise<DisconnectExternalOutput>,
    disconnect_git_host: (params: DisconnectGitHostParams) => t.call("disconnect_git_host", params) as Promise<DisconnectGitHostOutput>,
    disconnect_google_drive: (params?: DisconnectGoogleDriveParams) => t.call("disconnect_google_drive", params) as Promise<DisconnectGoogleDriveOutput>,
    disconnect_known_mcp: (params: DisconnectKnownMcpParams) => t.call("disconnect_known_mcp", params) as Promise<DisconnectKnownMcpOutput>,
    download_artifact: (params: DownloadArtifactParams) => t.call("download_artifact", params) as Promise<DownloadArtifactOutput>,
    empty_build_cache: () => t.call("empty_build_cache", {}) as Promise<EmptyBuildCacheOutput>,
    ensure_project: (params: EnsureProjectParams) => t.call("ensure_project", params) as Promise<EnsureProjectOutput>,
    env_secret_remove: (params: EnvSecretRemoveParams) => t.call("env_secret_remove", params) as Promise<EnvSecretRemoveOutput>,
    env_secret_set: (params: EnvSecretSetParams) => t.call("env_secret_set", params) as Promise<EnvSecretSetOutput>,
    env_secrets_list: () => t.call("env_secrets_list", {}) as Promise<EnvSecretsListOutput>,
    "events subscribe": () => t.call("events subscribe", {}) as Promise<CliEventsSubscribeOutput>,
    "events unsubscribe": () => t.call("events unsubscribe", {}) as Promise<CliEventsUnsubscribeOutput>,
    "executor release activate": () => t.call("executor release activate", {}) as Promise<CliExecutorReleaseActivateOutput>,
    "executor release rollback": () => t.call("executor release rollback", {}) as Promise<CliExecutorReleaseRollbackOutput>,
    "executor release stage": () => t.call("executor release stage", {}) as Promise<CliExecutorReleaseStageOutput>,
    "executor release status": () => t.call("executor release status", {}) as Promise<CliExecutorReleaseStatusOutput>,
    export_chat: (params: ExportChatParams) => t.call("export_chat", params) as Promise<ExportChatOutput>,
  };
}
