// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { CliActivityListParams, CliActivityListOutput, CliActivityLogParams, CliActivityLogOutput, CliActivityRunParams, CliActivityRunOutput, CliActivityShowParams, CliActivityShowOutput, AdoptSystemSessionParams, AdoptSystemSessionOutput, CliAgentInstallParams, CliAgentInstallOutput, CliAgentListParams, CliAgentListOutput, CliAgentModelsParams, CliAgentModelsOutput, AgentContextParams, AgentContextOutput, AgentsviewStatusParams, AgentsviewStatusOutput, AnswerQuestionParams, AnswerQuestionOutput, AnswerShellOutputParams, AnswerShellOutputOutput, ArchivedTasksParams, ArchivedTasksOutput, ArtifactHistoryParams, ArtifactHistoryOutput, AskSideQuestionParams, AskSideQuestionOutput, AttachKnownSourceParams, AttachKnownSourceOutput, AttachRepoParams, AttachRepoOutput, AttachmentPreviewParams, AttachmentPreviewOutput, BackupTaskWorkParams, BackupTaskWorkOutput, CallMcpAppToolParams, CallMcpAppToolOutput, ChangeAgentFoldersParams, ChangeAgentFoldersOutput } from "../commands/misc-1.ts";

export function bind_misc_1(t: EngineTransport) {
  return {
    "activity list": () => t.call("activity list", {}) as Promise<CliActivityListOutput>,
    "activity log": () => t.call("activity log", {}) as Promise<CliActivityLogOutput>,
    "activity run": () => t.call("activity run", {}) as Promise<CliActivityRunOutput>,
    "activity show": () => t.call("activity show", {}) as Promise<CliActivityShowOutput>,
    adopt_system_session: (params: AdoptSystemSessionParams) => t.call("adopt_system_session", params) as Promise<AdoptSystemSessionOutput>,
    "agent install": () => t.call("agent install", {}) as Promise<CliAgentInstallOutput>,
    "agent list": () => t.call("agent list", {}) as Promise<CliAgentListOutput>,
    "agent models": () => t.call("agent models", {}) as Promise<CliAgentModelsOutput>,
    "agent-context": () => t.call("agent-context", {}) as Promise<AgentContextOutput>,
    agentsview_status: () => t.call("agentsview_status", {}) as Promise<AgentsviewStatusOutput>,
    answer_question: (params: AnswerQuestionParams) => t.call("answer_question", params) as Promise<AnswerQuestionOutput>,
    answer_shell_output: (params: AnswerShellOutputParams) => t.call("answer_shell_output", params) as Promise<AnswerShellOutputOutput>,
    archived_tasks: () => t.call("archived_tasks", {}) as Promise<ArchivedTasksOutput>,
    artifact_history: (params: ArtifactHistoryParams) => t.call("artifact_history", params) as Promise<ArtifactHistoryOutput>,
    ask_side_question: (params: AskSideQuestionParams) => t.call("ask_side_question", params) as Promise<AskSideQuestionOutput>,
    attach_known_source: (params: AttachKnownSourceParams) => t.call("attach_known_source", params) as Promise<AttachKnownSourceOutput>,
    attach_repo: (params: AttachRepoParams) => t.call("attach_repo", params) as Promise<AttachRepoOutput>,
    attachment_preview: (params: AttachmentPreviewParams) => t.call("attachment_preview", params) as Promise<AttachmentPreviewOutput>,
    backup_task_work: (params: BackupTaskWorkParams) => t.call("backup_task_work", params) as Promise<BackupTaskWorkOutput>,
    call_mcp_app_tool: (params: CallMcpAppToolParams) => t.call("call_mcp_app_tool", params) as Promise<CallMcpAppToolOutput>,
    change_agent_folders: (params: ChangeAgentFoldersParams) => t.call("change_agent_folders", params) as Promise<ChangeAgentFoldersOutput>,
  };
}
