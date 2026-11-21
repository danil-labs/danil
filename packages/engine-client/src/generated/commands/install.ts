// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface InstallBaseToolParams {
  tool: string;
}
export type InstallBaseToolOutput = string;

export interface InstallBundledLanguagePackParams {
  code: string;
}
export type InstallBundledLanguagePackOutput = unknown;

export type InstallGhParams = Record<string, never>;
export type InstallGhOutput = string;

export type InstallGoogleDriveParams = Record<string, never>;
export type InstallGoogleDriveOutput = null;

export type InstallGoogleDriveDesktopParams = Record<string, never>;
export type InstallGoogleDriveDesktopOutput = null;

export interface InstallIntegrationParams {
  id: unknown;
}
export type InstallIntegrationOutput = null;

export interface InstallLanguagePackParams {
  source: string;
}
export type InstallLanguagePackOutput = unknown;

export interface InstallLocalModelParams {
  id: string;
}
export type InstallLocalModelOutput = null;

export type InstallLocalRuntimeParams = Record<string, never>;
export type InstallLocalRuntimeOutput = null;

export interface InstallProviderParams {
  provider: string;
}
export type InstallProviderOutput = string;

export interface InstallSizeParams {
  operation: string;
}
export type InstallSizeOutput = number;

export interface InstallToolParams {
  tool: string;
}
export type InstallToolOutput = string;

export type InstallZoteroParams = Record<string, never>;
export type InstallZoteroOutput = null;

export const COMMANDS_INSTALL = {
  install_base_tool: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
  install_bundled_language_pack: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
  install_gh: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
  install_google_drive: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
  install_google_drive_desktop: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
  install_integration: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
  install_language_pack: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
  install_local_model: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
  install_local_runtime: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
  install_provider: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
  install_size: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  install_tool: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
  install_zotero: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
} as const;
