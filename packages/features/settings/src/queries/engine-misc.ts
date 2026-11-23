import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";

export function listLocalOrchestrators<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("list_local_orchestrators", args, options);
}

export function setRoot<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("set_root", args, options);
}
