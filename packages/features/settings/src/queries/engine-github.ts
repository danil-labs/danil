import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";

export function accountCredentialRemoveMachine<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("account_credential_remove_machine", args, options);
}

export function accountCredentialRestoreMachine<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("account_credential_restore_machine", args, options);
}

export function danilAccountRefresh<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("danil_account_refresh", args, options);
}

export function danilWorkspaceAccount<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("danil_workspace_account", args, options);
}

export function githubAccountAuthorize<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("github_account_authorize", args, options);
}

export function githubAccountDisconnect<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("github_account_disconnect", args, options);
}

export function githubAccountInstallations<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("github_account_installations", args, options);
}

export function githubAccountStatus<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("github_account_status", args, options);
}
