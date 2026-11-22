import type { Tool } from "@modelcontextprotocol/client";
import { invoke } from "../../../../engine-client/src/client.ts";

export type AppView = {
  html: string;
  resource_uri: string;
  tool: Tool;
  connection_id: string;
  title?: string | null;
};

export type Plugins = { plugins: { id: string; enabled: boolean }[] };

export const hasMcpApp = (server: string, tool: string): Promise<boolean> =>
  invoke<boolean>("has_mcp_app", { server, tool });

export const readMcpApp = (server: string, tool: string): Promise<(AppView | null)> =>
  invoke<(AppView | null)>("read_mcp_app", { server, tool });

export const closeMcpApp = (connectionId: string): Promise<void> =>
  invoke("close_mcp_app", { connectionId });

export const callMcpAppTool = <t = unknown>(
  connectionId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<t> =>
  invoke<t>("call_mcp_app_tool", { connectionId, name, arguments: args });

export const readMcpAppResource = <t = unknown>(
  connectionId: string,
  uri: string,
): Promise<t> =>
  invoke<t>("read_mcp_app_resource", { connectionId, uri });

export const readDrawioAsset = (path: string): Promise<string> =>
  invoke<string>("read_drawio_asset", { path });

export const listIntegrations = (): Promise<(Plugins)> =>
  invoke<(Plugins)>("list_integrations");
