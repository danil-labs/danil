// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type CliNoticeFetchParams = Record<string, never>;
export type CliNoticeFetchOutput = null;

export type CliNoticeTakeParams = Record<string, never>;
export type CliNoticeTakeOutput = null;

export type NotifyParams = Record<string, never>;
export type NotifyOutput = null;

export type ObservabilityConnectParams = Record<string, never>;
export type ObservabilityConnectOutput = unknown;

export type ObservabilityDisconnectParams = Record<string, never>;
export type ObservabilityDisconnectOutput = null;

export interface OfficePreviewParams {
  path: string;
}
export type OfficePreviewOutput = unknown;

export interface OpenExternalParams {
  target: string;
}
export type OpenExternalOutput = null;

export interface OpenFileExternalParams {
  target: string;
}
export type OpenFileExternalOutput = null;

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

export const COMMANDS_MISC_7 = {
  "notice fetch": { kind: "cli", scope: null, authority: "read", channel: null },
  "notice take": { kind: "cli", scope: null, authority: "read", channel: null },
  notify: { kind: "cli", scope: null, authority: "task", channel: null },
  observability_connect: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  observability_disconnect: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  office_preview: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  open_external: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  open_file_external: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
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
} as const;
