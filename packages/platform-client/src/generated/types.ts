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
