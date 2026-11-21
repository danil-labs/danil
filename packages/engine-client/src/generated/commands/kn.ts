// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface KnCloudStartParams {
  project: string;
  retry: boolean;
}
export type KnCloudStartOutput = null;

export interface KnCloudStateParams {
  project: string;
}
export type KnCloudStateOutput = unknown;

export interface KnFinishParams {
  project: string;
  session: string;
}
export type KnFinishOutput = null;

export interface KnPendingParams {
  project: string;
  session: string;
}
export type KnPendingOutput = unknown;

export interface KnStatusParams {
  project: string;
  session: string;
}
export type KnStatusOutput = unknown[];

export interface KnUpdateParams {
  project: string;
  session: string;
}
export type KnUpdateOutput = null;

export const COMMANDS_KN = {
  kn_cloud_start: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  kn_cloud_state: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  kn_finish: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  kn_pending: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  kn_status: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  kn_update: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
} as const;
