// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface RemoveAccountParams {
  provider: string;
  id: string;
}
export type RemoveAccountOutput = null;

export interface RemoveAccountProjectParams {
  id: string;
}
export type RemoveAccountProjectOutput = null;

export type RemoveGhParams = Record<string, never>;
export type RemoveGhOutput = null;

export type RemoveGoogleDriveParams = Record<string, never>;
export type RemoveGoogleDriveOutput = null;

export interface RemoveLanguagePackParams {
  code: string;
}
export type RemoveLanguagePackOutput = null;

export interface RemoveLocalModelParams {
  id: string;
}
export type RemoveLocalModelOutput = null;

export type RemoveLocalRuntimeParams = Record<string, never>;
export type RemoveLocalRuntimeOutput = null;

export interface RemoveMcpServerParams {
  name: string;
}
export type RemoveMcpServerOutput = null;

export interface RemoveProviderParams {
  provider: string;
}
export type RemoveProviderOutput = null;

export interface RemoveSkillSourceParams {
  id: string;
}
export type RemoveSkillSourceOutput = unknown;

export interface RemoveSourceParams {
  source: string;
}
export type RemoveSourceOutput = null;

export interface RemoveToolParams {
  tool: string;
}
export type RemoveToolOutput = null;

export interface RemoveWorkspaceParams {
  id: string;
}
export type RemoveWorkspaceOutput = null;

export const COMMANDS_REMOVE = {
  remove_account: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  remove_account_project: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  remove_gh: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
  remove_google_drive: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
  remove_language_pack: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
  remove_local_model: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
  remove_local_runtime: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
  remove_mcp_server: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  remove_provider: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
  remove_skill_source: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  remove_source: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  remove_tool: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
  remove_workspace: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
} as const;
