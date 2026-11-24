import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";

export function listLanguagePacks<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("list_language_packs", args, options);
}

export function setWorkspaceLanguage<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("set_workspace_language", args, options);
}

export function setWorkspaceOutputLanguage<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("set_workspace_output_language", args, options);
}
