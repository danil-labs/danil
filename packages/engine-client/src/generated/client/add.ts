// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { AddAccountParams, AddAccountOutput, AddFolderParams, AddFolderOutput, AddMcpServersParams, AddMcpServersOutput, AddRepoUrlParams, AddRepoUrlOutput, AddSkillSourceParams, AddSkillSourceOutput, AddWorkspaceParams, AddWorkspaceOutput } from "../commands/add.ts";

export function bind_add(t: EngineTransport) {
  return {
    add_account: (params: AddAccountParams) => t.call("add_account", params) as Promise<AddAccountOutput>,
    add_folder: (params: AddFolderParams) => t.call("add_folder", params) as Promise<AddFolderOutput>,
    add_mcp_servers: (params: AddMcpServersParams) => t.call("add_mcp_servers", params) as Promise<AddMcpServersOutput>,
    add_repo_url: (params: AddRepoUrlParams) => t.call("add_repo_url", params) as Promise<AddRepoUrlOutput>,
    add_skill_source: (params: AddSkillSourceParams) => t.call("add_skill_source", params) as Promise<AddSkillSourceOutput>,
    add_workspace: (params: AddWorkspaceParams) => t.call("add_workspace", params) as Promise<AddWorkspaceOutput>,
  };
}
