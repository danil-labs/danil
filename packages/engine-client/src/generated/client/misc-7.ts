// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { OpenGoogleDriveDesktopParams, OpenGoogleDriveDesktopOutput, OpenZoteroParams, OpenZoteroOutput, CliOperationShowParams, CliOperationShowOutput, CliOperationWaitParams, CliOperationWaitOutput, PendingRequestsParams, PendingRequestsOutput, CliPortfolioCreateParams, CliPortfolioCreateOutput, CliPortfolioListParams, CliPortfolioListOutput, CliPortfolioRenameParams, CliPortfolioRenameOutput, PrepareAttachmentsParams, PrepareAttachmentsOutput, PreparePrintParams, PreparePrintOutput, PrepareRuntimeParams, PrepareRuntimeOutput, PrepareSessionContinuationParams, PrepareSessionContinuationOutput, PreviewFileParams, PreviewFileOutput, PreviewTreeFilesParams, PreviewTreeFilesOutput, PreviewTreeFolderParams, PreviewTreeFolderOutput, PreviewTreeShowParams, PreviewTreeShowOutput, ProjectBaseBranchesParams, ProjectBaseBranchesOutput, ProjectCloneStatusParams, ProjectCloneStatusOutput, ProjectSetupCommandParams, ProjectSetupCommandOutput, ProviderDownloadSizeParams, ProviderDownloadSizeOutput, PublicationsOfParams, PublicationsOfOutput } from "../commands/misc-7.ts";

export function bind_misc_7(t: EngineTransport) {
  return {
    open_google_drive_desktop: () => t.call("open_google_drive_desktop", {}) as Promise<OpenGoogleDriveDesktopOutput>,
    open_zotero: () => t.call("open_zotero", {}) as Promise<OpenZoteroOutput>,
    "operation show": () => t.call("operation show", {}) as Promise<CliOperationShowOutput>,
    "operation wait": () => t.call("operation wait", {}) as Promise<CliOperationWaitOutput>,
    pending_requests: (params: PendingRequestsParams) => t.call("pending_requests", params) as Promise<PendingRequestsOutput>,
    "portfolio create": () => t.call("portfolio create", {}) as Promise<CliPortfolioCreateOutput>,
    "portfolio list": () => t.call("portfolio list", {}) as Promise<CliPortfolioListOutput>,
    "portfolio rename": () => t.call("portfolio rename", {}) as Promise<CliPortfolioRenameOutput>,
    prepare_attachments: (params: PrepareAttachmentsParams) => t.call("prepare_attachments", params) as Promise<PrepareAttachmentsOutput>,
    prepare_print: (params: PreparePrintParams) => t.call("prepare_print", params) as Promise<PreparePrintOutput>,
    prepare_runtime: (params?: PrepareRuntimeParams) => t.call("prepare_runtime", params) as Promise<PrepareRuntimeOutput>,
    prepare_session_continuation: (params: PrepareSessionContinuationParams) => t.call("prepare_session_continuation", params) as Promise<PrepareSessionContinuationOutput>,
    preview_file: (params: PreviewFileParams) => t.call("preview_file", params) as Promise<PreviewFileOutput>,
    preview_tree_files: (params: PreviewTreeFilesParams) => t.call("preview_tree_files", params) as Promise<PreviewTreeFilesOutput>,
    preview_tree_folder: (params: PreviewTreeFolderParams) => t.call("preview_tree_folder", params) as Promise<PreviewTreeFolderOutput>,
    preview_tree_show: (params: PreviewTreeShowParams) => t.call("preview_tree_show", params) as Promise<PreviewTreeShowOutput>,
    project_base_branches: (params: ProjectBaseBranchesParams) => t.call("project_base_branches", params) as Promise<ProjectBaseBranchesOutput>,
    project_clone_status: (params: ProjectCloneStatusParams) => t.call("project_clone_status", params) as Promise<ProjectCloneStatusOutput>,
    project_setup_command: (params: ProjectSetupCommandParams) => t.call("project_setup_command", params) as Promise<ProjectSetupCommandOutput>,
    provider_download_size: (params: ProviderDownloadSizeParams) => t.call("provider_download_size", params) as Promise<ProviderDownloadSizeOutput>,
    publications_of: (params: PublicationsOfParams) => t.call("publications_of", params) as Promise<PublicationsOfOutput>,
  };
}
