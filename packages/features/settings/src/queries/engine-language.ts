import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";

export function installLanguagePack<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("install_language_pack", args, options);
}

export function listLanguagePacks<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("list_language_packs", args, options);
}

export function removeLanguagePack<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("remove_language_pack", args, options);
}

export function setWorkspaceLanguage<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("set_workspace_language", args, options);
}

export function setWorkspaceOutputLanguage<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("set_workspace_output_language", args, options);
}
