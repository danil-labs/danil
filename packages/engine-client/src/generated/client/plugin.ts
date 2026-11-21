// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { CliPluginCheckParams, CliPluginCheckOutput, CliPluginDisableParams, CliPluginDisableOutput, CliPluginEnableParams, CliPluginEnableOutput, CliPluginInstallParams, CliPluginInstallOutput, CliPluginListParams, CliPluginListOutput, CliPluginUninstallParams, CliPluginUninstallOutput, CliPluginUpdateParams, CliPluginUpdateOutput } from "../commands/plugin.ts";

export function bind_plugin(t: EngineTransport) {
  return {
    "plugin check": () => t.call("plugin check", {}) as Promise<CliPluginCheckOutput>,
    "plugin disable": () => t.call("plugin disable", {}) as Promise<CliPluginDisableOutput>,
    "plugin enable": () => t.call("plugin enable", {}) as Promise<CliPluginEnableOutput>,
    "plugin install": () => t.call("plugin install", {}) as Promise<CliPluginInstallOutput>,
    "plugin list": () => t.call("plugin list", {}) as Promise<CliPluginListOutput>,
    "plugin uninstall": () => t.call("plugin uninstall", {}) as Promise<CliPluginUninstallOutput>,
    "plugin update": () => t.call("plugin update", {}) as Promise<CliPluginUpdateOutput>,
  };
}
