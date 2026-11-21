// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
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

export interface GuardarImagenPegadaParams {
  mime: string;
  datos: string;
}
export type GuardarImagenPegadaOutput = string;

export type GuideParams = Record<string, never>;
export type GuideOutput = null;

export interface HasMcpAppParams {
  server: string;
  tool: string;
}
export type HasMcpAppOutput = boolean;

export interface ImportChatBackgroundParams {
  source: string;
}
export type ImportChatBackgroundOutput = string;

export interface ImportChatBackgroundDataParams {
  dataUrl: string;
}
export type ImportChatBackgroundDataOutput = string;

export type CliInboxListParams = Record<string, never>;
export type CliInboxListOutput = null;

export type CliInboxTakeParams = Record<string, never>;
export type CliInboxTakeOutput = null;

export interface InjectMessageParams {
  project: string;
  session: string;
  prompt: string;
  queueId?: string | null;
  attachments?: string[] | null;
  taskMentions?: unknown[] | null;
  recipients?: unknown[] | null;
}
export type InjectMessageOutput = null;

export const COMMANDS_MISC_5 = {
  finish_task: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  "folder add": { kind: "cli", scope: null, authority: "admin", channel: null },
  "folder list": { kind: "cli", scope: null, authority: "read", channel: null },
  "folder show": { kind: "cli", scope: null, authority: "read", channel: null },
  get_profile: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  get_project_directory: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  get_radiant_identity: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  git_host_areas: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  git_host_available_areas: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  git_host_pending_setup: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  git_host_projects: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  google_drive_desktop_status: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  google_drive_status: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  guardar_imagen_pegada: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  guide: { kind: "cli", scope: null, authority: "read", channel: null },
  has_mcp_app: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  import_chat_background: { kind: "invoke", scope: null, authority: "admin", channel: null },
  import_chat_background_data: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  "inbox list": { kind: "cli", scope: null, authority: "read", channel: null },
  "inbox take": { kind: "cli", scope: null, authority: "task", channel: null },
  inject_message: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
} as const;
