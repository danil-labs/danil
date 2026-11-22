import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";

export function handlerAction<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("handler_action", args, options);
}

export function listModels<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("list_models", args, options);
}

export function setProviderConsent<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("set_provider_consent", args, options);
}

export function workspacesStartup<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("workspaces_startup", args, options);
}
