import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";

export function openExternal<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("open_external", args, options);
}
