// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type CliMcpAddParams = Record<string, never>;
export type CliMcpAddOutput = null;

export type CliMcpCheckParams = Record<string, never>;
export type CliMcpCheckOutput = null;

export type CliMcpConnectParams = Record<string, never>;
export type CliMcpConnectOutput = null;

export type CliMcpDisconnectParams = Record<string, never>;
export type CliMcpDisconnectOutput = null;

export type CliMcpListParams = Record<string, never>;
export type CliMcpListOutput = null;

export type CliMcpLoginParams = Record<string, never>;
export type CliMcpLoginOutput = null;

export type CliMcpRemoveParams = Record<string, never>;
export type CliMcpRemoveOutput = null;

export interface McpLoginParams {
  provider: string;
  id: string;
}
export type McpLoginOutput = unknown;

export interface McpLogoutParams {
  provider: string;
  id: string;
}
export type McpLogoutOutput = null;

export const COMMANDS_MCP = {
  "mcp add": { kind: "cli", scope: null, authority: "unattended", channel: null, relay: false },
  "mcp check": { kind: "cli", scope: null, authority: "read", channel: null, relay: false },
  "mcp connect": { kind: "cli", scope: null, authority: "catalog", channel: null, relay: false },
  "mcp disconnect": { kind: "cli", scope: null, authority: "unattended", channel: null, relay: false },
  "mcp list": { kind: "cli", scope: null, authority: "read", channel: null, relay: false },
  "mcp login": { kind: "cli", scope: null, authority: "catalog", channel: null, relay: false },
  "mcp remove": { kind: "cli", scope: null, authority: "unattended", channel: null, relay: false },
  mcp_login: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  mcp_logout: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
} as const;
