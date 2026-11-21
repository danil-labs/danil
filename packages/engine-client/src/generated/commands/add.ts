// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface AddAccountParams {
  provider: string;
  label: string;
}
export type AddAccountOutput = unknown;

export interface AddFolderParams {
  locator: string;
}
export type AddFolderOutput = unknown;

export interface AddMcpServersParams {
  bloque: string;
}
export type AddMcpServersOutput = number;

export interface AddRepoUrlParams {
  cloneUrl: string;
  branch?: string | null;
}
export type AddRepoUrlOutput = unknown;

export interface AddSkillSourceParams {
  url: string;
  branch?: string | null;
  rotulo: unknown;
  gitHost?: string | null;
}
export type AddSkillSourceOutput = unknown;

export interface AddWorkspaceParams {
  name: string;
  folder?: string | null;
  gitHost?: string | null;
  remote?: string | null;
  id?: string | null;
}
export type AddWorkspaceOutput = unknown;

export const COMMANDS_ADD = {
  add_account: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  add_folder: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  add_mcp_servers: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  add_repo_url: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  add_skill_source: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  add_workspace: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
} as const;
