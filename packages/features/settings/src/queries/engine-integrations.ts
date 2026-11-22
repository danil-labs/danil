import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";

export function checkIntegration<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("check_integration", args, options);
}

export function installIntegration<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("install_integration", args, options);
}

export function listIntegrations<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("list_integrations", args, options);
}

export function setIntegrationEnabled<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("set_integration_enabled", args, options);
}

export function typstLiveStop<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("typst_live_stop", args, options);
}

export function uninstallIntegration<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("uninstall_integration", args, options);
}

export function updateIntegration<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("update_integration", args, options);
}
