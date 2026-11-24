import { invoke, type InvokeArgs, type InvokeOptions } from "../../../../engine-client/src/client.ts";
export { githubAuthorizeOf, githubCredentialOf, githubInstallationsOf, githubStatusOf } from "../../../../platform-client/src/github.ts";

export function accountCredentialRemoveMachine<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("account_credential_remove_machine", args, options);
}

export function accountCredentialRestoreMachine<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("account_credential_restore_machine", args, options);
}

export function danilAccountRefresh<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("danil_account_refresh", args, options);
}

export function danilWorkspaceAccount<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("danil_workspace_account", args, options);
}

export function githubAccountAuthorize<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("github_account_authorize", args, options);
}

export function githubAccountDisconnect<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("github_account_disconnect", args, options);
}

export function githubAccountInstallations<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("github_account_installations", args, options);
}

export function githubAccountStatus<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("github_account_status", args, options);
}
