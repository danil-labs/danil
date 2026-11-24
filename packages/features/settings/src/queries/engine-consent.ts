import { callEngine, type InvokeArgs, type InvokeOptions } from "../../../../engine-client/src/client.ts";

export function listModels<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("list_models", args, options);
}

export function setProviderConsent<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("set_provider_consent", args, options);
}

export function workspacesStartup<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("workspaces_startup", args, options);
}
