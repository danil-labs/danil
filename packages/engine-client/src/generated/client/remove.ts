// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { RemoveAccountParams, RemoveAccountOutput, RemoveGhParams, RemoveGhOutput, RemoveGoogleDriveParams, RemoveGoogleDriveOutput, RemoveLanguagePackParams, RemoveLanguagePackOutput, RemoveLocalModelParams, RemoveLocalModelOutput, RemoveLocalRuntimeParams, RemoveLocalRuntimeOutput, RemoveMcpServerParams, RemoveMcpServerOutput, RemoveProviderParams, RemoveProviderOutput, RemoveSkillSourceParams, RemoveSkillSourceOutput, RemoveSourceParams, RemoveSourceOutput, RemoveToolParams, RemoveToolOutput, RemoveWorkspaceParams, RemoveWorkspaceOutput } from "../commands/remove.ts";

export function bind_remove(t: EngineTransport) {
  return {
    remove_account: (params: RemoveAccountParams) => t.call("remove_account", params) as Promise<RemoveAccountOutput>,
    remove_gh: () => t.call("remove_gh", {}) as Promise<RemoveGhOutput>,
    remove_google_drive: () => t.call("remove_google_drive", {}) as Promise<RemoveGoogleDriveOutput>,
    remove_language_pack: (params: RemoveLanguagePackParams) => t.call("remove_language_pack", params) as Promise<RemoveLanguagePackOutput>,
    remove_local_model: (params: RemoveLocalModelParams) => t.call("remove_local_model", params) as Promise<RemoveLocalModelOutput>,
    remove_local_runtime: () => t.call("remove_local_runtime", {}) as Promise<RemoveLocalRuntimeOutput>,
    remove_mcp_server: (params: RemoveMcpServerParams) => t.call("remove_mcp_server", params) as Promise<RemoveMcpServerOutput>,
    remove_provider: (params: RemoveProviderParams) => t.call("remove_provider", params) as Promise<RemoveProviderOutput>,
    remove_skill_source: (params: RemoveSkillSourceParams) => t.call("remove_skill_source", params) as Promise<RemoveSkillSourceOutput>,
    remove_source: (params: RemoveSourceParams) => t.call("remove_source", params) as Promise<RemoveSourceOutput>,
    remove_tool: (params: RemoveToolParams) => t.call("remove_tool", params) as Promise<RemoveToolOutput>,
    remove_workspace: (params: RemoveWorkspaceParams) => t.call("remove_workspace", params) as Promise<RemoveWorkspaceOutput>,
  };
}
