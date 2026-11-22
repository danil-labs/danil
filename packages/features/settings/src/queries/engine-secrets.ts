import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";

export function envSecretRemove<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("env_secret_remove", args, options);
}

export function envSecretSet<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("env_secret_set", args, options);
}

export function envSecretsList<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("env_secrets_list", args, options);
}
