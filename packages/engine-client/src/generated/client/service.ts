// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { CliServiceEventsParams, CliServiceEventsOutput, CliServiceHistoryParams, CliServiceHistoryOutput, CliServiceInvokeParams, CliServiceInvokeOutput, CliServiceRelayParams, CliServiceRelayOutput, CliServiceStopParams, CliServiceStopOutput, CliServiceStreamCancelParams, CliServiceStreamCancelOutput, CliServiceStreamReadParams, CliServiceStreamReadOutput, CliServiceStreamStartParams, CliServiceStreamStartOutput, CliServiceSubscribeParams, CliServiceSubscribeOutput, CliServiceSubscriptionUpdateParams, CliServiceSubscriptionUpdateOutput, CliServiceUnsubscribeParams, CliServiceUnsubscribeOutput, ServiceCancelUpdateParams, ServiceCancelUpdateOutput, ServicePollParams, ServicePollOutput, ServicePrepareUpdateParams, ServicePrepareUpdateOutput } from "../commands/service.ts";

export function bind_service(t: EngineTransport) {
  return {
    "service events": () => t.call("service events", {}) as Promise<CliServiceEventsOutput>,
    "service history": () => t.call("service history", {}) as Promise<CliServiceHistoryOutput>,
    "service invoke": () => t.call("service invoke", {}) as Promise<CliServiceInvokeOutput>,
    "service relay": () => t.call("service relay", {}) as Promise<CliServiceRelayOutput>,
    "service stop": () => t.call("service stop", {}) as Promise<CliServiceStopOutput>,
    "service stream cancel": () => t.call("service stream cancel", {}) as Promise<CliServiceStreamCancelOutput>,
    "service stream read": () => t.call("service stream read", {}) as Promise<CliServiceStreamReadOutput>,
    "service stream start": () => t.call("service stream start", {}) as Promise<CliServiceStreamStartOutput>,
    "service subscribe": () => t.call("service subscribe", {}) as Promise<CliServiceSubscribeOutput>,
    "service subscription update": () => t.call("service subscription update", {}) as Promise<CliServiceSubscriptionUpdateOutput>,
    "service unsubscribe": () => t.call("service unsubscribe", {}) as Promise<CliServiceUnsubscribeOutput>,
    service_cancel_update: () => t.call("service_cancel_update", {}) as Promise<ServiceCancelUpdateOutput>,
    service_poll: (params: ServicePollParams) => t.call("service_poll", params) as Promise<ServicePollOutput>,
    service_prepare_update: () => t.call("service_prepare_update", {}) as Promise<ServicePrepareUpdateOutput>,
  };
}
