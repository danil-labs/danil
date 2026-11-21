// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
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

export interface ProveFreeRouterBindingParams {
  workspace: string;
  nonce: string;
}
export type ProveFreeRouterBindingOutput = unknown;

export interface ProviderDownloadSizeParams {
  provider: string;
}
export type ProviderDownloadSizeOutput = number;

export interface PublicationsOfParams {
  project: string;
  session: string;
}
export type PublicationsOfOutput = unknown[];

export interface QueueReadyParams {
  project: string;
  session: string;
}
export type QueueReadyOutput = boolean;

export interface ReclaimStorageParams {
  project: string;
  session: string;
  rutas: string[];
}
export type ReclaimStorageOutput = unknown;

export interface RecordExportParams {
  referencia: unknown;
  via: string;
  destino: string;
  bytes: number;
}
export type RecordExportOutput = null;

export interface RecreateTaskWorkParams {
  project: string;
  id: string;
}
export type RecreateTaskWorkOutput = null;

export interface ReintentarReanudacionPorEntregasParams {
  project: string;
  session: string;
}
export type ReintentarReanudacionPorEntregasOutput = string;

export interface ReleaseFreeRouterOwnerParams {
  sub: string;
  workspaces?: string[] | null;
}
export type ReleaseFreeRouterOwnerOutput = unknown;

export interface RenameProjectParams {
  id: string;
  name: string;
}
export type RenameProjectOutput = unknown;

export interface RenameSessionParams {
  project: string;
  id: string;
  title: string;
}
export type RenameSessionOutput = null;

export interface RenameSpaceParams {
  id: string;
  name: string;
}
export type RenameSpaceOutput = unknown;

export interface RenameWorkspaceParams {
  id: string;
  name: string;
}
export type RenameWorkspaceOutput = unknown;

export interface RepoBranchesParams {
  cloneUrl: string;
  gitHost?: string | null;
  defaultBranch?: string | null;
}
export type RepoBranchesOutput = unknown;

export type RequestCloseParams = Record<string, never>;
export type RequestCloseOutput = null;

export const COMMANDS_MISC_8 = {
  preview_tree_files: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  preview_tree_folder: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  preview_tree_show: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  project_base_branches: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  project_clone_status: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  project_setup_command: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  prove_free_router_binding: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  provider_download_size: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  publications_of: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  queue_ready: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  reclaim_storage: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  record_export: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  recreate_task_work: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  reintentar_reanudacion_por_entregas: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  release_free_router_owner: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  rename_project: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  rename_session: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  rename_space: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  rename_workspace: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  repo_branches: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  request_close: { kind: "desktop", scope: null, authority: "admin", channel: null },
} as const;
