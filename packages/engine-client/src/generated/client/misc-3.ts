// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { CliConfigSetParams, CliConfigSetOutput, ConnectApiKeyParams, ConnectApiKeyOutput, ConnectGitHostParams, ConnectGitHostOutput, ConnectKnownMcpParams, ConnectKnownMcpOutput, ConsentTextParams, ConsentTextOutput, ContextParams, ContextOutput, CreateAgentParams, CreateAgentOutput, CreateAgentThreadParams, CreateAgentThreadOutput, CreateEmptySessionParams, CreateEmptySessionOutput, CreateProjectParams, CreateProjectOutput, CreateSpaceParams, CreateSpaceOutput, CliCredentialImportParams, CliCredentialImportOutput, CliCredentialPrepareParams, CliCredentialPrepareOutput, DeleteAgentParams, DeleteAgentOutput, DeleteMemoryEntryParams, DeleteMemoryEntryOutput, DeleteProjectParams, DeleteProjectOutput, DeleteSessionParams, DeleteSessionOutput, DeleteSpaceParams, DeleteSpaceOutput, DetachSessionSourceParams, DetachSessionSourceOutput, DetachSourceParams, DetachSourceOutput, DiscardAccountParams, DiscardAccountOutput } from "../commands/misc-3.ts";

export function bind_misc_3(t: EngineTransport) {
  return {
    "config set": () => t.call("config set", {}) as Promise<CliConfigSetOutput>,
    connect_api_key: (params: ConnectApiKeyParams) => t.call("connect_api_key", params) as Promise<ConnectApiKeyOutput>,
    connect_git_host: (params: ConnectGitHostParams) => t.call("connect_git_host", params) as Promise<ConnectGitHostOutput>,
    connect_known_mcp: (params: ConnectKnownMcpParams) => t.call("connect_known_mcp", params) as Promise<ConnectKnownMcpOutput>,
    consent_text: () => t.call("consent_text", {}) as Promise<ConsentTextOutput>,
    context: () => t.call("context", {}) as Promise<ContextOutput>,
    create_agent: (params: CreateAgentParams) => t.call("create_agent", params) as Promise<CreateAgentOutput>,
    create_agent_thread: (params: CreateAgentThreadParams) => t.call("create_agent_thread", params) as Promise<CreateAgentThreadOutput>,
    create_empty_session: (params: CreateEmptySessionParams) => t.call("create_empty_session", params) as Promise<CreateEmptySessionOutput>,
    create_project: (params: CreateProjectParams) => t.call("create_project", params) as Promise<CreateProjectOutput>,
    create_space: (params: CreateSpaceParams) => t.call("create_space", params) as Promise<CreateSpaceOutput>,
    "credential import": () => t.call("credential import", {}) as Promise<CliCredentialImportOutput>,
    "credential prepare": () => t.call("credential prepare", {}) as Promise<CliCredentialPrepareOutput>,
    delete_agent: (params: DeleteAgentParams) => t.call("delete_agent", params) as Promise<DeleteAgentOutput>,
    delete_memory_entry: (params: DeleteMemoryEntryParams) => t.call("delete_memory_entry", params) as Promise<DeleteMemoryEntryOutput>,
    delete_project: (params: DeleteProjectParams) => t.call("delete_project", params) as Promise<DeleteProjectOutput>,
    delete_session: (params: DeleteSessionParams) => t.call("delete_session", params) as Promise<DeleteSessionOutput>,
    delete_space: (params: DeleteSpaceParams) => t.call("delete_space", params) as Promise<DeleteSpaceOutput>,
    detach_session_source: (params: DetachSessionSourceParams) => t.call("detach_session_source", params) as Promise<DetachSessionSourceOutput>,
    detach_source: (params: DetachSourceParams) => t.call("detach_source", params) as Promise<DetachSourceOutput>,
    discard_account: (params: DiscardAccountParams) => t.call("discard_account", params) as Promise<DiscardAccountOutput>,
  };
}
