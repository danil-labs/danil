import { callEngine, type InvokeArgs, type InvokeOptions } from "../../../../engine-client/src/client.ts";

export function checkEnvironment<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("check_environment", args, options);
}

export function installTool<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("install_tool", args, options);
}

export function prepareRuntime<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("prepare_runtime", args, options);
}

export function restartApp<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("restart_app", args, options);
}

export function servicePoll<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("service_poll", args, options);
}

export function setupRequired<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("setup_required", args, options);
}

export function updateInstall<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("update_install", args, options);
}

export function updatePending<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("update_pending", args, options);
}

export function updateSource<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("update_source", args, options);
}
