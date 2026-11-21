// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { ListMemoryEntriesParams, ListMemoryEntriesOutput, ListMentionsParams, ListMentionsOutput, ListModelsParams, ListModelsOutput, ListPermissionModesParams, ListPermissionModesOutput, ListPortsParams, ListPortsOutput, ListProjectRepositoriesParams, ListProjectRepositoriesOutput, ListProjectsParams, ListProjectsOutput, ListProvidersParams, ListProvidersOutput, ListRadiantConnectionsParams, ListRadiantConnectionsOutput, ListRadiantWorkspacesParams, ListRadiantWorkspacesOutput, ListSessionGitParams, ListSessionGitOutput, ListSkillSourcesParams, ListSkillSourcesOutput, ListSlashMenuParams, ListSlashMenuOutput, ListSourceBranchesParams, ListSourceBranchesOutput, ListSourceSkillsParams, ListSourceSkillsOutput, ListSourcesParams, ListSourcesOutput, ListSpacesParams, ListSpacesOutput, ListStorageParams, ListStorageOutput, ListSurfacesParams, ListSurfacesOutput, ListSystemSessionsParams, ListSystemSessionsOutput, ListTaskMentionsParams, ListTaskMentionsOutput } from "../commands/list-2.ts";

export function bind_list_2(t: EngineTransport) {
  return {
    list_memory_entries: (params: ListMemoryEntriesParams) => t.call("list_memory_entries", params) as Promise<ListMemoryEntriesOutput>,
    list_mentions: (params: ListMentionsParams) => t.call("list_mentions", params) as Promise<ListMentionsOutput>,
    list_models: (params: ListModelsParams) => t.call("list_models", params) as Promise<ListModelsOutput>,
    list_permission_modes: (params: ListPermissionModesParams) => t.call("list_permission_modes", params) as Promise<ListPermissionModesOutput>,
    list_ports: () => t.call("list_ports", {}) as Promise<ListPortsOutput>,
    list_project_repositories: (params: ListProjectRepositoriesParams) => t.call("list_project_repositories", params) as Promise<ListProjectRepositoriesOutput>,
    list_projects: () => t.call("list_projects", {}) as Promise<ListProjectsOutput>,
    list_providers: () => t.call("list_providers", {}) as Promise<ListProvidersOutput>,
    list_radiant_connections: () => t.call("list_radiant_connections", {}) as Promise<ListRadiantConnectionsOutput>,
    list_radiant_workspaces: () => t.call("list_radiant_workspaces", {}) as Promise<ListRadiantWorkspacesOutput>,
    list_session_git: (params: ListSessionGitParams) => t.call("list_session_git", params) as Promise<ListSessionGitOutput>,
    list_skill_sources: () => t.call("list_skill_sources", {}) as Promise<ListSkillSourcesOutput>,
    list_slash_menu: (params: ListSlashMenuParams) => t.call("list_slash_menu", params) as Promise<ListSlashMenuOutput>,
    list_source_branches: (params: ListSourceBranchesParams) => t.call("list_source_branches", params) as Promise<ListSourceBranchesOutput>,
    list_source_skills: () => t.call("list_source_skills", {}) as Promise<ListSourceSkillsOutput>,
    list_sources: () => t.call("list_sources", {}) as Promise<ListSourcesOutput>,
    list_spaces: () => t.call("list_spaces", {}) as Promise<ListSpacesOutput>,
    list_storage: (params: ListStorageParams) => t.call("list_storage", params) as Promise<ListStorageOutput>,
    list_surfaces: () => t.call("list_surfaces", {}) as Promise<ListSurfacesOutput>,
    list_system_sessions: () => t.call("list_system_sessions", {}) as Promise<ListSystemSessionsOutput>,
    list_task_mentions: () => t.call("list_task_mentions", {}) as Promise<ListTaskMentionsOutput>,
  };
}
