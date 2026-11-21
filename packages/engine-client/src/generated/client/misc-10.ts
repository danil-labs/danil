// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { StopShellCommandParams, StopShellCommandOutput, StopTurnParams, StopTurnOutput, SubmitLoginCodeParams, SubmitLoginCodeOutput, SyncAccountCredentialsParams, SyncAccountCredentialsOutput, SyncWorkspaceParams, SyncWorkspaceOutput, SyncWorkspaceMemoryParams, SyncWorkspaceMemoryOutput, SyncZoteroBibsParams, SyncZoteroBibsOutput, TasksAwaitingQuotaParams, TasksAwaitingQuotaOutput, TurnAuthorsParams, TurnAuthorsOutput, TypstLiveChangeParams, TypstLiveChangeOutput, TypstLiveCloseDocParams, TypstLiveCloseDocOutput, TypstLiveOpenParams, TypstLiveOpenOutput, TypstLiveRevealParams, TypstLiveRevealOutput, TypstLiveStopParams, TypstLiveStopOutput, UninstallIntegrationParams, UninstallIntegrationOutput, UninstallSourceSkillParams, UninstallSourceSkillOutput, UnlinkZoteroBibParams, UnlinkZoteroBibOutput, UnwatchTaskTreeParams, UnwatchTaskTreeOutput, UpdateIntegrationParams, UpdateIntegrationOutput, UpdateSkillSourceParams, UpdateSkillSourceOutput, UpdateSourceParams, UpdateSourceOutput } from "../commands/misc-10.ts";

export function bind_misc_10(t: EngineTransport) {
  return {
    stop_shell_command: (params: StopShellCommandParams) => t.call("stop_shell_command", params) as Promise<StopShellCommandOutput>,
    stop_turn: (params: StopTurnParams) => t.call("stop_turn", params) as Promise<StopTurnOutput>,
    submit_login_code: (params: SubmitLoginCodeParams) => t.call("submit_login_code", params) as Promise<SubmitLoginCodeOutput>,
    sync_account_credentials: (params: SyncAccountCredentialsParams) => t.call("sync_account_credentials", params) as Promise<SyncAccountCredentialsOutput>,
    sync_workspace: (params: SyncWorkspaceParams) => t.call("sync_workspace", params) as Promise<SyncWorkspaceOutput>,
    sync_workspace_memory: (params: SyncWorkspaceMemoryParams) => t.call("sync_workspace_memory", params) as Promise<SyncWorkspaceMemoryOutput>,
    sync_zotero_bibs: () => t.call("sync_zotero_bibs", {}) as Promise<SyncZoteroBibsOutput>,
    tasks_awaiting_quota: (params: TasksAwaitingQuotaParams) => t.call("tasks_awaiting_quota", params) as Promise<TasksAwaitingQuotaOutput>,
    turn_authors: (params: TurnAuthorsParams) => t.call("turn_authors", params) as Promise<TurnAuthorsOutput>,
    typst_live_change: (params: TypstLiveChangeParams) => t.call("typst_live_change", params) as Promise<TypstLiveChangeOutput>,
    typst_live_close_doc: (params: TypstLiveCloseDocParams) => t.call("typst_live_close_doc", params) as Promise<TypstLiveCloseDocOutput>,
    typst_live_open: (params: TypstLiveOpenParams) => t.call("typst_live_open", params) as Promise<TypstLiveOpenOutput>,
    typst_live_reveal: (params: TypstLiveRevealParams) => t.call("typst_live_reveal", params) as Promise<TypstLiveRevealOutput>,
    typst_live_stop: (params?: TypstLiveStopParams) => t.call("typst_live_stop", params) as Promise<TypstLiveStopOutput>,
    uninstall_integration: (params: UninstallIntegrationParams) => t.call("uninstall_integration", params) as Promise<UninstallIntegrationOutput>,
    uninstall_source_skill: (params: UninstallSourceSkillParams) => t.call("uninstall_source_skill", params) as Promise<UninstallSourceSkillOutput>,
    unlink_zotero_bib: (params: UnlinkZoteroBibParams) => t.call("unlink_zotero_bib", params) as Promise<UnlinkZoteroBibOutput>,
    unwatch_task_tree: (params: UnwatchTaskTreeParams) => t.call("unwatch_task_tree", params) as Promise<UnwatchTaskTreeOutput>,
    update_integration: (params: UpdateIntegrationParams) => t.call("update_integration", params) as Promise<UpdateIntegrationOutput>,
    update_skill_source: (params: UpdateSkillSourceParams) => t.call("update_skill_source", params) as Promise<UpdateSkillSourceOutput>,
    update_source: (params: UpdateSourceParams) => t.call("update_source", params) as Promise<UpdateSourceOutput>,
  };
}
