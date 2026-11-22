// GENERADO por packages/platform-client/scripts/generate.mjs desde contract/openapi.json. No editar a mano.
// repo: danil-labs/danil-contracts; commit: 76173608d54571782453c165d1cfcacf612a6ea1; path: platform/openapi.json

// Dominios: machines, identity, workspaces.

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

export type WorkspaceList = {
  items?: Array<Workspace>;
  workspaces?: Array<Workspace>;
  /** Campos aditivos: el contrato crece sin recompilar (R10). */
  [key: string]: unknown;
};
