import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";

export function listActivity<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("list_activity", args, options);
}

export function readActivity<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("read_activity", args, options);
}

export function readActivityLog<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("read_activity_log", args, options);
}
