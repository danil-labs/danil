// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface CreateAccountWorkspaceParams {
  id: string;
  name: string;
  account: unknown;
}
export type CreateAccountWorkspaceOutput = unknown;

export interface CreateAgentParams {
  name: string;
  description: string;
  instructions: string;
  scope: unknown;
}
export type CreateAgentOutput = unknown;

export interface CreateAgentThreadParams {
  project: string;
  name: string;
  title: string;
  provider: string;
  model?: string | null;
}
export type CreateAgentThreadOutput = string;

export interface CreateEmptySessionParams {
  provider: string;
  project: string;
  title: string;
  baseRef?: string | null;
  agent?: string | null;
  space?: string | null;
}
export type CreateEmptySessionOutput = unknown;

export interface CreateProjectParams {
  name: string;
  workingDirectory?: string | null;
  space?: string | null;
  id?: string | null;
  directory?: string | null;
}
export type CreateProjectOutput = unknown;

export interface CreateRemoteChildParams {
  provider: string;
  project: string;
  prompt: string;
  model?: string | null;
  effort?: string | null;
  permissionMode: string;
  baseRef?: string | null;
  space?: string | null;
  remoteParent: unknown;
  depth: number;
  hops: number;
  fromTask?: unknown | null;
}
export type CreateRemoteChildOutput = unknown;

export interface CreateSpaceParams {
  name: string;
  folders?: string[] | null;
}
export type CreateSpaceOutput = unknown;

export const COMMANDS_CREATE = {
  create_account_workspace: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  create_agent: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  create_agent_thread: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  create_empty_session: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  create_project: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  create_remote_child: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  create_space: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
} as const;
