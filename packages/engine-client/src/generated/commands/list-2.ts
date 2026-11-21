// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type ListMcpServersParams = Record<string, never>;
export type ListMcpServersOutput = unknown[];

export interface ListMemoryEntriesParams {
  project: string;
  scope: unknown;
}
export type ListMemoryEntriesOutput = unknown;

export interface ListMentionsParams {
  project: string;
  sources?: string[] | null;
  excludedSources?: string[] | null;
  session?: string | null;
}
export type ListMentionsOutput = unknown;

export interface ListModelsParams {
  provider: string;
}
export type ListModelsOutput = unknown;

export interface ListPermissionModesParams {
  provider: string;
}
export type ListPermissionModesOutput = unknown[];

export type ListPortsParams = Record<string, never>;
export type ListPortsOutput = unknown;

export interface ListProjectRepositoriesParams {
  workspace: string;
}
export type ListProjectRepositoriesOutput = unknown[];

export type ListProjectsParams = Record<string, never>;
export type ListProjectsOutput = unknown[];

export type ListProvidersParams = Record<string, never>;
export type ListProvidersOutput = unknown[];

export type ListRadiantConnectionsParams = Record<string, never>;
export type ListRadiantConnectionsOutput = unknown[];

export type ListRadiantWorkspacesParams = Record<string, never>;
export type ListRadiantWorkspacesOutput = unknown[];

export interface ListSessionGitParams {
  project: string;
  remote: boolean;
  priority?: string[] | null;
}
export type ListSessionGitOutput = unknown;

export type ListSkillSourcesParams = Record<string, never>;
export type ListSkillSourcesOutput = unknown;

export interface ListSlashMenuParams {
  provider: string;
}
export type ListSlashMenuOutput = unknown;

export interface ListSourceBranchesParams {
  source: string;
}
export type ListSourceBranchesOutput = string[];

export type ListSourceSkillsParams = Record<string, never>;
export type ListSourceSkillsOutput = unknown[];

export type ListSourcesParams = Record<string, never>;
export type ListSourcesOutput = unknown[];

export type ListSpacesParams = Record<string, never>;
export type ListSpacesOutput = unknown[];

export interface ListStorageParams {
  refrescar: boolean;
}
export type ListStorageOutput = unknown;

export type ListSurfacesParams = Record<string, never>;
export type ListSurfacesOutput = unknown[];

export type ListSystemSessionsParams = Record<string, never>;
export type ListSystemSessionsOutput = unknown[];

export const COMMANDS_LIST_2 = {
  list_mcp_servers: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  list_memory_entries: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  list_mentions: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  list_models: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  list_permission_modes: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  list_ports: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  list_project_repositories: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  list_projects: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  list_providers: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  list_radiant_connections: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  list_radiant_workspaces: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  list_session_git: { kind: "stream", scope: "workspace", authority: "admin", channel: "progress" },
  list_skill_sources: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  list_slash_menu: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  list_source_branches: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  list_source_skills: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  list_sources: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  list_spaces: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  list_storage: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  list_surfaces: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  list_system_sessions: { kind: "invoke", scope: "machine", authority: "admin", channel: null },
} as const;
