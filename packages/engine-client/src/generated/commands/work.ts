// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface WorkCancelParams {
  transfer: string;
}
export type WorkCancelOutput = null;

export interface WorkExportParams {
  project: string;
  task?: string | null;
  operation: string;
  includeWork: boolean;
  exclude: string[];
  files: string[];
  full: boolean;
  recipientKey?: string | null;
}
export type WorkExportOutput = unknown;

export interface WorkImportParams {
  transfer: string;
  project: string;
  sha256: string;
  bytes: number;
  probe?: boolean | null;
  branchAs?: string | null;
  create?: unknown | null;
}
export type WorkImportOutput = unknown;

export type WorkKeyParams = Record<string, never>;
export type WorkKeyOutput = unknown;

export interface WorkReadPartParams {
  transfer: string;
  offset: number;
  size: number;
}
export type WorkReadPartOutput = unknown;

export interface WorkStatusParams {
  project: string;
  task?: string | null;
}
export type WorkStatusOutput = unknown;

export interface WorkWritePartParams {
  transfer: string;
  offset: number;
  data: string;
}
export type WorkWritePartOutput = unknown;

export const COMMANDS_WORK = {
  work_cancel: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  work_export: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  work_import: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  work_key: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  work_read_part: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  work_status: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  work_write_part: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
} as const;
