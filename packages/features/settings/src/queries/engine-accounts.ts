import { invoke, type InvokeArgs, type InvokeOptions } from "../../../../engine-client/src/client.ts";
import { cancelLoopbackForAccount } from "../../../../engine-client/src/loopbackLogin.ts";

export function accountStatus<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("account_status", args, options);
}

export function addAccount<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("add_account", args, options);
}

export function cancelLogin<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  const id = (args as { id?: unknown } | undefined)?.id;
  if (typeof id === "string") cancelLoopbackForAccount(id);
  return invoke<res>("cancel_login", args, options);
}

export function discardAccount<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("discard_account", args, options);
}

export function installProvider<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("install_provider", args, options);
}

export function listAccounts<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("list_accounts", args, options);
}

export function listProviders<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("list_providers", args, options);
}

export function loginAccount<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("login_account", args, options);
}

export function removeAccount<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("remove_account", args, options);
}

export function renameAccount<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("rename_account", args, options);
}

export function resumeAwaitingQuota<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("resume_awaiting_quota", args, options);
}

export function setActiveAccount<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("set_active_account", args, options);
}

export function setApiKey<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("set_api_key", args, options);
}

export function submitLoginCode<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("submit_login_code", args, options);
}

export function tasksAwaitingQuota<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("tasks_awaiting_quota", args, options);
}
