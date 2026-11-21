// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { CliVmStartParams, CliVmStartOutput, CliVmStatusParams, CliVmStatusOutput, CliVmStopParams, CliVmStopOutput, WatchTaskTreeParams, WatchTaskTreeOutput, WindowReadyParams, WindowReadyOutput, WindowVitalsParams, WindowVitalsOutput, CliWorkspaceClearLogoParams, CliWorkspaceClearLogoOutput, CliWorkspaceCreateParams, CliWorkspaceCreateOutput, CliWorkspaceListParams, CliWorkspaceListOutput, CliWorkspaceSetLogoParams, CliWorkspaceSetLogoOutput, CliWorkspaceShowParams, CliWorkspaceShowOutput, WorkspacesStartupParams, WorkspacesStartupOutput, WorktreeRenameBranchParams, WorktreeRenameBranchOutput, WriteMemoryEntryParams, WriteMemoryEntryOutput, WriteShellInputParams, WriteShellInputOutput, ZoteroBibLinksParams, ZoteroBibLinksOutput, ZoteroStatusParams, ZoteroStatusOutput } from "../commands/misc-12.ts";

export function bind_misc_12(t: EngineTransport) {
  return {
    "vm start": () => t.call("vm start", {}) as Promise<CliVmStartOutput>,
    "vm status": () => t.call("vm status", {}) as Promise<CliVmStatusOutput>,
    "vm stop": () => t.call("vm stop", {}) as Promise<CliVmStopOutput>,
    watch_task_tree: (params: WatchTaskTreeParams) => t.call("watch_task_tree", params) as Promise<WatchTaskTreeOutput>,
    window_ready: (params: WindowReadyParams) => t.call("window_ready", params) as Promise<WindowReadyOutput>,
    window_vitals: (params: WindowVitalsParams) => t.call("window_vitals", params) as Promise<WindowVitalsOutput>,
    "workspace clear-logo": () => t.call("workspace clear-logo", {}) as Promise<CliWorkspaceClearLogoOutput>,
    "workspace create": () => t.call("workspace create", {}) as Promise<CliWorkspaceCreateOutput>,
    "workspace list": () => t.call("workspace list", {}) as Promise<CliWorkspaceListOutput>,
    "workspace set-logo": () => t.call("workspace set-logo", {}) as Promise<CliWorkspaceSetLogoOutput>,
    "workspace show": () => t.call("workspace show", {}) as Promise<CliWorkspaceShowOutput>,
    workspaces_startup: () => t.call("workspaces_startup", {}) as Promise<WorkspacesStartupOutput>,
    worktree_rename_branch: (params: WorktreeRenameBranchParams) => t.call("worktree_rename_branch", params) as Promise<WorktreeRenameBranchOutput>,
    write_memory_entry: (params: WriteMemoryEntryParams) => t.call("write_memory_entry", params) as Promise<WriteMemoryEntryOutput>,
    write_shell_input: (params: WriteShellInputParams) => t.call("write_shell_input", params) as Promise<WriteShellInputOutput>,
    zotero_bib_links: () => t.call("zotero_bib_links", {}) as Promise<ZoteroBibLinksOutput>,
    zotero_status: () => t.call("zotero_status", {}) as Promise<ZoteroStatusOutput>,
  };
}
