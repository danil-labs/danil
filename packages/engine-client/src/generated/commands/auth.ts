// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type CliAuthCancelParams = Record<string, never>;
export type CliAuthCancelOutput = null;

export type CliAuthCodeParams = Record<string, never>;
export type CliAuthCodeOutput = null;

export type CliAuthLoginParams = Record<string, never>;
export type CliAuthLoginOutput = null;

export type CliAuthLogoutParams = Record<string, never>;
export type CliAuthLogoutOutput = null;

export type CliAuthProvidersParams = Record<string, never>;
export type CliAuthProvidersOutput = null;

export type CliAuthStatusParams = Record<string, never>;
export type CliAuthStatusOutput = null;

export const COMMANDS_AUTH = {
  "auth cancel": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "auth code": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "auth login": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "auth logout": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "auth providers": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "auth status": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
} as const;
