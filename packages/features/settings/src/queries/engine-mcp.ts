import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import { invoke } from "../../../../engine-client/src/client.ts";

export function addMcpServers<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("add_mcp_servers", args, options);
}

export function checkMcp<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("check_mcp", args, options);
}

export function connectKnownMcp<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("connect_known_mcp", args, options);
}

export function disconnectKnownMcp<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("disconnect_known_mcp", args, options);
}

export function listKnownMcp<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("list_known_mcp", args, options);
}

export function listMcpProviders<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("list_mcp_providers", args, options);
}

export function listMcpServers<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("list_mcp_servers", args, options);
}

export function mcpLogin<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("mcp_login", args, options);
}

export function mcpLogout<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("mcp_logout", args, options);
}

export function removeMcpServer<T>(args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  return invoke<T>("remove_mcp_server", args, options);
}
