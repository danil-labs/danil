// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface FileSizeParams {
  path: string;
}
export type FileSizeOutput = number;

export interface FinishBrowserLoginParams {
  id: string;
  scope?: string | null;
}
export type FinishBrowserLoginOutput = unknown;

export interface FinishGitHostSetupParams {
  id: string;
  scope?: string | null;
}
export type FinishGitHostSetupOutput = unknown;

export interface FinishGoogleDriveLoginParams {
  workspace?: string | null;
}
export type FinishGoogleDriveLoginOutput = unknown;

export interface FinishTaskParams {
  project: string;
  id: string;
}
export type FinishTaskOutput = null;

export type CliFolderAddParams = Record<string, never>;
export type CliFolderAddOutput = null;

export type CliFolderListParams = Record<string, never>;
export type CliFolderListOutput = null;

export type CliFolderShowParams = Record<string, never>;
export type CliFolderShowOutput = null;

export interface FreeRouterBindingParams {
  workspace: string;
}
export type FreeRouterBindingOutput = unknown;

export type GetProfileParams = Record<string, never>;
export type GetProfileOutput = unknown;

export type GetProjectDirectoryParams = Record<string, never>;
export type GetProjectDirectoryOutput = string;

export type GetRadiantIdentityParams = Record<string, never>;
export type GetRadiantIdentityOutput = unknown;

export interface GitHostAreasParams {
  id: string;
  scope?: string | null;
}
export type GitHostAreasOutput = unknown[];

export interface GitHostAvailableAreasParams {
  id: string;
  scope?: string | null;
}
export type GitHostAvailableAreasOutput = unknown[];

export interface GitHostPendingSetupParams {
  id: string;
  scope?: string | null;
}
export type GitHostPendingSetupOutput = string | null;

export interface GitHostProjectsParams {
  id: string;
  area: string;
  scope?: string | null;
  includeSkills?: boolean | null;
}
export type GitHostProjectsOutput = unknown[];

export type GoogleDriveDesktopStatusParams = Record<string, never>;
export type GoogleDriveDesktopStatusOutput = unknown;

export interface GoogleDriveStatusParams {
  workspace?: string | null;
}
export type GoogleDriveStatusOutput = unknown;

export interface GuardarAdjuntoParams {
  mime: string;
  nombre?: string | null;
  datos: string;
}
export type GuardarAdjuntoOutput = string;

export interface GuardarImagenPegadaParams {
  mime: string;
  datos: string;
}
export type GuardarImagenPegadaOutput = string;

export type GuideParams = Record<string, never>;
export type GuideOutput = null;

export const COMMANDS_MISC_5 = {
  file_size: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  finish_browser_login: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  finish_git_host_setup: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  finish_google_drive_login: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  finish_task: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  "folder add": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "folder list": { kind: "cli", scope: null, authority: "read", channel: null, relay: false },
  "folder show": { kind: "cli", scope: null, authority: "read", channel: null, relay: false },
  free_router_binding: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  get_profile: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  get_project_directory: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  get_radiant_identity: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  git_host_areas: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  git_host_available_areas: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  git_host_pending_setup: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  git_host_projects: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  google_drive_desktop_status: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  google_drive_status: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  guardar_adjunto: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  guardar_imagen_pegada: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  guide: { kind: "cli", scope: null, authority: "read", channel: null, relay: false },
} as const;
