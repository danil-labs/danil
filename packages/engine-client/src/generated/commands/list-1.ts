// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface ListAccountsParams {
  provider: string;
}
export type ListAccountsOutput = unknown;

export interface ListActiveTurnsParams {
  workspace: string;
}
export type ListActiveTurnsOutput = string[];

export interface ListActivityParams {
  project?: string | null;
}
export type ListActivityOutput = unknown[];

export interface ListAgentProfilesParams {
  project: string;
}
export type ListAgentProfilesOutput = Record<string, unknown>;

export interface ListAgentStatusParams {
  project: string;
}
export type ListAgentStatusOutput = unknown[];

export interface ListAgentsParams {
  project: string;
}
export type ListAgentsOutput = unknown;

export interface ListArchivedParams {
  project: string;
}
export type ListArchivedOutput = unknown[];

export type ListBundledLanguagePacksParams = Record<string, never>;
export type ListBundledLanguagePacksOutput = unknown[];

export interface ListDelegatedSessionsParams {
  project: string;
  id: string;
}
export type ListDelegatedSessionsOutput = unknown[];

export interface ListDependenciesParams {
  force?: boolean | null;
}
export type ListDependenciesOutput = unknown[];

export interface ListGitHostsParams {
  scope?: string | null;
}
export type ListGitHostsOutput = unknown[];

export type ListGovernedMcpLoginsParams = Record<string, never>;
export type ListGovernedMcpLoginsOutput = unknown[];

export type ListIntegrationsParams = Record<string, never>;
export type ListIntegrationsOutput = unknown;

export type ListKnownMcpParams = Record<string, never>;
export type ListKnownMcpOutput = unknown[];

export type ListLanguagePacksParams = Record<string, never>;
export type ListLanguagePacksOutput = unknown[];

export interface ListLiveSessionsParams {
  project: string;
  open?: string[] | null;
}
export type ListLiveSessionsOutput = unknown[];

export type ListLiveTurnsParams = Record<string, never>;
export type ListLiveTurnsOutput = unknown[];

export type ListLocalModelsParams = Record<string, never>;
export type ListLocalModelsOutput = unknown[];

export interface ListLocalOrchestratorsParams {
  workspace: string;
}
export type ListLocalOrchestratorsOutput = unknown;

export type ListMachineAgentsParams = Record<string, never>;
export type ListMachineAgentsOutput = unknown;

export type ListMcpProvidersParams = Record<string, never>;
export type ListMcpProvidersOutput = unknown[];

export const COMMANDS_LIST_1 = {
  list_accounts: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  list_active_turns: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  list_activity: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  list_agent_profiles: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  list_agent_status: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  list_agents: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  list_archived: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  list_bundled_language_packs: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  list_delegated_sessions: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  list_dependencies: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  list_git_hosts: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  list_governed_mcp_logins: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  list_integrations: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  list_known_mcp: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  list_language_packs: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  list_live_sessions: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  list_live_turns: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  list_local_models: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  list_local_orchestrators: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  list_machine_agents: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  list_mcp_providers: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
} as const;
