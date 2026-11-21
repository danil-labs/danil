// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type CliConfigSetParams = Record<string, never>;
export type CliConfigSetOutput = null;

export interface ConnectApiKeyParams {
  provider: string;
  key: string;
}
export type ConnectApiKeyOutput = unknown;

export interface ConnectGitHostParams {
  id: string;
  data: unknown;
  token: string;
  scope?: string | null;
}
export type ConnectGitHostOutput = unknown;

export interface ConnectKnownMcpParams {
  id: string;
}
export type ConnectKnownMcpOutput = null;

export type ConsentTextParams = Record<string, never>;
export type ConsentTextOutput = [unknown[], number];

export type ContextParams = Record<string, never>;
export type ContextOutput = null;

export interface CreateAgentParams {
  name: string;
  description: string;
  instructions: string;
  scope: unknown;
}
export type CreateAgentOutput = unknown;

export interface CreateAgentThreadParams {
  project: string;
  name: string;
  title: string;
  provider: string;
  model?: string | null;
}
export type CreateAgentThreadOutput = string;

export interface CreateEmptySessionParams {
  provider: string;
  project: string;
  title: string;
  baseRef?: string | null;
  agent?: string | null;
  space?: string | null;
}
export type CreateEmptySessionOutput = unknown;

export interface CreateProjectParams {
  name: string;
  workingDirectory?: string | null;
  space?: string | null;
  id?: string | null;
  directory?: string | null;
}
export type CreateProjectOutput = unknown;

export interface CreateSpaceParams {
  name: string;
  folders?: string[] | null;
}
export type CreateSpaceOutput = unknown;

export type CliCredentialImportParams = Record<string, never>;
export type CliCredentialImportOutput = null;

export type CliCredentialPrepareParams = Record<string, never>;
export type CliCredentialPrepareOutput = null;

export interface DeleteAgentParams {
  project: string;
  name: string;
}
export type DeleteAgentOutput = null;

export interface DeleteMemoryEntryParams {
  project: string;
  scope: unknown;
  file: string;
}
export type DeleteMemoryEntryOutput = null;

export interface DeleteProjectParams {
  id: string;
}
export type DeleteProjectOutput = null;

export interface DeleteSessionParams {
  project: string;
  id: string;
  force?: boolean | null;
}
export type DeleteSessionOutput = null;

export interface DeleteSpaceParams {
  id: string;
  seen: unknown;
}
export type DeleteSpaceOutput = unknown;

export interface DetachSessionSourceParams {
  project: string;
  session: string;
  source: string;
}
export type DetachSessionSourceOutput = null;

export interface DetachSourceParams {
  project: string;
  source: string;
}
export type DetachSourceOutput = null;

export interface DiscardAccountParams {
  provider: string;
  id: string;
}
export type DiscardAccountOutput = boolean;

export const COMMANDS_MISC_3 = {
  "config set": { kind: "cli", scope: null, authority: "admin", channel: null },
  connect_api_key: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  connect_git_host: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  connect_known_mcp: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  consent_text: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  context: { kind: "cli", scope: null, authority: "read", channel: null },
  create_agent: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  create_agent_thread: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  create_empty_session: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  create_project: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  create_space: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  "credential import": { kind: "cli", scope: null, authority: "admin", channel: null },
  "credential prepare": { kind: "cli", scope: null, authority: "admin", channel: null },
  delete_agent: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  delete_memory_entry: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  delete_project: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  delete_session: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  delete_space: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  detach_session_source: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  detach_source: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  discard_account: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
} as const;
