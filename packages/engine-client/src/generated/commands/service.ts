// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type CliServiceEventsParams = Record<string, never>;
export type CliServiceEventsOutput = null;

export type CliServiceHistoryParams = Record<string, never>;
export type CliServiceHistoryOutput = null;

export type CliServiceInvokeParams = Record<string, never>;
export type CliServiceInvokeOutput = null;

export type CliServiceRelayParams = Record<string, never>;
export type CliServiceRelayOutput = null;

export type CliServiceStopParams = Record<string, never>;
export type CliServiceStopOutput = null;

export type CliServiceStreamCancelParams = Record<string, never>;
export type CliServiceStreamCancelOutput = null;

export type CliServiceStreamReadParams = Record<string, never>;
export type CliServiceStreamReadOutput = null;

export type CliServiceStreamStartParams = Record<string, never>;
export type CliServiceStreamStartOutput = null;

export type CliServiceSubscribeParams = Record<string, never>;
export type CliServiceSubscribeOutput = null;

export type CliServiceSubscriptionUpdateParams = Record<string, never>;
export type CliServiceSubscriptionUpdateOutput = null;

export type CliServiceUnsubscribeParams = Record<string, never>;
export type CliServiceUnsubscribeOutput = null;

export type ServiceCancelUpdateParams = Record<string, never>;
export type ServiceCancelUpdateOutput = unknown;

export interface ServicePollParams {
  cursor?: number | null;
  workspace?: string | null;
  replay: boolean;
  runtime?: string | null;
  setup?: boolean | null;
}
export type ServicePollOutput = unknown;

export type ServicePrepareUpdateParams = Record<string, never>;
export type ServicePrepareUpdateOutput = unknown;

export const COMMANDS_SERVICE = {
  "service events": { kind: "rpc", scope: null, authority: "admin", channel: null, relay: true },
  "service history": { kind: "rpc", scope: null, authority: "admin", channel: null, relay: true },
  "service invoke": { kind: "rpc", scope: null, authority: "admin", channel: null, relay: true },
  "service relay": { kind: "rpc", scope: null, authority: "admin", channel: null, relay: false },
  "service stop": { kind: "cli", scope: null, authority: "admin", channel: null, relay: false },
  "service stream cancel": { kind: "rpc", scope: null, authority: "admin", channel: null, relay: true },
  "service stream read": { kind: "rpc", scope: null, authority: "admin", channel: null, relay: true },
  "service stream start": { kind: "rpc", scope: null, authority: "admin", channel: null, relay: true },
  "service subscribe": { kind: "rpc", scope: null, authority: "admin", channel: null, relay: false },
  "service subscription update": { kind: "rpc", scope: null, authority: "admin", channel: null, relay: false },
  "service unsubscribe": { kind: "rpc", scope: null, authority: "admin", channel: null, relay: false },
  service_cancel_update: { kind: "desktop", scope: null, authority: "admin", channel: null, relay: true },
  service_poll: { kind: "desktop", scope: null, authority: "admin", channel: null, relay: true },
  service_prepare_update: { kind: "desktop", scope: null, authority: "admin", channel: null, relay: true },
} as const;
