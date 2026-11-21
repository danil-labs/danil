// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type OpenGoogleDriveDesktopParams = Record<string, never>;
export type OpenGoogleDriveDesktopOutput = null;

export type OpenZoteroParams = Record<string, never>;
export type OpenZoteroOutput = null;

export type CliOperationShowParams = Record<string, never>;
export type CliOperationShowOutput = null;

export type CliOperationWaitParams = Record<string, never>;
export type CliOperationWaitOutput = null;

export interface PendingRequestsParams {
  session: string;
}
export type PendingRequestsOutput = unknown;

export type CliPortfolioCreateParams = Record<string, never>;
export type CliPortfolioCreateOutput = null;

export type CliPortfolioListParams = Record<string, never>;
export type CliPortfolioListOutput = null;

export type CliPortfolioRenameParams = Record<string, never>;
export type CliPortfolioRenameOutput = null;

export interface PrepareAttachmentsParams {
  project: string;
  paths: string[];
}
export type PrepareAttachmentsOutput = string[];

export interface PreparePrintParams {
  path: string;
  html: string;
}
export type PreparePrintOutput = string;

export interface PrepareRuntimeParams {
  joinOnly?: boolean | null;
  skip?: string[] | null;
}
export type PrepareRuntimeOutput = unknown;

export interface PrepareSessionContinuationParams {
  project: string;
  id: string;
  turno: string;
}
export type PrepareSessionContinuationOutput = unknown;

export interface PreviewFileParams {
  path: string;
  rel: string;
}
export type PreviewFileOutput = unknown;

export interface PreviewTreeFilesParams {
  project: string;
  baseRef?: string | null;
}
export type PreviewTreeFilesOutput = unknown;

export interface PreviewTreeFolderParams {
  project: string;
  path: string;
  offset: number;
}
export type PreviewTreeFolderOutput = unknown;

export interface PreviewTreeShowParams {
  project: string;
  baseRef?: string | null;
  path: string;
}
export type PreviewTreeShowOutput = unknown;

export interface ProjectBaseBranchesParams {
  project: string;
  refresh?: boolean | null;
  details?: boolean | null;
}
export type ProjectBaseBranchesOutput = unknown;

export interface ProjectCloneStatusParams {
  operation: string;
}
export type ProjectCloneStatusOutput = unknown | null;

export interface ProjectSetupCommandParams {
  project: string;
}
export type ProjectSetupCommandOutput = string | null;

export interface ProviderDownloadSizeParams {
  provider: string;
}
export type ProviderDownloadSizeOutput = number;

export interface PublicationsOfParams {
  project: string;
  session: string;
}
export type PublicationsOfOutput = unknown[];

export const COMMANDS_MISC_7 = {
  open_google_drive_desktop: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  open_zotero: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  "operation show": { kind: "cli", scope: null, authority: "read", channel: null },
  "operation wait": { kind: "cli", scope: null, authority: "read", channel: null },
  pending_requests: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  "portfolio create": { kind: "cli", scope: null, authority: "admin", channel: null },
  "portfolio list": { kind: "cli", scope: null, authority: "read", channel: null },
  "portfolio rename": { kind: "cli", scope: null, authority: "admin", channel: null },
  prepare_attachments: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  prepare_print: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  prepare_runtime: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  prepare_session_continuation: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  preview_file: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  preview_tree_files: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  preview_tree_folder: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  preview_tree_show: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  project_base_branches: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  project_clone_status: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  project_setup_command: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  provider_download_size: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  publications_of: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
} as const;
