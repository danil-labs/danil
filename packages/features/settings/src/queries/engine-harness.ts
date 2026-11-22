import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";

export function getRadiantIdentity<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("get_radiant_identity", args, options);
}

export function listGovernedMcpLogins<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("list_governed_mcp_logins", args, options);
}

export function listRadiantConnections<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("list_radiant_connections", args, options);
}

export function listRadiantWorkspaces<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("list_radiant_workspaces", args, options);
}

export function radiantCancelLogin<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("radiant_cancel_login", args, options);
}

export function radiantConnectAccount<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("radiant_connect_account", args, options);
}

export function radiantGovernDisable<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("radiant_govern_disable", args, options);
}

export function radiantGovernEnable<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("radiant_govern_enable", args, options);
}

export function radiantGovernRefresh<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("radiant_govern_refresh", args, options);
}

export function radiantLogin<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("radiant_login", args, options);
}

export function radiantLogout<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("radiant_logout", args, options);
}

export function radiantSelectOrganization<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("radiant_select_organization", args, options);
}

export function radiantSelectWorkspace<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("radiant_select_workspace", args, options);
}

export function radiantSetServer<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("radiant_set_server", args, options);
}

export function radiantStatus<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("radiant_status", args, options);
}

export function radiantUsageSetOptIn<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("radiant_usage_set_opt_in", args, options);
}

export function radiantUsageStatus<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("radiant_usage_status", args, options);
}
