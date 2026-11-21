// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { PreviewTreeFilesParams, PreviewTreeFilesOutput, PreviewTreeFolderParams, PreviewTreeFolderOutput, PreviewTreeShowParams, PreviewTreeShowOutput, ProjectBaseBranchesParams, ProjectBaseBranchesOutput, ProjectCloneStatusParams, ProjectCloneStatusOutput, ProjectSetupCommandParams, ProjectSetupCommandOutput, ProveFreeRouterBindingParams, ProveFreeRouterBindingOutput, ProviderDownloadSizeParams, ProviderDownloadSizeOutput, PublicationsOfParams, PublicationsOfOutput, QueueReadyParams, QueueReadyOutput, ReclaimStorageParams, ReclaimStorageOutput, RecordExportParams, RecordExportOutput, RecreateTaskWorkParams, RecreateTaskWorkOutput, ReintentarReanudacionPorEntregasParams, ReintentarReanudacionPorEntregasOutput, ReleaseFreeRouterOwnerParams, ReleaseFreeRouterOwnerOutput, RenameProjectParams, RenameProjectOutput, RenameSessionParams, RenameSessionOutput, RenameSpaceParams, RenameSpaceOutput, RenameWorkspaceParams, RenameWorkspaceOutput, RepoBranchesParams, RepoBranchesOutput, RequestCloseParams, RequestCloseOutput } from "../commands/misc-8.ts";

export function bind_misc_8(t: EngineTransport) {
  return {
    preview_tree_files: (params: PreviewTreeFilesParams) => t.call("preview_tree_files", params) as Promise<PreviewTreeFilesOutput>,
    preview_tree_folder: (params: PreviewTreeFolderParams) => t.call("preview_tree_folder", params) as Promise<PreviewTreeFolderOutput>,
    preview_tree_show: (params: PreviewTreeShowParams) => t.call("preview_tree_show", params) as Promise<PreviewTreeShowOutput>,
    project_base_branches: (params: ProjectBaseBranchesParams) => t.call("project_base_branches", params) as Promise<ProjectBaseBranchesOutput>,
    project_clone_status: (params: ProjectCloneStatusParams) => t.call("project_clone_status", params) as Promise<ProjectCloneStatusOutput>,
    project_setup_command: (params: ProjectSetupCommandParams) => t.call("project_setup_command", params) as Promise<ProjectSetupCommandOutput>,
    prove_free_router_binding: (params: ProveFreeRouterBindingParams) => t.call("prove_free_router_binding", params) as Promise<ProveFreeRouterBindingOutput>,
    provider_download_size: (params: ProviderDownloadSizeParams) => t.call("provider_download_size", params) as Promise<ProviderDownloadSizeOutput>,
    publications_of: (params: PublicationsOfParams) => t.call("publications_of", params) as Promise<PublicationsOfOutput>,
    queue_ready: (params: QueueReadyParams) => t.call("queue_ready", params) as Promise<QueueReadyOutput>,
    reclaim_storage: (params: ReclaimStorageParams) => t.call("reclaim_storage", params) as Promise<ReclaimStorageOutput>,
    record_export: (params: RecordExportParams) => t.call("record_export", params) as Promise<RecordExportOutput>,
    recreate_task_work: (params: RecreateTaskWorkParams) => t.call("recreate_task_work", params) as Promise<RecreateTaskWorkOutput>,
    reintentar_reanudacion_por_entregas: (params: ReintentarReanudacionPorEntregasParams) => t.call("reintentar_reanudacion_por_entregas", params) as Promise<ReintentarReanudacionPorEntregasOutput>,
    release_free_router_owner: (params: ReleaseFreeRouterOwnerParams) => t.call("release_free_router_owner", params) as Promise<ReleaseFreeRouterOwnerOutput>,
    rename_project: (params: RenameProjectParams) => t.call("rename_project", params) as Promise<RenameProjectOutput>,
    rename_session: (params: RenameSessionParams) => t.call("rename_session", params) as Promise<RenameSessionOutput>,
    rename_space: (params: RenameSpaceParams) => t.call("rename_space", params) as Promise<RenameSpaceOutput>,
    rename_workspace: (params: RenameWorkspaceParams) => t.call("rename_workspace", params) as Promise<RenameWorkspaceOutput>,
    repo_branches: (params: RepoBranchesParams) => t.call("repo_branches", params) as Promise<RepoBranchesOutput>,
    request_close: () => t.call("request_close", {}) as Promise<RequestCloseOutput>,
  };
}
