// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type CliVmLoginParams = Record<string, never>;
export type CliVmLoginOutput = null;

export type CliVmSetupParams = Record<string, never>;
export type CliVmSetupOutput = null;

export type CliVmStartParams = Record<string, never>;
export type CliVmStartOutput = null;

export type CliVmStatusParams = Record<string, never>;
export type CliVmStatusOutput = null;

export type CliVmStopParams = Record<string, never>;
export type CliVmStopOutput = null;

export interface WatchTaskTreeParams {
  project: string;
  session: string;
}
export type WatchTaskTreeOutput = string;

export interface WindowReadyParams {
  at: number;
}
export type WindowReadyOutput = null;

export interface WindowVitalsParams {
  nodes: number;
  heapMb: number;
  tabs: number;
  threads: number;
  messages: number;
}
export type WindowVitalsOutput = null;

export type CliWorkspaceClearLogoParams = Record<string, never>;
export type CliWorkspaceClearLogoOutput = null;

export type CliWorkspaceCreateParams = Record<string, never>;
export type CliWorkspaceCreateOutput = null;

export type CliWorkspaceListParams = Record<string, never>;
export type CliWorkspaceListOutput = null;

export type CliWorkspaceSetLogoParams = Record<string, never>;
export type CliWorkspaceSetLogoOutput = null;

export type CliWorkspaceShowParams = Record<string, never>;
export type CliWorkspaceShowOutput = null;

export type WorkspacesStartupParams = Record<string, never>;
export type WorkspacesStartupOutput = unknown;

export interface WorktreeRenameBranchParams {
  project: string;
  session: string;
  name: string;
}
export type WorktreeRenameBranchOutput = unknown;

export interface WriteMemoryEntryParams {
  project: string;
  scope: unknown;
  file: string;
  "r#type"?: string | null;
  text: string;
}
export type WriteMemoryEntryOutput = unknown;

export interface WriteShellInputParams {
  session: string;
  input: string;
}
export type WriteShellInputOutput = boolean;

export type ZoteroBibLinksParams = Record<string, never>;
export type ZoteroBibLinksOutput = unknown[];

export type ZoteroStatusParams = Record<string, never>;
export type ZoteroStatusOutput = unknown;

export const COMMANDS_MISC_11 = {
  "vm login": { kind: "cli", scope: null, authority: "admin", channel: null },
  "vm setup": { kind: "cli", scope: null, authority: "admin", channel: null },
  "vm start": { kind: "cli", scope: null, authority: "admin", channel: null },
  "vm status": { kind: "cli", scope: null, authority: "read", channel: null },
  "vm stop": { kind: "cli", scope: null, authority: "admin", channel: null },
  watch_task_tree: { kind: "stream", scope: "workspace", authority: "admin", channel: "changes" },
  window_ready: { kind: "desktop", scope: null, authority: "admin", channel: null },
  window_vitals: { kind: "desktop", scope: null, authority: "admin", channel: null },
  "workspace clear-logo": { kind: "cli", scope: null, authority: "admin", channel: null },
  "workspace create": { kind: "cli", scope: null, authority: "admin", channel: null },
  "workspace list": { kind: "cli", scope: null, authority: "read", channel: null },
  "workspace set-logo": { kind: "cli", scope: null, authority: "admin", channel: null },
  "workspace show": { kind: "cli", scope: null, authority: "read", channel: null },
  workspaces_startup: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  worktree_rename_branch: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  write_memory_entry: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  write_shell_input: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  zotero_bib_links: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  zotero_status: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
} as const;
