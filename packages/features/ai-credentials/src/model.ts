import type {
  ClientError,
  CredentialProviderList,
  Machine,
  Workspace,
  PlatformClient,
  AccountCredential,
  WorkspaceAccounts,
  PutWorkspaceAccount,
} from "@danil/platform-client";
import type { EngineClient, MachineRef, ConnectOptions, MachineConnection } from "@danil/engine-client";

// Tipos derivados del cliente de plataforma generado
export type {
  ClientError,
  PlatformClient,
  Machine as PlatformMachine,
  Workspace as PlatformWorkspace,
  AccountCredential,
  WorkspaceAccounts,
  PutWorkspaceAccount,
};
export type PlatformCredentialItem = NonNullable<NonNullable<CredentialProviderList["items"]>[number]>;

// Tipos derivados del cliente de motor generado
export type { EngineClient, MachineRef, ConnectOptions, MachineConnection };
export type EngineProvidersOutput = Awaited<ReturnType<EngineClient["list_providers"]>>;
export type EngineProviderItem = EngineProvidersOutput extends (infer U)[] ? U : unknown;

// Proveedores admitidos por la nueva arquitectura
export type SupportedProvider = "claude" | "codex" | "antigravity" | "opencode";

// Estados por máquina según contrato B-022 y API.md migración 008
export type MachineCredentialState = "active" | "pending" | "removed";

export interface MachineCredentialStatus {
  machine_id: string;
  state: MachineCredentialState;
  version?: number;
  last_seen_at?: string | null;
}

export type CredentialKind =
  | "api_key"
  | "mcp_secret"
  | "zotero"
  | "subscription"
  | "mcp_oauth"
  | "env_secret";

export type WorkspaceCredential = AccountCredential;

export interface WorkspaceRecipient {
  machine_id: string;
  public_key: string | null;
}

export type WorkspaceAccountsResponse = WorkspaceAccounts;

export interface SealedCopy {
  machine_id: string;
  sealed: string;
}

export type PutWorkspaceAccountPayload = PutWorkspaceAccount;

export interface ConnectAccountOptions {
  workspaceId: string;
  provider: string;
  slot: string;
  label?: string;
  hint?: string;
  kind?: "api_key" | "subscription" | "mcp_secret";
  secret?: string;
  recipients: Array<{ machine_id: string; public_key: string | null }>;
}

export interface ProviderViewItem {
  id: SupportedProvider | string;
  name: string;
  kind: CredentialKind;
  hint?: string;
  connected: boolean;
  available?: boolean;
  requiresSubscription?: boolean;
  requiresKey?: boolean;
  keyPrefix?: string;
  accounts?: WorkspaceCredential[];
}
