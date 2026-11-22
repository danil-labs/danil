import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";

export function accountStatus<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("account_status", args, options);
}

export function addAccount<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("add_account", args, options);
}

export function cancelLogin<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("cancel_login", args, options);
}

export function discardAccount<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("discard_account", args, options);
}

export function installProvider<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("install_provider", args, options);
}

export function listAccounts<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("list_accounts", args, options);
}

export function listProviders<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("list_providers", args, options);
}

export function loginAccount<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("login_account", args, options);
}

export function removeAccount<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("remove_account", args, options);
}

export function resumeAwaitingQuota<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("resume_awaiting_quota", args, options);
}

export function setActiveAccount<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("set_active_account", args, options);
}

export function setApiKey<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("set_api_key", args, options);
}

export function setMemoryProvider<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("set_memory_provider", args, options);
}

export function submitLoginCode<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("submit_login_code", args, options);
}

export function tasksAwaitingQuota<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("tasks_awaiting_quota", args, options);
}
