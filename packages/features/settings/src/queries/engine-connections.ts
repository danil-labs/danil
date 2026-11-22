import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";

export function accountRelayToken<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("account_relay_token", args, options);
}

export function localOrchestratorConnect<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("local_orchestrator_connect", args, options);
}

export function localOrchestratorDisconnect<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("local_orchestrator_disconnect", args, options);
}
