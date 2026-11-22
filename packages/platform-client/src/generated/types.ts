// GENERADO por packages/platform-client/scripts/generate.mjs desde contract/openapi.json. No editar a mano.
// repo: danil-labs/danil-contracts; commit: 23b351f70eb03f241047d339510a8f1b5caef2d0; path: platform/openapi.json; billing-v2: platform/billing-v2/openapi/public.openapi.json platform/billing-v2/schemas/common.v1.schema.json (mismo commit; copiados en contract/billing-v2/)

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
  /** Id del workspace de la sesión (claim `workspace` del acceso), o null si no hay contexto. Es un identificador, no el objeto Workspace (identity: me_profile, migración 025). */
  workspace?: string | null;
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

/** Respuesta de GET /v1/identity/organizations: { items, next_cursor, active_organization_id } (identity@0e41244:src/organizations.ts:61). */
export type OrganizationList = {
  /** Organizaciones activas de la persona con plan y role, ordenadas por nombre e id (identity@0e41244:src/organizations.ts:26-35). */
  items?: Array<OrganizationRef>;
  /** Identity no lo devuelve (identity@0e41244:src/organizations.ts:61 responde solo items, next_cursor y active_organization_id); usar items. Se conserva solo por compatibilidad (regla 10). */
  organizations?: Array<OrganizationRef>;
  /** Organización de la sesión (claim org), o null si la sesión no tiene organización. */
  active_organization_id?: string | null;
  /** Cursor opaco de la página siguiente; null si no hay más. Hoy identity devuelve siempre null (lista completa). */
  next_cursor?: string | null;
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
  /** Identity no lo devuelve; usar organization.id. Se conserva solo por compatibilidad (regla 10). */
  active_organization_id?: string | null;
  /** Organización elegida, con plan y role. */
  organization?: OrganizationRef;
  /** Workspace de la sesión tras elegir; hoy identity devuelve null y el workspace se elige con POST /v1/workspaces/select. */
  workspace?: string | null;
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

/** DTO de workspaces (workspaces@deb0096:src/workspace-admin.ts:164-178; src/service.ts:189-201). */
export type Workspace = {
  id: string;
  org?: string;
  name?: string;
  role?: string;
  /** Id del workspace en el motor. Se omite si aún no está asignado o si la fila es de una organización distinta de la de la sesión. */
  engine_workspace_id?: string;
  /** Dónde puede correr, efectivo (sin nube permitida, solo personal). */
  runs_on?: Array<"personal" | "cloud">;
  /** Lo guardado, solo cuando difiere del efectivo porque la organización ya no permite nube. */
  runs_on_saved?: Array<"personal" | "cloud">;
  /** Derivado de runs_on; se conserva para los clientes que aún lo leen. */
  placement?: {
    /** member_computer u organization_machine; un valor desconocido se lee como organization_machine. */
    kind: string;
    /** Campos aditivos: el contrato crece sin recompilar (R10). */
    [key: string]: unknown;
  };
  /** active o archived (enumeración abierta). */
  state?: string;
  /** Solo true, cuando state es archived. */
  archived?: boolean;
  /** source_version; se manda como if_version al editar o trasladar. */
  version?: number;
  /** Siempre organization; se conserva por compatibilidad. */
  visibility?: string;
  /** Origen de un workspace trasladado. */
  moved_from?: {
    org?: string;
    account_id?: string;
    /** Campos aditivos: el contrato crece sin recompilar (R10). */
    [key: string]: unknown;
  };
  /** Solo en la respuesta de adopción: huella de la llave del motor. */
  possession?: {
    jkt?: string;
    /** Campos aditivos: el contrato crece sin recompilar (R10). */
    [key: string]: unknown;
  };
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
  /** Cursor opaco de la página siguiente (páginas de 50; se envía como ?cursor=); null si no hay más. */
  next_cursor?: string | null;
  /** Solo cuando items está vacío. Enumeración abierta; hoy: no_organization (la sesión no tiene organización) o no_workspace_access (sin membresía en ningún workspace). Un valor desconocido se trata como vacío sin causa conocida. */
  empty_reason?: string;
  /** Workspace activo de la sesión, o null si no hay. */
  active_workspace_id?: string | null;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};
