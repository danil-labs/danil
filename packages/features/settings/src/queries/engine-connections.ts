import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";
export { listComputers } from "../../../../platform-client/src/api.ts";
export { connectionCapabilities, listConnections, revokeConnection, updateConnection } from "../../../../platform-client/src/connections.ts";

export function accountRelayToken<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("account_relay_token", args, options);
}

export function localOrchestratorConnect<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("local_orchestrator_connect", args, options);
}

export function localOrchestratorDisconnect<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("local_orchestrator_disconnect", args, options);
}
