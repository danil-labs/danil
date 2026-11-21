// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface ReadActivityParams {
  id: string;
}
export type ReadActivityOutput = unknown;

export interface ReadActivityLogParams {
  id: string;
  step: string;
  offset?: number | null;
}
export type ReadActivityLogOutput = unknown;

export interface ReadDrawioAssetParams {
  path: string;
}
export type ReadDrawioAssetOutput = string;

export interface ReadMcpAppParams {
  server: string;
  tool: string;
}
export type ReadMcpAppOutput = unknown | null;

export interface ReadMcpAppResourceParams {
  connectionId: string;
  uri: string;
}
export type ReadMcpAppResourceOutput = unknown;

export interface ReadVersionParams {
  referencia: unknown;
}
export type ReadVersionOutput = string;

export const COMMANDS_READ = {
  read_activity: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  read_activity_log: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  read_drawio_asset: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  read_mcp_app: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  read_mcp_app_resource: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  read_version: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
} as const;
