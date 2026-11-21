// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface TreeChangesParams {
  project: string;
  session: string;
  tree: string;
}
export type TreeChangesOutput = unknown;

export interface TreeCreateFileParams {
  project: string;
  session: string;
  tree: string;
  path: string;
}
export type TreeCreateFileOutput = null;

export interface TreeCreateFolderParams {
  project: string;
  session: string;
  tree: string;
  path: string;
}
export type TreeCreateFolderOutput = null;

export interface TreeDeleteParams {
  project: string;
  session: string;
  tree: string;
  path: string;
}
export type TreeDeleteOutput = null;

export interface TreeDiffParams {
  project: string;
  session: string;
  tree: string;
  before: string;
  after: string;
  path?: string | null;
}
export type TreeDiffOutput = unknown;

export interface TreeFilesParams {
  project: string;
  session: string;
  tree: string;
}
export type TreeFilesOutput = unknown;

export interface TreeFolderParams {
  project: string;
  session: string;
  tree: string;
  path: string;
  offset: number;
}
export type TreeFolderOutput = unknown;

export interface TreeGitStatusParams {
  project: string;
  session: string;
  tree: string;
}
export type TreeGitStatusOutput = unknown[];

export interface TreeOfficePreviewParams {
  project: string;
  session: string;
  tree: string;
  path: string;
}
export type TreeOfficePreviewOutput = unknown;

export interface TreeOpenExternalParams {
  project: string;
  session: string;
  tree: string;
  path: string;
}
export type TreeOpenExternalOutput = null;

export interface TreePatchParams {
  project: string;
  session: string;
  tree: string;
  path: string;
}
export type TreePatchOutput = string;

export interface TreeReadPartParams {
  project: string;
  session: string;
  tree: string;
  path: string;
  offset: number;
  size: number;
  revision?: string | null;
}
export type TreeReadPartOutput = unknown;

export interface TreeRenameParams {
  project: string;
  session: string;
  tree: string;
  from: string;
  to: string;
}
export type TreeRenameOutput = null;

export interface TreeShowParams {
  project: string;
  session: string;
  tree: string;
  path: string;
}
export type TreeShowOutput = unknown;

export interface TreeSummaryParams {
  project: string;
  session: string;
  tree: string;
}
export type TreeSummaryOutput = unknown;

export interface TreeTypstExportParams {
  project: string;
  session: string;
  tree: string;
  path: string;
  main?: string | null;
}
export type TreeTypstExportOutput = unknown;

export interface TreeTypstTargetParams {
  project: string;
  session: string;
  tree: string;
  path: string;
  main?: string | null;
}
export type TreeTypstTargetOutput = unknown;

export interface TreeWriteParams {
  project: string;
  session: string;
  tree: string;
  path: string;
  text: string;
}
export type TreeWriteOutput = null;

export const COMMANDS_TREE = {
  tree_changes: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  tree_create_file: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  tree_create_folder: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  tree_delete: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  tree_diff: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  tree_files: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  tree_folder: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  tree_git_status: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  tree_office_preview: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  tree_open_external: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  tree_patch: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  tree_read_part: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  tree_rename: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  tree_show: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  tree_summary: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  tree_typst_export: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  tree_typst_target: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  tree_write: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
} as const;
