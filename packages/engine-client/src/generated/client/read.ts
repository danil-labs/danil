// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { ReadActivityParams, ReadActivityOutput, ReadActivityLogParams, ReadActivityLogOutput, ReadDrawioAssetParams, ReadDrawioAssetOutput, ReadMcpAppParams, ReadMcpAppOutput, ReadMcpAppResourceParams, ReadMcpAppResourceOutput, ReadVersionParams, ReadVersionOutput } from "../commands/read.ts";

export function bind_read(t: EngineTransport) {
  return {
    read_activity: (params: ReadActivityParams) => t.call("read_activity", params) as Promise<ReadActivityOutput>,
    read_activity_log: (params: ReadActivityLogParams) => t.call("read_activity_log", params) as Promise<ReadActivityLogOutput>,
    read_drawio_asset: (params: ReadDrawioAssetParams) => t.call("read_drawio_asset", params) as Promise<ReadDrawioAssetOutput>,
    read_mcp_app: (params: ReadMcpAppParams) => t.call("read_mcp_app", params) as Promise<ReadMcpAppOutput>,
    read_mcp_app_resource: (params: ReadMcpAppResourceParams) => t.call("read_mcp_app_resource", params) as Promise<ReadMcpAppResourceOutput>,
    read_version: (params: ReadVersionParams) => t.call("read_version", params) as Promise<ReadVersionOutput>,
  };
}
