// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { CloseMcpAppParams, CloseMcpAppOutput, ClosePortParams, ClosePortOutput, CloseProcessParams, CloseProcessOutput, CollectOrphansParams, CollectOrphansOutput, CliConfigGetParams, CliConfigGetOutput, CliConfigSetParams, CliConfigSetOutput, ConnectApiKeyParams, ConnectApiKeyOutput, ConnectExternalParams, ConnectExternalOutput, ConnectGitHostParams, ConnectGitHostOutput, ConnectKnownMcpParams, ConnectKnownMcpOutput, ConnectionCallParams, ConnectionCallOutput, ConsentTextParams, ConsentTextOutput, ContextParams, ContextOutput, CliCredentialImportParams, CliCredentialImportOutput, CliCredentialPrepareParams, CliCredentialPrepareOutput, CreditsPilotInstallParams, CreditsPilotInstallOutput, DeleteAgentParams, DeleteAgentOutput, DeleteMemoryEntryParams, DeleteMemoryEntryOutput, DeleteProjectParams, DeleteProjectOutput, DeleteSessionParams, DeleteSessionOutput, DeleteSpaceParams, DeleteSpaceOutput } from "../commands/misc-3.ts";

export function bind_misc_3(t: EngineTransport) {
  return {
    close_mcp_app: (params: CloseMcpAppParams) => t.call("close_mcp_app", params) as Promise<CloseMcpAppOutput>,
    close_port: (params: ClosePortParams) => t.call("close_port", params) as Promise<ClosePortOutput>,
    close_process: (params: CloseProcessParams) => t.call("close_process", params) as Promise<CloseProcessOutput>,
    collect_orphans: () => t.call("collect_orphans", {}) as Promise<CollectOrphansOutput>,
    "config get": () => t.call("config get", {}) as Promise<CliConfigGetOutput>,
    "config set": () => t.call("config set", {}) as Promise<CliConfigSetOutput>,
    connect_api_key: (params: ConnectApiKeyParams) => t.call("connect_api_key", params) as Promise<ConnectApiKeyOutput>,
    connect_external: (params: ConnectExternalParams) => t.call("connect_external", params) as Promise<ConnectExternalOutput>,
    connect_git_host: (params: ConnectGitHostParams) => t.call("connect_git_host", params) as Promise<ConnectGitHostOutput>,
    connect_known_mcp: (params: ConnectKnownMcpParams) => t.call("connect_known_mcp", params) as Promise<ConnectKnownMcpOutput>,
    connection_call: (params: ConnectionCallParams) => t.call("connection_call", params) as Promise<ConnectionCallOutput>,
    consent_text: () => t.call("consent_text", {}) as Promise<ConsentTextOutput>,
    context: () => t.call("context", {}) as Promise<ContextOutput>,
    "credential import": () => t.call("credential import", {}) as Promise<CliCredentialImportOutput>,
    "credential prepare": () => t.call("credential prepare", {}) as Promise<CliCredentialPrepareOutput>,
    credits_pilot_install: (params: CreditsPilotInstallParams) => t.call("credits_pilot_install", params) as Promise<CreditsPilotInstallOutput>,
    delete_agent: (params: DeleteAgentParams) => t.call("delete_agent", params) as Promise<DeleteAgentOutput>,
    delete_memory_entry: (params: DeleteMemoryEntryParams) => t.call("delete_memory_entry", params) as Promise<DeleteMemoryEntryOutput>,
    delete_project: (params: DeleteProjectParams) => t.call("delete_project", params) as Promise<DeleteProjectOutput>,
    delete_session: (params: DeleteSessionParams) => t.call("delete_session", params) as Promise<DeleteSessionOutput>,
    delete_space: (params: DeleteSpaceParams) => t.call("delete_space", params) as Promise<DeleteSpaceOutput>,
  };
}
