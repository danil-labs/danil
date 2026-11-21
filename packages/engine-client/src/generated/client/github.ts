// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { CliGithubInstallParams, CliGithubInstallOutput, CliGithubStatusParams, CliGithubStatusOutput, GithubAccountAuthorizeParams, GithubAccountAuthorizeOutput, GithubAccountChangedParams, GithubAccountChangedOutput, GithubAccountDisconnectParams, GithubAccountDisconnectOutput, GithubAccountInstallationsParams, GithubAccountInstallationsOutput, GithubAccountSetAreasParams, GithubAccountSetAreasOutput, GithubAccountStatusParams, GithubAccountStatusOutput } from "../commands/github.ts";

export function bind_github(t: EngineTransport) {
  return {
    "github install": () => t.call("github install", {}) as Promise<CliGithubInstallOutput>,
    "github status": () => t.call("github status", {}) as Promise<CliGithubStatusOutput>,
    github_account_authorize: (params?: GithubAccountAuthorizeParams) => t.call("github_account_authorize", params) as Promise<GithubAccountAuthorizeOutput>,
    github_account_changed: (params: GithubAccountChangedParams) => t.call("github_account_changed", params) as Promise<GithubAccountChangedOutput>,
    github_account_disconnect: (params?: GithubAccountDisconnectParams) => t.call("github_account_disconnect", params) as Promise<GithubAccountDisconnectOutput>,
    github_account_installations: (params?: GithubAccountInstallationsParams) => t.call("github_account_installations", params) as Promise<GithubAccountInstallationsOutput>,
    github_account_set_areas: (params: GithubAccountSetAreasParams) => t.call("github_account_set_areas", params) as Promise<GithubAccountSetAreasOutput>,
    github_account_status: (params?: GithubAccountStatusParams) => t.call("github_account_status", params) as Promise<GithubAccountStatusOutput>,
  };
}
