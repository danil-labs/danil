// GENERADO por packages/platform-client/scripts/generate.mjs desde contract/openapi.json. No editar a mano.
// repo: danil-labs/danil-contracts; commit: 76173608d54571782453c165d1cfcacf612a6ea1; path: platform/openapi.json; billing-v2: platform/billing-v2/openapi/public.openapi.json platform/billing-v2/schemas/common.v1.schema.json (mismo commit; copiados en contract/billing-v2/)

// Dominios: machines, identity, workspaces, credentials.

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
    /** Campos aditivos: el contrato crece sin recompilar (R10). */
    [key: string]: unknown;
  } | null;
  created_at?: string;
  updated_at?: string;
  machines: Array<CredentialMachine>;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type AccountCredentialEnvelope = {
  credential: AccountCredential;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type CredentialMachine = {
  machine_id: string;
  state: "active" | "pending" | "removed";
  version?: number;
  last_seen_at?: string | null;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type CredentialProviderList = {
  items?: Array<{
    provider?: string;
    enabled?: boolean;
    connection?: {
      /** Campos aditivos: el contrato crece sin recompilar (R10). */
      [key: string]: unknown;
    } | string | null;
    /** Campos aditivos: el contrato crece sin recompilar (R10). */
    [key: string]: unknown;
  }>;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type CredentialRecipient = {
  machine_id: string;
  /** X25519, base64 */
  public_key: string;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type ErrorBody = {
  code?: string;
  message?: string;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type ErrorResponse = {
  error: {
    code: string;
    message: string;
    /** Campos aditivos: el contrato crece sin recompilar (R10). */
    [key: string]: unknown;
  };
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type GithubAuthorizeRequest = {
  return_to?: string;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type GithubAuthorizeResponse = {
  url: string;
  expires_at?: string | number | null;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type GithubConnection = {
  connected: boolean;
  status?: string | null;
  login?: string | null;
  avatar?: string | null;
  version?: number | null;
  install_url?: string | null;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type Loose = {
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
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
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type MachineList = {
  items: Array<Machine>;
  next_cursor?: string | null;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type MachineTicket = {
  ticket?: string;
  /** Instante de caducidad; formato no verificado. */
  expires_at?: string | number;
  /** URL wss si la devuelve el servidor. */
  url?: string;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type Me = {
  id: string;
  name?: string;
  state?: string;
  /** Workspace activo si lo hay; forma no verificada. */
  workspace?: Workspace | null;
  organizations?: Array<OrganizationRef>;
  active_organization_id?: string | null;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type Ok = {
  ok?: boolean;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type Operation = {
  operation_id?: string;
  id?: string;
  /** Abierto; el docs no enumeran los estados. */
  state?: string;
  generation?: number;
  machine_id?: string;
  error?: ErrorBody;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type OrganizationList = {
  items?: Array<OrganizationRef>;
  /** Alias posible; la forma exacta no está documentada. */
  organizations?: Array<OrganizationRef>;
  active_organization_id?: string | null;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type OrganizationRef = {
  id: string;
  name?: string;
  role?: string;
  /** Abierto; hoy se observa personal. */
  type?: string;
  /** free, team, enterprise… */
  plan?: string | null;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

/** application/problem+json que emite el borde; type es urn:danil:problem:<code>. */
export type Problem = {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type PutWorkspaceAccount = {
  kind: "api_key" | "mcp_secret" | "zotero" | "subscription" | "mcp_oauth" | "env_secret";
  provider: string;
  slot: string;
  label?: string;
  hint?: string;
  config?: {
    /** Campos aditivos: el contrato crece sin recompilar (R10). */
    [key: string]: unknown;
  };
  copies: Array<SealedCopy>;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type SealedCopy = {
  machine_id: string;
  /** Sobre TERMINUS-SECRET/1 en base64 */
  sealed: string;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type SelectOrganizationRequest = {
  organization_id: string;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type SelectOrganizationResponse = {
  active_organization_id?: string | null;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type SelectWorkspaceRequest = {
  /** Id del workspace, p. ej. "12". */
  workspace: string;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type SelectWorkspaceResponse = {
  workspace: Workspace;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type Workspace = {
  id: string;
  org?: string;
  name?: string;
  role?: string;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type WorkspaceAccounts = {
  credentials: Array<AccountCredential>;
  recipients: Array<CredentialRecipient>;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};

export type WorkspaceList = {
  items?: Array<Workspace>;
  workspaces?: Array<Workspace>;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};
