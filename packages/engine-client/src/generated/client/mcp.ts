// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { CliMcpAddParams, CliMcpAddOutput, CliMcpCheckParams, CliMcpCheckOutput, CliMcpConnectParams, CliMcpConnectOutput, CliMcpDisconnectParams, CliMcpDisconnectOutput, CliMcpListParams, CliMcpListOutput, CliMcpLoginParams, CliMcpLoginOutput, CliMcpRemoveParams, CliMcpRemoveOutput, McpLoginParams, McpLoginOutput, McpLogoutParams, McpLogoutOutput } from "../commands/mcp.ts";

export function bind_mcp(t: EngineTransport) {
  return {
    "mcp add": () => t.call("mcp add", {}) as Promise<CliMcpAddOutput>,
    "mcp check": () => t.call("mcp check", {}) as Promise<CliMcpCheckOutput>,
    "mcp connect": () => t.call("mcp connect", {}) as Promise<CliMcpConnectOutput>,
    "mcp disconnect": () => t.call("mcp disconnect", {}) as Promise<CliMcpDisconnectOutput>,
    "mcp list": () => t.call("mcp list", {}) as Promise<CliMcpListOutput>,
    "mcp login": () => t.call("mcp login", {}) as Promise<CliMcpLoginOutput>,
    "mcp remove": () => t.call("mcp remove", {}) as Promise<CliMcpRemoveOutput>,
    mcp_login: (params: McpLoginParams) => t.call("mcp_login", params) as Promise<McpLoginOutput>,
    mcp_logout: (params: McpLogoutParams) => t.call("mcp_logout", params) as Promise<McpLogoutOutput>,
  };
}
