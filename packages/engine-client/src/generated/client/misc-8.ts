// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { QueueReadyParams, QueueReadyOutput, ReclaimStorageParams, ReclaimStorageOutput, RecordExportParams, RecordExportOutput, RecreateTaskWorkParams, RecreateTaskWorkOutput, ReintentarReanudacionPorEntregasParams, ReintentarReanudacionPorEntregasOutput, RenameProjectParams, RenameProjectOutput, RenameSessionParams, RenameSessionOutput, RenameSpaceParams, RenameSpaceOutput, RenameWorkspaceParams, RenameWorkspaceOutput, RepoBranchesParams, RepoBranchesOutput, RequestCloseParams, RequestCloseOutput, ResealAccountCredentialParams, ResealAccountCredentialOutput, RespondPermissionParams, RespondPermissionOutput, RestoreTaskWorkParams, RestoreTaskWorkOutput, RestoreVersionParams, RestoreVersionOutput, ResumeAwaitingQuotaParams, ResumeAwaitingQuotaOutput, ReuseProjectParams, ReuseProjectOutput, RunParams, RunOutput, RunActivityCommandParams, RunActivityCommandOutput, RunShellCommandParams, RunShellCommandOutput, SaveAgentDeclarationParams, SaveAgentDeclarationOutput } from "../commands/misc-8.ts";

export function bind_misc_8(t: EngineTransport) {
  return {
    queue_ready: (params: QueueReadyParams) => t.call("queue_ready", params) as Promise<QueueReadyOutput>,
    reclaim_storage: (params: ReclaimStorageParams) => t.call("reclaim_storage", params) as Promise<ReclaimStorageOutput>,
    record_export: (params: RecordExportParams) => t.call("record_export", params) as Promise<RecordExportOutput>,
    recreate_task_work: (params: RecreateTaskWorkParams) => t.call("recreate_task_work", params) as Promise<RecreateTaskWorkOutput>,
    reintentar_reanudacion_por_entregas: (params: ReintentarReanudacionPorEntregasParams) => t.call("reintentar_reanudacion_por_entregas", params) as Promise<ReintentarReanudacionPorEntregasOutput>,
    rename_project: (params: RenameProjectParams) => t.call("rename_project", params) as Promise<RenameProjectOutput>,
    rename_session: (params: RenameSessionParams) => t.call("rename_session", params) as Promise<RenameSessionOutput>,
    rename_space: (params: RenameSpaceParams) => t.call("rename_space", params) as Promise<RenameSpaceOutput>,
    rename_workspace: (params: RenameWorkspaceParams) => t.call("rename_workspace", params) as Promise<RenameWorkspaceOutput>,
    repo_branches: (params: RepoBranchesParams) => t.call("repo_branches", params) as Promise<RepoBranchesOutput>,
    request_close: () => t.call("request_close", {}) as Promise<RequestCloseOutput>,
    reseal_account_credential: (params: ResealAccountCredentialParams) => t.call("reseal_account_credential", params) as Promise<ResealAccountCredentialOutput>,
    respond_permission: (params: RespondPermissionParams) => t.call("respond_permission", params) as Promise<RespondPermissionOutput>,
    restore_task_work: (params: RestoreTaskWorkParams) => t.call("restore_task_work", params) as Promise<RestoreTaskWorkOutput>,
    restore_version: (params: RestoreVersionParams) => t.call("restore_version", params) as Promise<RestoreVersionOutput>,
    resume_awaiting_quota: (params: ResumeAwaitingQuotaParams) => t.call("resume_awaiting_quota", params) as Promise<ResumeAwaitingQuotaOutput>,
    reuse_project: (params: ReuseProjectParams) => t.call("reuse_project", params) as Promise<ReuseProjectOutput>,
    run: () => t.call("run", {}) as Promise<RunOutput>,
    run_activity_command: (params: RunActivityCommandParams) => t.call("run_activity_command", params) as Promise<RunActivityCommandOutput>,
    run_shell_command: (params: RunShellCommandParams) => t.call("run_shell_command", params) as Promise<RunShellCommandOutput>,
    save_agent_declaration: (params: SaveAgentDeclarationParams) => t.call("save_agent_declaration", params) as Promise<SaveAgentDeclarationOutput>,
  };
}
