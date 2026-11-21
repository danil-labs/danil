// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface CloseMcpAppParams {
  connectionId: string;
}
export type CloseMcpAppOutput = null;

export interface ClosePortParams {
  session: string;
  pid: number;
  puerto: number;
}
export type ClosePortOutput = unknown;

export interface CloseProcessParams {
  session: string;
  pid: number;
}
export type CloseProcessOutput = unknown;

export type CollectOrphansParams = Record<string, never>;
export type CollectOrphansOutput = unknown;

export type CliConfigGetParams = Record<string, never>;
export type CliConfigGetOutput = null;

export type CliConfigSetParams = Record<string, never>;
export type CliConfigSetOutput = null;

export interface ConnectApiKeyParams {
  provider: string;
  key: string;
}
export type ConnectApiKeyOutput = unknown;

export interface ConnectExternalParams {
  workspace: string;
  folder?: string | null;
  connection: string;
  label: string;
  permissionMode?: string | null;
}
export type ConnectExternalOutput = unknown;

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

export interface ConnectionCallParams {
  workspace: string;
  connection: string;
  command: string;
  args?: unknown | null;
  requestId?: string | null;
}
export type ConnectionCallOutput = unknown;

export type ConsentTextParams = Record<string, never>;
export type ConsentTextOutput = [unknown[], number];

export type ContextParams = Record<string, never>;
export type ContextOutput = null;

export type CliCredentialImportParams = Record<string, never>;
export type CliCredentialImportOutput = null;

export type CliCredentialPrepareParams = Record<string, never>;
export type CliCredentialPrepareOutput = null;

export interface CreditsPilotInstallParams {
  workspaceId: string;
  action: string;
  capability?: string | null;
  endpoint?: string | null;
  expiresAt?: number | null;
}
export type CreditsPilotInstallOutput = unknown;

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

export const COMMANDS_MISC_3 = {
  close_mcp_app: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  close_port: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  close_process: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  collect_orphans: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  "config get": { kind: "cli", scope: null, authority: "read", channel: null },
  "config set": { kind: "cli", scope: null, authority: "admin", channel: null },
  connect_api_key: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
  connect_external: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  connect_git_host: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  connect_known_mcp: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  connection_call: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  consent_text: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  context: { kind: "cli", scope: null, authority: "read", channel: null },
  "credential import": { kind: "cli", scope: null, authority: "admin", channel: null },
  "credential prepare": { kind: "cli", scope: null, authority: "admin", channel: null },
  credits_pilot_install: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  delete_agent: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  delete_memory_entry: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  delete_project: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  delete_session: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  delete_space: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
} as const;
