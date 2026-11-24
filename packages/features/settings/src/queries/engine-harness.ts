import { invoke, type InvokeArgs, type InvokeOptions } from "../../../../engine-client/src/client.ts";

export function getRadiantIdentity<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("get_radiant_identity", args, options);
}

export function listGovernedMcpLogins<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("list_governed_mcp_logins", args, options);
}

export function listRadiantConnections<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("list_radiant_connections", args, options);
}

export function listRadiantWorkspaces<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("list_radiant_workspaces", args, options);
}

export function radiantCancelLogin<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("radiant_cancel_login", args, options);
}

export function radiantConnectAccount<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("radiant_connect_account", args, options);
}

export function radiantGovernDisable<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("radiant_govern_disable", args, options);
}

export function radiantGovernEnable<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("radiant_govern_enable", args, options);
}

export function radiantGovernRefresh<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("radiant_govern_refresh", args, options);
}

export function radiantLogin<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("radiant_login", args, options);
}

export function radiantLogout<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("radiant_logout", args, options);
}

export function radiantSelectOrganization<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("radiant_select_organization", args, options);
}

export function radiantSelectWorkspace<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("radiant_select_workspace", args, options);
}

export function radiantSetServer<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("radiant_set_server", args, options);
}

export function radiantStatus<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("radiant_status", args, options);
}

export function radiantUsageSetOptIn<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("radiant_usage_set_opt_in", args, options);
}

export function radiantUsageStatus<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("radiant_usage_status", args, options);
}
