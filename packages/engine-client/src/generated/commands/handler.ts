// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type CliHandlerApproveParams = Record<string, never>;
export type CliHandlerApproveOutput = null;

export type CliHandlerCreateParams = Record<string, never>;
export type CliHandlerCreateOutput = null;

export type CliHandlerListParams = Record<string, never>;
export type CliHandlerListOutput = null;

export type CliHandlerMigrateMemoryParams = Record<string, never>;
export type CliHandlerMigrateMemoryOutput = null;

export type CliHandlerNewThreadParams = Record<string, never>;
export type CliHandlerNewThreadOutput = null;

export type CliHandlerReleaseParams = Record<string, never>;
export type CliHandlerReleaseOutput = null;

export type CliHandlerRequestsParams = Record<string, never>;
export type CliHandlerRequestsOutput = null;

export type CliHandlerRevokeParams = Record<string, never>;
export type CliHandlerRevokeOutput = null;

export type CliHandlerSendParams = Record<string, never>;
export type CliHandlerSendOutput = null;

export type CliHandlerShowParams = Record<string, never>;
export type CliHandlerShowOutput = null;

export type CliHandlerThreadsParams = Record<string, never>;
export type CliHandlerThreadsOutput = null;

export type CliHandlerUpdateParams = Record<string, never>;
export type CliHandlerUpdateOutput = null;

export type CliHandlerValidateParams = Record<string, never>;
export type CliHandlerValidateOutput = null;

export const COMMANDS_HANDLER = {
  "handler approve": { kind: "cli", scope: null, authority: "admin", channel: null },
  "handler create": { kind: "cli", scope: null, authority: "admin", channel: null },
  "handler list": { kind: "cli", scope: null, authority: "read", channel: null },
  "handler migrate-memory": { kind: "cli", scope: null, authority: "admin", channel: null },
  "handler new-thread": { kind: "cli", scope: null, authority: "task", channel: null },
  "handler release": { kind: "cli", scope: null, authority: "admin", channel: null },
  "handler requests": { kind: "cli", scope: null, authority: "read", channel: null },
  "handler revoke": { kind: "cli", scope: null, authority: "admin", channel: null },
  "handler send": { kind: "cli", scope: null, authority: "task", channel: null },
  "handler show": { kind: "cli", scope: null, authority: "read", channel: null },
  "handler threads": { kind: "cli", scope: null, authority: "read", channel: null },
  "handler update": { kind: "cli", scope: null, authority: "admin", channel: null },
  "handler validate": { kind: "cli", scope: null, authority: "read", channel: null },
} as const;
