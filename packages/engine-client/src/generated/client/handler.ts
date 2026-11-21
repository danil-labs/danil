// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { CliHandlerApproveParams, CliHandlerApproveOutput, CliHandlerCreateParams, CliHandlerCreateOutput, CliHandlerListParams, CliHandlerListOutput, CliHandlerMigrateMemoryParams, CliHandlerMigrateMemoryOutput, CliHandlerNewThreadParams, CliHandlerNewThreadOutput, CliHandlerReleaseParams, CliHandlerReleaseOutput, CliHandlerRequestsParams, CliHandlerRequestsOutput, CliHandlerRevokeParams, CliHandlerRevokeOutput, CliHandlerSendParams, CliHandlerSendOutput, CliHandlerShowParams, CliHandlerShowOutput, CliHandlerThreadsParams, CliHandlerThreadsOutput, CliHandlerUpdateParams, CliHandlerUpdateOutput, CliHandlerValidateParams, CliHandlerValidateOutput } from "../commands/handler.ts";

export function bind_handler(t: EngineTransport) {
  return {
    "handler approve": () => t.call("handler approve", {}) as Promise<CliHandlerApproveOutput>,
    "handler create": () => t.call("handler create", {}) as Promise<CliHandlerCreateOutput>,
    "handler list": () => t.call("handler list", {}) as Promise<CliHandlerListOutput>,
    "handler migrate-memory": () => t.call("handler migrate-memory", {}) as Promise<CliHandlerMigrateMemoryOutput>,
    "handler new-thread": () => t.call("handler new-thread", {}) as Promise<CliHandlerNewThreadOutput>,
    "handler release": () => t.call("handler release", {}) as Promise<CliHandlerReleaseOutput>,
    "handler requests": () => t.call("handler requests", {}) as Promise<CliHandlerRequestsOutput>,
    "handler revoke": () => t.call("handler revoke", {}) as Promise<CliHandlerRevokeOutput>,
    "handler send": () => t.call("handler send", {}) as Promise<CliHandlerSendOutput>,
    "handler show": () => t.call("handler show", {}) as Promise<CliHandlerShowOutput>,
    "handler threads": () => t.call("handler threads", {}) as Promise<CliHandlerThreadsOutput>,
    "handler update": () => t.call("handler update", {}) as Promise<CliHandlerUpdateOutput>,
    "handler validate": () => t.call("handler validate", {}) as Promise<CliHandlerValidateOutput>,
  };
}
