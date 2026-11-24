import { callEngine, type InvokeArgs, type InvokeOptions } from "../../../../engine-client/src/client.ts";

export function addMcpServers<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("add_mcp_servers", args, options);
}

export function checkMcp<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("check_mcp", args, options);
}

export function connectKnownMcp<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("connect_known_mcp", args, options);
}

export function disconnectKnownMcp<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("disconnect_known_mcp", args, options);
}

export function listKnownMcp<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("list_known_mcp", args, options);
}

export function listMcpProviders<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("list_mcp_providers", args, options);
}

export function listMcpServers<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("list_mcp_servers", args, options);
}

export function mcpLogin<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("mcp_login", args, options);
}

export function mcpLogout<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("mcp_logout", args, options);
}

export function removeMcpServer<res = unknown>(args?: InvokeArgs, options?: InvokeOptions): Promise<res> {
  return callEngine<res>("remove_mcp_server", args, options);
}
