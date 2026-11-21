// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { FinishTaskParams, FinishTaskOutput, CliFolderAddParams, CliFolderAddOutput, CliFolderListParams, CliFolderListOutput, CliFolderShowParams, CliFolderShowOutput, GetProfileParams, GetProfileOutput, GetProjectDirectoryParams, GetProjectDirectoryOutput, GetRadiantIdentityParams, GetRadiantIdentityOutput, GitHostAreasParams, GitHostAreasOutput, GitHostAvailableAreasParams, GitHostAvailableAreasOutput, GitHostPendingSetupParams, GitHostPendingSetupOutput, GitHostProjectsParams, GitHostProjectsOutput, GoogleDriveDesktopStatusParams, GoogleDriveDesktopStatusOutput, GoogleDriveStatusParams, GoogleDriveStatusOutput, GuardarImagenPegadaParams, GuardarImagenPegadaOutput, GuideParams, GuideOutput, HasMcpAppParams, HasMcpAppOutput, ImportChatBackgroundParams, ImportChatBackgroundOutput, ImportChatBackgroundDataParams, ImportChatBackgroundDataOutput, CliInboxListParams, CliInboxListOutput, CliInboxTakeParams, CliInboxTakeOutput, InjectMessageParams, InjectMessageOutput } from "../commands/misc-5.ts";

export function bind_misc_5(t: EngineTransport) {
  return {
    finish_task: (params: FinishTaskParams) => t.call("finish_task", params) as Promise<FinishTaskOutput>,
    "folder add": () => t.call("folder add", {}) as Promise<CliFolderAddOutput>,
    "folder list": () => t.call("folder list", {}) as Promise<CliFolderListOutput>,
    "folder show": () => t.call("folder show", {}) as Promise<CliFolderShowOutput>,
    get_profile: () => t.call("get_profile", {}) as Promise<GetProfileOutput>,
    get_project_directory: () => t.call("get_project_directory", {}) as Promise<GetProjectDirectoryOutput>,
    get_radiant_identity: () => t.call("get_radiant_identity", {}) as Promise<GetRadiantIdentityOutput>,
    git_host_areas: (params: GitHostAreasParams) => t.call("git_host_areas", params) as Promise<GitHostAreasOutput>,
    git_host_available_areas: (params: GitHostAvailableAreasParams) => t.call("git_host_available_areas", params) as Promise<GitHostAvailableAreasOutput>,
    git_host_pending_setup: (params: GitHostPendingSetupParams) => t.call("git_host_pending_setup", params) as Promise<GitHostPendingSetupOutput>,
    git_host_projects: (params: GitHostProjectsParams) => t.call("git_host_projects", params) as Promise<GitHostProjectsOutput>,
    google_drive_desktop_status: () => t.call("google_drive_desktop_status", {}) as Promise<GoogleDriveDesktopStatusOutput>,
    google_drive_status: (params?: GoogleDriveStatusParams) => t.call("google_drive_status", params) as Promise<GoogleDriveStatusOutput>,
    guardar_imagen_pegada: (params: GuardarImagenPegadaParams) => t.call("guardar_imagen_pegada", params) as Promise<GuardarImagenPegadaOutput>,
    guide: () => t.call("guide", {}) as Promise<GuideOutput>,
    has_mcp_app: (params: HasMcpAppParams) => t.call("has_mcp_app", params) as Promise<HasMcpAppOutput>,
    import_chat_background: (params: ImportChatBackgroundParams) => t.call("import_chat_background", params) as Promise<ImportChatBackgroundOutput>,
    import_chat_background_data: (params: ImportChatBackgroundDataParams) => t.call("import_chat_background_data", params) as Promise<ImportChatBackgroundDataOutput>,
    "inbox list": () => t.call("inbox list", {}) as Promise<CliInboxListOutput>,
    "inbox take": () => t.call("inbox take", {}) as Promise<CliInboxTakeOutput>,
    inject_message: (params: InjectMessageParams) => t.call("inject_message", params) as Promise<InjectMessageOutput>,
  };
}
