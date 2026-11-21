// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { ListAccountsParams, ListAccountsOutput, ListActiveTurnsParams, ListActiveTurnsOutput, ListActivityParams, ListActivityOutput, ListAgentProfilesParams, ListAgentProfilesOutput, ListAgentStatusParams, ListAgentStatusOutput, ListAgentsParams, ListAgentsOutput, ListArchivedParams, ListArchivedOutput, ListBundledLanguagePacksParams, ListBundledLanguagePacksOutput, ListDelegatedSessionsParams, ListDelegatedSessionsOutput, ListDependenciesParams, ListDependenciesOutput, ListGitHostsParams, ListGitHostsOutput, ListGovernedMcpLoginsParams, ListGovernedMcpLoginsOutput, ListIntegrationsParams, ListIntegrationsOutput, ListKnownMcpParams, ListKnownMcpOutput, ListLanguagePacksParams, ListLanguagePacksOutput, ListLiveSessionsParams, ListLiveSessionsOutput, ListLiveTurnsParams, ListLiveTurnsOutput, ListLocalModelsParams, ListLocalModelsOutput, ListMachineAgentsParams, ListMachineAgentsOutput, ListMcpProvidersParams, ListMcpProvidersOutput, ListMcpServersParams, ListMcpServersOutput } from "../commands/list-1.ts";

export function bind_list_1(t: EngineTransport) {
  return {
    list_accounts: (params: ListAccountsParams) => t.call("list_accounts", params) as Promise<ListAccountsOutput>,
    list_active_turns: (params: ListActiveTurnsParams) => t.call("list_active_turns", params) as Promise<ListActiveTurnsOutput>,
    list_activity: (params?: ListActivityParams) => t.call("list_activity", params) as Promise<ListActivityOutput>,
    list_agent_profiles: (params: ListAgentProfilesParams) => t.call("list_agent_profiles", params) as Promise<ListAgentProfilesOutput>,
    list_agent_status: (params: ListAgentStatusParams) => t.call("list_agent_status", params) as Promise<ListAgentStatusOutput>,
    list_agents: (params: ListAgentsParams) => t.call("list_agents", params) as Promise<ListAgentsOutput>,
    list_archived: (params: ListArchivedParams) => t.call("list_archived", params) as Promise<ListArchivedOutput>,
    list_bundled_language_packs: () => t.call("list_bundled_language_packs", {}) as Promise<ListBundledLanguagePacksOutput>,
    list_delegated_sessions: (params: ListDelegatedSessionsParams) => t.call("list_delegated_sessions", params) as Promise<ListDelegatedSessionsOutput>,
    list_dependencies: (params?: ListDependenciesParams) => t.call("list_dependencies", params) as Promise<ListDependenciesOutput>,
    list_git_hosts: (params?: ListGitHostsParams) => t.call("list_git_hosts", params) as Promise<ListGitHostsOutput>,
    list_governed_mcp_logins: () => t.call("list_governed_mcp_logins", {}) as Promise<ListGovernedMcpLoginsOutput>,
    list_integrations: () => t.call("list_integrations", {}) as Promise<ListIntegrationsOutput>,
    list_known_mcp: () => t.call("list_known_mcp", {}) as Promise<ListKnownMcpOutput>,
    list_language_packs: () => t.call("list_language_packs", {}) as Promise<ListLanguagePacksOutput>,
    list_live_sessions: (params: ListLiveSessionsParams) => t.call("list_live_sessions", params) as Promise<ListLiveSessionsOutput>,
    list_live_turns: () => t.call("list_live_turns", {}) as Promise<ListLiveTurnsOutput>,
    list_local_models: () => t.call("list_local_models", {}) as Promise<ListLocalModelsOutput>,
    list_machine_agents: () => t.call("list_machine_agents", {}) as Promise<ListMachineAgentsOutput>,
    list_mcp_providers: () => t.call("list_mcp_providers", {}) as Promise<ListMcpProvidersOutput>,
    list_mcp_servers: () => t.call("list_mcp_servers", {}) as Promise<ListMcpServersOutput>,
  };
}
