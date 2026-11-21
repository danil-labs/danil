// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type CliPluginCheckParams = Record<string, never>;
export type CliPluginCheckOutput = null;

export type CliPluginDisableParams = Record<string, never>;
export type CliPluginDisableOutput = null;

export type CliPluginEnableParams = Record<string, never>;
export type CliPluginEnableOutput = null;

export type CliPluginInstallParams = Record<string, never>;
export type CliPluginInstallOutput = null;

export type CliPluginListParams = Record<string, never>;
export type CliPluginListOutput = null;

export type CliPluginUninstallParams = Record<string, never>;
export type CliPluginUninstallOutput = null;

export type CliPluginUpdateParams = Record<string, never>;
export type CliPluginUpdateOutput = null;

export const COMMANDS_PLUGIN = {
  "plugin check": { kind: "cli", scope: null, authority: "read", channel: null, relay: false },
  "plugin disable": { kind: "cli", scope: null, authority: "catalog", channel: null, relay: false },
  "plugin enable": { kind: "cli", scope: null, authority: "catalog", channel: null, relay: false },
  "plugin install": { kind: "cli", scope: null, authority: "catalog", channel: null, relay: false },
  "plugin list": { kind: "cli", scope: null, authority: "read", channel: null, relay: false },
  "plugin uninstall": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "plugin update": { kind: "cli", scope: null, authority: "catalog", channel: null, relay: false },
} as const;
