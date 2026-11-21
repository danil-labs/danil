// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { ResealAccountCredentialParams, ResealAccountCredentialOutput, ResealAccountWorkspaceParams, ResealAccountWorkspaceOutput, RespondPermissionParams, RespondPermissionOutput, RestoreTaskWorkParams, RestoreTaskWorkOutput, RestoreVersionParams, RestoreVersionOutput, ResumeAwaitingQuotaParams, ResumeAwaitingQuotaOutput, ReuseProjectParams, ReuseProjectOutput, RunParams, RunOutput, RunActivityCommandParams, RunActivityCommandOutput, RunShellCommandParams, RunShellCommandOutput, SaveAgentDeclarationParams, SaveAgentDeclarationOutput, SaveAgentProfileParams, SaveAgentProfileOutput, SaveQueueParams, SaveQueueOutput, CliSecretRunParams, CliSecretRunOutput, SelectGitHostAreaParams, SelectGitHostAreaOutput, SendMessageParams, SendMessageOutput, SetupRequiredParams, SetupRequiredOutput, ShareFolderParams, ShareFolderOutput, ShareSpaceParams, ShareSpaceOutput, SleepSessionParams, SleepSessionOutput, SourceDetailParams, SourceDetailOutput } from "../commands/misc-9.ts";

export function bind_misc_9(t: EngineTransport) {
  return {
    reseal_account_credential: (params: ResealAccountCredentialParams) => t.call("reseal_account_credential", params) as Promise<ResealAccountCredentialOutput>,
    reseal_account_workspace: (params: ResealAccountWorkspaceParams) => t.call("reseal_account_workspace", params) as Promise<ResealAccountWorkspaceOutput>,
    respond_permission: (params: RespondPermissionParams) => t.call("respond_permission", params) as Promise<RespondPermissionOutput>,
    restore_task_work: (params: RestoreTaskWorkParams) => t.call("restore_task_work", params) as Promise<RestoreTaskWorkOutput>,
    restore_version: (params: RestoreVersionParams) => t.call("restore_version", params) as Promise<RestoreVersionOutput>,
    resume_awaiting_quota: (params: ResumeAwaitingQuotaParams) => t.call("resume_awaiting_quota", params) as Promise<ResumeAwaitingQuotaOutput>,
    reuse_project: (params: ReuseProjectParams) => t.call("reuse_project", params) as Promise<ReuseProjectOutput>,
    run: () => t.call("run", {}) as Promise<RunOutput>,
    run_activity_command: (params: RunActivityCommandParams) => t.call("run_activity_command", params) as Promise<RunActivityCommandOutput>,
    run_shell_command: (params: RunShellCommandParams) => t.call("run_shell_command", params) as Promise<RunShellCommandOutput>,
    save_agent_declaration: (params: SaveAgentDeclarationParams) => t.call("save_agent_declaration", params) as Promise<SaveAgentDeclarationOutput>,
    save_agent_profile: (params: SaveAgentProfileParams) => t.call("save_agent_profile", params) as Promise<SaveAgentProfileOutput>,
    save_queue: (params: SaveQueueParams) => t.call("save_queue", params) as Promise<SaveQueueOutput>,
    "secret run": () => t.call("secret run", {}) as Promise<CliSecretRunOutput>,
    select_git_host_area: (params: SelectGitHostAreaParams) => t.call("select_git_host_area", params) as Promise<SelectGitHostAreaOutput>,
    send_message: (params: SendMessageParams) => t.call("send_message", params) as Promise<SendMessageOutput>,
    setup_required: () => t.call("setup_required", {}) as Promise<SetupRequiredOutput>,
    share_folder: (params: ShareFolderParams) => t.call("share_folder", params) as Promise<ShareFolderOutput>,
    share_space: (params: ShareSpaceParams) => t.call("share_space", params) as Promise<ShareSpaceOutput>,
    sleep_session: (params: SleepSessionParams) => t.call("sleep_session", params) as Promise<SleepSessionOutput>,
    source_detail: (params: SourceDetailParams) => t.call("source_detail", params) as Promise<SourceDetailOutput>,
  };
}
