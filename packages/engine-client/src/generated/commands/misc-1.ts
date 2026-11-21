// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type CliActivityListParams = Record<string, never>;
export type CliActivityListOutput = null;

export type CliActivityLogParams = Record<string, never>;
export type CliActivityLogOutput = null;

export type CliActivityRunParams = Record<string, never>;
export type CliActivityRunOutput = null;

export type CliActivityShowParams = Record<string, never>;
export type CliActivityShowOutput = null;

export interface AdoptAccountWorkspaceParams {
  id: string;
  account: unknown;
}
export type AdoptAccountWorkspaceOutput = unknown;

export interface AdoptSystemSessionParams {
  provider: string;
}
export type AdoptSystemSessionOutput = unknown;

export type AdoptionCandidatesParams = Record<string, never>;
export type AdoptionCandidatesOutput = unknown[];

export interface AdoptionProofParams {
  id: string;
  nonce: string;
  org: string;
  sub: string;
}
export type AdoptionProofOutput = unknown;

export type CliAgentInstallParams = Record<string, never>;
export type CliAgentInstallOutput = null;

export type CliAgentListParams = Record<string, never>;
export type CliAgentListOutput = null;

export type CliAgentModelsParams = Record<string, never>;
export type CliAgentModelsOutput = null;

export type AgentContextParams = Record<string, never>;
export type AgentContextOutput = null;

export type AgentsviewStatusParams = Record<string, never>;
export type AgentsviewStatusOutput = unknown;

export interface AnswerQuestionParams {
  session: string;
  requestId: string;
  respuestas: unknown[];
  revision?: number | null;
}
export type AnswerQuestionOutput = unknown;

export interface AnswerShellOutputParams {
  provider: string;
  project: string;
  session: string;
  model?: string | null;
  effort?: string | null;
  permissionMode?: string | null;
}
export type AnswerShellOutputOutput = boolean;

export type ArchivedTasksParams = Record<string, never>;
export type ArchivedTasksOutput = unknown;

export interface ArtifactHistoryParams {
  path: string;
}
export type ArtifactHistoryOutput = unknown;

export interface ArtifactReadPartParams {
  referencia: unknown;
  offset: number;
  size: number;
}
export type ArtifactReadPartOutput = unknown;

export interface AskSideQuestionParams {
  project: string;
  session: string;
  question: string;
}
export type AskSideQuestionOutput = unknown;

export interface AttachKnownSourceParams {
  project: string;
  source: string;
}
export type AttachKnownSourceOutput = null;

export interface AttachRepoParams {
  project: string;
  gitHost: string;
  cloneUrl: string;
  branch?: string | null;
  name?: string | null;
}
export type AttachRepoOutput = unknown;

export const COMMANDS_MISC_1 = {
  "activity list": { kind: "cli", scope: null, authority: "admin", channel: null },
  "activity log": { kind: "cli", scope: null, authority: "admin", channel: null },
  "activity run": { kind: "cli", scope: null, authority: "admin", channel: null },
  "activity show": { kind: "cli", scope: null, authority: "admin", channel: null },
  adopt_account_workspace: { kind: "invoke", scope: null, authority: "admin", channel: null },
  adopt_system_session: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  adoption_candidates: { kind: "invoke", scope: null, authority: "admin", channel: null },
  adoption_proof: { kind: "invoke", scope: null, authority: "admin", channel: null },
  "agent install": { kind: "cli", scope: null, authority: "admin", channel: null },
  "agent list": { kind: "cli", scope: null, authority: "read", channel: null },
  "agent models": { kind: "cli", scope: null, authority: "read", channel: null },
  "agent-context": { kind: "cli", scope: null, authority: "read", channel: null },
  agentsview_status: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  answer_question: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  answer_shell_output: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  archived_tasks: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  artifact_history: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  artifact_read_part: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  ask_side_question: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  attach_known_source: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  attach_repo: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
} as const;
