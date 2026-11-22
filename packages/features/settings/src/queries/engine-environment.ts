import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";

export function cancelInstall<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("cancel_install", args, options);
}

export function checkEnvironment<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("check_environment", args, options);
}

export function installSize<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("install_size", args, options);
}

export function installTool<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("install_tool", args, options);
}

export function prepareRuntime<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("prepare_runtime", args, options);
}

export function restartApp<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("restart_app", args, options);
}

export function serviceCancelUpdate<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("service_cancel_update", args, options);
}

export function servicePoll<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("service_poll", args, options);
}

export function servicePrepareUpdate<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("service_prepare_update", args, options);
}

export function setupRequired<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("setup_required", args, options);
}

export function updateInstall<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("update_install", args, options);
}

export function updateSource<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("update_source", args, options);
}
