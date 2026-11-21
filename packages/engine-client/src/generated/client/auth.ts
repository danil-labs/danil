// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { CliAuthCancelParams, CliAuthCancelOutput, CliAuthCodeParams, CliAuthCodeOutput, CliAuthLoginParams, CliAuthLoginOutput, CliAuthLogoutParams, CliAuthLogoutOutput, CliAuthProvidersParams, CliAuthProvidersOutput, CliAuthStatusParams, CliAuthStatusOutput } from "../commands/auth.ts";

export function bind_auth(t: EngineTransport) {
  return {
    "auth cancel": () => t.call("auth cancel", {}) as Promise<CliAuthCancelOutput>,
    "auth code": () => t.call("auth code", {}) as Promise<CliAuthCodeOutput>,
    "auth login": () => t.call("auth login", {}) as Promise<CliAuthLoginOutput>,
    "auth logout": () => t.call("auth logout", {}) as Promise<CliAuthLogoutOutput>,
    "auth providers": () => t.call("auth providers", {}) as Promise<CliAuthProvidersOutput>,
    "auth status": () => t.call("auth status", {}) as Promise<CliAuthStatusOutput>,
  };
}
