// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { TreeChangesParams, TreeChangesOutput, TreeCreateFileParams, TreeCreateFileOutput, TreeCreateFolderParams, TreeCreateFolderOutput, TreeDeleteParams, TreeDeleteOutput, TreeDiffParams, TreeDiffOutput, TreeFilesParams, TreeFilesOutput, TreeFolderParams, TreeFolderOutput, TreeGitStatusParams, TreeGitStatusOutput, TreeOfficePreviewParams, TreeOfficePreviewOutput, TreeOpenExternalParams, TreeOpenExternalOutput, TreePatchParams, TreePatchOutput, TreeRenameParams, TreeRenameOutput, TreeShowParams, TreeShowOutput, TreeSummaryParams, TreeSummaryOutput, TreeTypstExportParams, TreeTypstExportOutput, TreeTypstTargetParams, TreeTypstTargetOutput, TreeWriteParams, TreeWriteOutput } from "../commands/tree.ts";

export function bind_tree(t: EngineTransport) {
  return {
    tree_changes: (params: TreeChangesParams) => t.call("tree_changes", params) as Promise<TreeChangesOutput>,
    tree_create_file: (params: TreeCreateFileParams) => t.call("tree_create_file", params) as Promise<TreeCreateFileOutput>,
    tree_create_folder: (params: TreeCreateFolderParams) => t.call("tree_create_folder", params) as Promise<TreeCreateFolderOutput>,
    tree_delete: (params: TreeDeleteParams) => t.call("tree_delete", params) as Promise<TreeDeleteOutput>,
    tree_diff: (params: TreeDiffParams) => t.call("tree_diff", params) as Promise<TreeDiffOutput>,
    tree_files: (params: TreeFilesParams) => t.call("tree_files", params) as Promise<TreeFilesOutput>,
    tree_folder: (params: TreeFolderParams) => t.call("tree_folder", params) as Promise<TreeFolderOutput>,
    tree_git_status: (params: TreeGitStatusParams) => t.call("tree_git_status", params) as Promise<TreeGitStatusOutput>,
    tree_office_preview: (params: TreeOfficePreviewParams) => t.call("tree_office_preview", params) as Promise<TreeOfficePreviewOutput>,
    tree_open_external: (params: TreeOpenExternalParams) => t.call("tree_open_external", params) as Promise<TreeOpenExternalOutput>,
    tree_patch: (params: TreePatchParams) => t.call("tree_patch", params) as Promise<TreePatchOutput>,
    tree_rename: (params: TreeRenameParams) => t.call("tree_rename", params) as Promise<TreeRenameOutput>,
    tree_show: (params: TreeShowParams) => t.call("tree_show", params) as Promise<TreeShowOutput>,
    tree_summary: (params: TreeSummaryParams) => t.call("tree_summary", params) as Promise<TreeSummaryOutput>,
    tree_typst_export: (params: TreeTypstExportParams) => t.call("tree_typst_export", params) as Promise<TreeTypstExportOutput>,
    tree_typst_target: (params: TreeTypstTargetParams) => t.call("tree_typst_target", params) as Promise<TreeTypstTargetOutput>,
    tree_write: (params: TreeWriteParams) => t.call("tree_write", params) as Promise<TreeWriteOutput>,
  };
}
