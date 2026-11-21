// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type CliGithubInstallParams = Record<string, never>;
export type CliGithubInstallOutput = null;

export type CliGithubStatusParams = Record<string, never>;
export type CliGithubStatusOutput = null;

export interface GithubAccountAuthorizeParams {
  scope?: string | null;
}
export type GithubAccountAuthorizeOutput = unknown;

export interface GithubAccountChangedParams {
  id: string;
}
export type GithubAccountChangedOutput = null;

export interface GithubAccountDisconnectParams {
  scope?: string | null;
}
export type GithubAccountDisconnectOutput = null;

export interface GithubAccountInstallationsParams {
  scope?: string | null;
}
export type GithubAccountInstallationsOutput = unknown;

export interface GithubAccountSetAreasParams {
  scope?: string | null;
  areas: unknown[];
}
export type GithubAccountSetAreasOutput = unknown;

export interface GithubAccountStatusParams {
  scope?: string | null;
}
export type GithubAccountStatusOutput = unknown;

export const COMMANDS_GITHUB = {
  "github install": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "github status": { kind: "cli", scope: null, authority: "read", channel: null, relay: false },
  github_account_authorize: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  github_account_changed: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  github_account_disconnect: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  github_account_installations: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  github_account_set_areas: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  github_account_status: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
} as const;
