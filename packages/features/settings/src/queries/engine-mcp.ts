import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";

export function addMcpServers<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("add_mcp_servers", args, options);
}

export function checkMcp<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("check_mcp", args, options);
}

export function connectKnownMcp<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("connect_known_mcp", args, options);
}

export function disconnectKnownMcp<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("disconnect_known_mcp", args, options);
}

export function listKnownMcp<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("list_known_mcp", args, options);
}

export function listMcpProviders<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("list_mcp_providers", args, options);
}

export function listMcpServers<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("list_mcp_servers", args, options);
}

export function mcpLogin<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("mcp_login", args, options);
}

export function mcpLogout<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("mcp_logout", args, options);
}

export function removeMcpServer<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return invoke<res>("remove_mcp_server", args, options);
}
