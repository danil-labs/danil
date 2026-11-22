import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";

export function openExternal<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("open_external", args, options);
}
