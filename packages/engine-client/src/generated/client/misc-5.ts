// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { FileSizeParams, FileSizeOutput, FinishBrowserLoginParams, FinishBrowserLoginOutput, FinishGitHostSetupParams, FinishGitHostSetupOutput, FinishGoogleDriveLoginParams, FinishGoogleDriveLoginOutput, FinishTaskParams, FinishTaskOutput, CliFolderAddParams, CliFolderAddOutput, CliFolderListParams, CliFolderListOutput, CliFolderShowParams, CliFolderShowOutput, FreeRouterBindingParams, FreeRouterBindingOutput, GetProfileParams, GetProfileOutput, GetProjectDirectoryParams, GetProjectDirectoryOutput, GetRadiantIdentityParams, GetRadiantIdentityOutput, GitHostAreasParams, GitHostAreasOutput, GitHostAvailableAreasParams, GitHostAvailableAreasOutput, GitHostPendingSetupParams, GitHostPendingSetupOutput, GitHostProjectsParams, GitHostProjectsOutput, GoogleDriveDesktopStatusParams, GoogleDriveDesktopStatusOutput, GoogleDriveStatusParams, GoogleDriveStatusOutput, GuardarAdjuntoParams, GuardarAdjuntoOutput, GuardarImagenPegadaParams, GuardarImagenPegadaOutput, GuideParams, GuideOutput } from "../commands/misc-5.ts";

export function bind_misc_5(t: EngineTransport) {
  return {
    file_size: (params: FileSizeParams) => t.call("file_size", params) as Promise<FileSizeOutput>,
    finish_browser_login: (params: FinishBrowserLoginParams) => t.call("finish_browser_login", params) as Promise<FinishBrowserLoginOutput>,
    finish_git_host_setup: (params: FinishGitHostSetupParams) => t.call("finish_git_host_setup", params) as Promise<FinishGitHostSetupOutput>,
    finish_google_drive_login: (params?: FinishGoogleDriveLoginParams) => t.call("finish_google_drive_login", params) as Promise<FinishGoogleDriveLoginOutput>,
    finish_task: (params: FinishTaskParams) => t.call("finish_task", params) as Promise<FinishTaskOutput>,
    "folder add": () => t.call("folder add", {}) as Promise<CliFolderAddOutput>,
    "folder list": () => t.call("folder list", {}) as Promise<CliFolderListOutput>,
    "folder show": () => t.call("folder show", {}) as Promise<CliFolderShowOutput>,
    free_router_binding: (params: FreeRouterBindingParams) => t.call("free_router_binding", params) as Promise<FreeRouterBindingOutput>,
    get_profile: () => t.call("get_profile", {}) as Promise<GetProfileOutput>,
    get_project_directory: () => t.call("get_project_directory", {}) as Promise<GetProjectDirectoryOutput>,
    get_radiant_identity: () => t.call("get_radiant_identity", {}) as Promise<GetRadiantIdentityOutput>,
    git_host_areas: (params: GitHostAreasParams) => t.call("git_host_areas", params) as Promise<GitHostAreasOutput>,
    git_host_available_areas: (params: GitHostAvailableAreasParams) => t.call("git_host_available_areas", params) as Promise<GitHostAvailableAreasOutput>,
    git_host_pending_setup: (params: GitHostPendingSetupParams) => t.call("git_host_pending_setup", params) as Promise<GitHostPendingSetupOutput>,
    git_host_projects: (params: GitHostProjectsParams) => t.call("git_host_projects", params) as Promise<GitHostProjectsOutput>,
    google_drive_desktop_status: () => t.call("google_drive_desktop_status", {}) as Promise<GoogleDriveDesktopStatusOutput>,
    google_drive_status: (params?: GoogleDriveStatusParams) => t.call("google_drive_status", params) as Promise<GoogleDriveStatusOutput>,
    guardar_adjunto: (params: GuardarAdjuntoParams) => t.call("guardar_adjunto", params) as Promise<GuardarAdjuntoOutput>,
    guardar_imagen_pegada: (params: GuardarImagenPegadaParams) => t.call("guardar_imagen_pegada", params) as Promise<GuardarImagenPegadaOutput>,
    guide: () => t.call("guide", {}) as Promise<GuideOutput>,
  };
}
