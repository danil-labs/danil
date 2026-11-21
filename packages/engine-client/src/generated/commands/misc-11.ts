// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface SyncAccountCredentialsParams {
  id: string;
}
export type SyncAccountCredentialsOutput = null;

export interface SyncWorkspaceParams {
  id: string;
}
export type SyncWorkspaceOutput = unknown;

export interface SyncWorkspaceMemoryParams {
  id: string;
}
export type SyncWorkspaceMemoryOutput = null;

export type SyncZoteroBibsParams = Record<string, never>;
export type SyncZoteroBibsOutput = unknown[];

export interface TasksAwaitingQuotaParams {
  provider: string;
}
export type TasksAwaitingQuotaOutput = unknown[];

export interface TurnAuthorsParams {
  provider: string;
}
export type TurnAuthorsOutput = unknown;

export interface TypstLiveChangeParams {
  key: string;
  path: string;
  text: string;
}
export type TypstLiveChangeOutput = null;

export interface TypstLiveCloseDocParams {
  key: string;
  path: string;
}
export type TypstLiveCloseDocOutput = null;

export interface TypstLiveOpenParams {
  project: string;
  session: string;
  tree: string;
  path: string;
  main?: string | null;
}
export type TypstLiveOpenOutput = unknown;

export interface TypstLiveRevealParams {
  key: string;
  path: string;
  line: number;
  column: number;
}
export type TypstLiveRevealOutput = null;

export interface TypstLiveStopParams {
  key?: string | null;
  session?: string | null;
}
export type TypstLiveStopOutput = null;

export interface UninstallIntegrationParams {
  id: unknown;
}
export type UninstallIntegrationOutput = null;

export interface UninstallSourceSkillParams {
  source: string;
  skill: string;
}
export type UninstallSourceSkillOutput = null;

export interface UnlinkZoteroBibParams {
  path: string;
}
export type UnlinkZoteroBibOutput = null;

export interface UnshareFolderParams {
  id: string;
}
export type UnshareFolderOutput = unknown;

export interface UnwatchTaskTreeParams {
  id: string;
}
export type UnwatchTaskTreeOutput = null;

export interface UpdateIntegrationParams {
  id: unknown;
}
export type UpdateIntegrationOutput = null;

export interface UpdateSkillSourceParams {
  id: string;
}
export type UpdateSkillSourceOutput = string;

export interface UpdateSourceParams {
  id: string;
}
export type UpdateSourceOutput = string;

export type CliVmLoginParams = Record<string, never>;
export type CliVmLoginOutput = null;

export type CliVmSetupParams = Record<string, never>;
export type CliVmSetupOutput = null;

export const COMMANDS_MISC_11 = {
  sync_account_credentials: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  sync_workspace: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  sync_workspace_memory: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  sync_zotero_bibs: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  tasks_awaiting_quota: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  turn_authors: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  typst_live_change: { kind: "desktop", scope: null, authority: "admin", channel: null, relay: true },
  typst_live_close_doc: { kind: "desktop", scope: null, authority: "admin", channel: null, relay: true },
  typst_live_open: { kind: "desktop", scope: null, authority: "admin", channel: null, relay: true },
  typst_live_reveal: { kind: "desktop", scope: null, authority: "admin", channel: null, relay: true },
  typst_live_stop: { kind: "desktop", scope: null, authority: "admin", channel: null, relay: true },
  uninstall_integration: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
  uninstall_source_skill: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  unlink_zotero_bib: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  unshare_folder: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  unwatch_task_tree: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  update_integration: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
  update_skill_source: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  update_source: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  "vm login": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "vm setup": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
} as const;
