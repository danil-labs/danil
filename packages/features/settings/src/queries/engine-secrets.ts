import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";

export function envSecretRemove<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("env_secret_remove", args, options);
}

export function envSecretSet<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("env_secret_set", args, options);
}

export function envSecretsList<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("env_secrets_list", args, options);
}
