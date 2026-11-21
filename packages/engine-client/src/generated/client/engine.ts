// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { CliEngineStartParams, CliEngineStartOutput, CliEngineStatusParams, CliEngineStatusOutput, CliEngineStopParams, CliEngineStopOutput, EngineAdoptionRetryParams, EngineAdoptionRetryOutput, EngineAdoptionStatusParams, EngineAdoptionStatusOutput, EngineUpdateParams, EngineUpdateOutput, EngineUpdateStatusParams, EngineUpdateStatusOutput } from "../commands/engine.ts";

export function bind_engine(t: EngineTransport) {
  return {
    "engine start": () => t.call("engine start", {}) as Promise<CliEngineStartOutput>,
    "engine status": () => t.call("engine status", {}) as Promise<CliEngineStatusOutput>,
    "engine stop": () => t.call("engine stop", {}) as Promise<CliEngineStopOutput>,
    engine_adoption_retry: () => t.call("engine_adoption_retry", {}) as Promise<EngineAdoptionRetryOutput>,
    engine_adoption_status: () => t.call("engine_adoption_status", {}) as Promise<EngineAdoptionStatusOutput>,
    engine_update: (params?: EngineUpdateParams) => t.call("engine_update", params) as Promise<EngineUpdateOutput>,
    engine_update_status: (params?: EngineUpdateStatusParams) => t.call("engine_update_status", params) as Promise<EngineUpdateStatusOutput>,
  };
}
