// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { CreateAccountWorkspaceParams, CreateAccountWorkspaceOutput, CreateAgentParams, CreateAgentOutput, CreateAgentThreadParams, CreateAgentThreadOutput, CreateEmptySessionParams, CreateEmptySessionOutput, CreateProjectParams, CreateProjectOutput, CreateRemoteChildParams, CreateRemoteChildOutput, CreateSpaceParams, CreateSpaceOutput } from "../commands/create.ts";

export function bind_create(t: EngineTransport) {
  return {
    create_account_workspace: (params: CreateAccountWorkspaceParams) => t.call("create_account_workspace", params) as Promise<CreateAccountWorkspaceOutput>,
    create_agent: (params: CreateAgentParams) => t.call("create_agent", params) as Promise<CreateAgentOutput>,
    create_agent_thread: (params: CreateAgentThreadParams) => t.call("create_agent_thread", params) as Promise<CreateAgentThreadOutput>,
    create_empty_session: (params: CreateEmptySessionParams) => t.call("create_empty_session", params) as Promise<CreateEmptySessionOutput>,
    create_project: (params: CreateProjectParams) => t.call("create_project", params) as Promise<CreateProjectOutput>,
    create_remote_child: (params: CreateRemoteChildParams) => t.call("create_remote_child", params) as Promise<CreateRemoteChildOutput>,
    create_space: (params: CreateSpaceParams) => t.call("create_space", params) as Promise<CreateSpaceOutput>,
  };
}
