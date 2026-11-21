// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { KnCloudStartParams, KnCloudStartOutput, KnCloudStateParams, KnCloudStateOutput, KnFinishParams, KnFinishOutput, KnPendingParams, KnPendingOutput, KnStatusParams, KnStatusOutput, KnUpdateParams, KnUpdateOutput } from "../commands/kn.ts";

export function bind_kn(t: EngineTransport) {
  return {
    kn_cloud_start: (params: KnCloudStartParams) => t.call("kn_cloud_start", params) as Promise<KnCloudStartOutput>,
    kn_cloud_state: (params: KnCloudStateParams) => t.call("kn_cloud_state", params) as Promise<KnCloudStateOutput>,
    kn_finish: (params: KnFinishParams) => t.call("kn_finish", params) as Promise<KnFinishOutput>,
    kn_pending: (params: KnPendingParams) => t.call("kn_pending", params) as Promise<KnPendingOutput>,
    kn_status: (params: KnStatusParams) => t.call("kn_status", params) as Promise<KnStatusOutput>,
    kn_update: (params: KnUpdateParams) => t.call("kn_update", params) as Promise<KnUpdateOutput>,
  };
}
