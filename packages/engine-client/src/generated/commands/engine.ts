// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type CliEngineStartParams = Record<string, never>;
export type CliEngineStartOutput = null;

export type CliEngineStatusParams = Record<string, never>;
export type CliEngineStatusOutput = null;

export type CliEngineStopParams = Record<string, never>;
export type CliEngineStopOutput = null;

export type EngineAdoptionRetryParams = Record<string, never>;
export type EngineAdoptionRetryOutput = unknown;

export type EngineAdoptionStatusParams = Record<string, never>;
export type EngineAdoptionStatusOutput = unknown;

export interface EngineUpdateParams {
  release?: string | null;
  force?: boolean | null;
}
export type EngineUpdateOutput = unknown;

export interface EngineUpdateStatusParams {
  refresh?: boolean | null;
}
export type EngineUpdateStatusOutput = unknown;

export const COMMANDS_ENGINE = {
  "engine start": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "engine status": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "engine stop": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  engine_adoption_retry: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  engine_adoption_status: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  engine_update: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
  engine_update_status: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
} as const;
