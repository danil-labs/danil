// GENERADO por scripts/generate.mjs. No editar.

export type ErrorResponse = {
  error: {
    code: string;
    message: string;
  };
  [key: string]: any;
};

/** application/problem+json que emite el borde; type es urn:danil:problem:<code>. */
export type Problem = {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  [key: string]: any;
};

export type Loose = {
  [key: string]: any;
};

export type OrganizationRef = {
  id: string;
  name?: string;
  role?: string;
  /** Abierto; hoy se observa personal. */
  type?: string;
  [key: string]: any;
};

export type Me = {
  id: string;
  name?: string;
  state?: string;
  /** Workspace activo si lo hay; forma no verificada. */
  workspace?: Workspace | null;
  organizations?: Array<OrganizationRef>;
  active_organization_id?: string | null;
  [key: string]: any;
};

export type OrganizationList = {
  items?: Array<OrganizationRef>;
  /** Alias posible; la forma exacta no está documentada. */
  organizations?: Array<OrganizationRef>;
  active_organization_id?: string | null;
  [key: string]: any;
};

export type SelectOrganizationRequest = {
  organization_id: string;
  [key: string]: any;
};

export type SelectOrganizationResponse = {
  active_organization_id?: string | null;
  [key: string]: any;
};

export type Workspace = {
  id: string;
  org?: string;
  name?: string;
  role?: string;
  [key: string]: any;
};

export type WorkspaceList = {
  items?: Array<Workspace>;
  workspaces?: Array<Workspace>;
  [key: string]: any;
};

export type CreateWorkspaceRequest = {
  name: string;
  org?: string;
  [key: string]: any;
};

export type SelectWorkspaceRequest = {
  /** Id del workspace, p. ej. "12". */
  workspace: string;
  [key: string]: any;
};

export type SelectWorkspaceResponse = {
  workspace: Workspace;
  [key: string]: any;
};

export type Machine = {
  machine_id: string;
  name?: string;
  state?: "running" | "stopped" | "starting" | "stopping";
  connection?: "connected" | "disconnected";
  organization_id?: string | null;
  person_id?: string | null;
  kind?: "personal" | "organization";
  /** Abierto; p. ej. danil. */
  provider?: string;
  [key: string]: any;
};

export type MachineList = {
  items: Array<Machine>;
  next_cursor?: string | null;
  [key: string]: any;
};

export type Operation = {
  operation_id?: string;
  id?: string;
  /** Abierto; el docs no enumeran los estados. */
  state?: string;
  generation?: number;
  machine_id?: string;
  error?: ErrorBody;
  [key: string]: any;
};

export type ErrorBody = {
  code?: string;
  message?: string;
  [key: string]: any;
};

export type MachineTicket = {
  ticket?: string;
  /** Instante de caducidad; formato no verificado. */
  expires_at?: string | number;
  /** URL wss si la devuelve el servidor. */
  url?: string;
  [key: string]: any;
};

export type CredentialProviderList = {
  items?: Array<{
    provider?: string;
    enabled?: boolean;
    connection?: {
      [key: string]: any;
    } | string | null;
  }>;
  [key: string]: any;
};

export type CredentialMachine = {
  machine_id: string;
  state: "active" | "pending" | "removed";
  version?: number;
  last_seen_at?: string | null;
  [key: string]: any;
};

export type AccountCredential = {
  credential_id: string;
  kind: "api_key" | "mcp_secret" | "zotero" | "subscription" | "mcp_oauth" | "env_secret";
  provider: string;
  slot: string;
  label?: string | null;
  hint?: string | null;
  status: string;
  version: number;
  config?: {
    [key: string]: any;
  } | null;
  created_at?: string;
  updated_at?: string;
  machines: Array<CredentialMachine>;
  [key: string]: any;
};

export type CredentialRecipient = {
  machine_id: string;
  /** X25519, base64 */
  public_key: string;
  [key: string]: any;
};

export type WorkspaceAccounts = {
  credentials: Array<AccountCredential>;
  recipients: Array<CredentialRecipient>;
  [key: string]: any;
};

export type SealedCopy = {
  machine_id: string;
  /** Sobre TERMINUS-SECRET/1 en base64 */
  sealed: string;
};

export type PutWorkspaceAccount = {
  kind: "api_key" | "mcp_secret" | "zotero" | "subscription" | "mcp_oauth" | "env_secret";
  provider: string;
  slot: string;
  label?: string;
  hint?: string;
  config?: {
    [key: string]: any;
  };
  copies: Array<SealedCopy>;
};

export type AccountCredentialEnvelope = {
  credential: AccountCredential;
  [key: string]: any;
};

export type Ok = {
  ok?: boolean;
  [key: string]: any;
};

export type GithubConnection = {
  connected: boolean;
  status?: string | null;
  login?: string | null;
  avatar?: string | null;
  version?: number | null;
  install_url?: string | null;
  [key: string]: any;
};

export type GithubAuthorizeRequest = {
  return_to?: string;
};

export type GithubAuthorizeResponse = {
  url: string;
  expires_at?: string | number | null;
  [key: string]: any;
};
