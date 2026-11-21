// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { InstallBaseToolParams, InstallBaseToolOutput, InstallBundledLanguagePackParams, InstallBundledLanguagePackOutput, InstallGhParams, InstallGhOutput, InstallGoogleDriveParams, InstallGoogleDriveOutput, InstallGoogleDriveDesktopParams, InstallGoogleDriveDesktopOutput, InstallIntegrationParams, InstallIntegrationOutput, InstallLanguagePackParams, InstallLanguagePackOutput, InstallLocalModelParams, InstallLocalModelOutput, InstallLocalRuntimeParams, InstallLocalRuntimeOutput, InstallProviderParams, InstallProviderOutput, InstallSizeParams, InstallSizeOutput, InstallToolParams, InstallToolOutput, InstallZoteroParams, InstallZoteroOutput } from "../commands/install.ts";

export function bind_install(t: EngineTransport) {
  return {
    install_base_tool: (params: InstallBaseToolParams) => t.call("install_base_tool", params) as Promise<InstallBaseToolOutput>,
    install_bundled_language_pack: (params: InstallBundledLanguagePackParams) => t.call("install_bundled_language_pack", params) as Promise<InstallBundledLanguagePackOutput>,
    install_gh: () => t.call("install_gh", {}) as Promise<InstallGhOutput>,
    install_google_drive: () => t.call("install_google_drive", {}) as Promise<InstallGoogleDriveOutput>,
    install_google_drive_desktop: () => t.call("install_google_drive_desktop", {}) as Promise<InstallGoogleDriveDesktopOutput>,
    install_integration: (params: InstallIntegrationParams) => t.call("install_integration", params) as Promise<InstallIntegrationOutput>,
    install_language_pack: (params: InstallLanguagePackParams) => t.call("install_language_pack", params) as Promise<InstallLanguagePackOutput>,
    install_local_model: (params: InstallLocalModelParams) => t.call("install_local_model", params) as Promise<InstallLocalModelOutput>,
    install_local_runtime: () => t.call("install_local_runtime", {}) as Promise<InstallLocalRuntimeOutput>,
    install_provider: (params: InstallProviderParams) => t.call("install_provider", params) as Promise<InstallProviderOutput>,
    install_size: (params: InstallSizeParams) => t.call("install_size", params) as Promise<InstallSizeOutput>,
    install_tool: (params: InstallToolParams) => t.call("install_tool", params) as Promise<InstallToolOutput>,
    install_zotero: () => t.call("install_zotero", {}) as Promise<InstallZoteroOutput>,
  };
}
