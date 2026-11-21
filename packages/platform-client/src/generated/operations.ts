// GENERADO por scripts/generate.mjs. No editar.
import type { AccountCredentialEnvelope, CreateWorkspaceRequest, CredentialProviderList, CsrfToken, GithubAuthorizeRequest, GithubAuthorizeResponse, GithubConnection, Loose, Machine, MachineList, MachineTicket, Me, Ok, Operation, OrganizationList, PutWorkspaceAccount, SelectOrganizationRequest, SelectOrganizationResponse, SelectWorkspaceRequest, SelectWorkspaceResponse, Workspace, WorkspaceAccounts, WorkspaceList } from "./types.ts";

export type TransportRequest = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string | undefined>;
  body?: unknown;
  /** Cancela la petición y su reintento (la vista que la pidió se desmontó). */
  signal?: AbortSignal;
};
/** Opciones por llamada. */
export type RequestOptions = { signal?: AbortSignal };
export type Transport = <T>(req: TransportRequest) => Promise<T>;

export function createOperations(t: Transport) {
  return {
    /** Perfil de la persona y sus organizaciones */
    getMe: (opts?: RequestOptions) =>
      t<Me>({ method: "GET", path: `/identity/me`, signal: opts?.signal }),
    /** Organizaciones de la persona */
    getOrganizations: (opts?: RequestOptions) =>
      t<OrganizationList>({ method: "GET", path: `/identity/organizations`, signal: opts?.signal }),
    /** Fija la organización activa */
    selectOrganization: (args: { idempotencyKey: string; body: SelectOrganizationRequest }, opts?: RequestOptions) =>
      t<SelectOrganizationResponse>({ method: "POST", path: `/identity/organizations/select`, signal: opts?.signal, headers: { "Idempotency-Key": args?.idempotencyKey }, body: args?.body }),
    /** Lista los workspaces */
    getWorkspaces: (opts?: RequestOptions) =>
      t<WorkspaceList>({ method: "GET", path: `/workspaces`, signal: opts?.signal }),
    /** Crea un workspace */
    createWorkspace: (args: { idempotencyKey: string; body: CreateWorkspaceRequest }, opts?: RequestOptions) =>
      t<Workspace>({ method: "POST", path: `/workspaces`, signal: opts?.signal, headers: { "Idempotency-Key": args?.idempotencyKey }, body: args?.body }),
    /** Selecciona el workspace activo */
    selectWorkspace: (args: { idempotencyKey: string; body: SelectWorkspaceRequest }, opts?: RequestOptions) =>
      t<SelectWorkspaceResponse>({ method: "POST", path: `/workspaces/select`, signal: opts?.signal, headers: { "Idempotency-Key": args?.idempotencyKey }, body: args?.body }),
    /** Lista las máquinas visibles para la persona */
    getMachines: (args?: { cursor?: string; limit?: number }, opts?: RequestOptions) =>
      t<MachineList>({ method: "GET", path: `/machines`, signal: opts?.signal, query: { cursor: args?.cursor, limit: args?.limit } }),
    /** Detalle de una máquina */
    getMachine: (args: { id: string }, opts?: RequestOptions) =>
      t<Machine>({ method: "GET", path: `/machines/${encodeURIComponent(String(args!.id))}`, signal: opts?.signal }),
    /** Enciende una máquina */
    startMachine: (args: { id: string; idempotencyKey: string }, opts?: RequestOptions) =>
      t<Operation>({ method: "POST", path: `/machines/${encodeURIComponent(String(args!.id))}/start`, signal: opts?.signal, headers: { "Idempotency-Key": args?.idempotencyKey } }),
    /** Apaga una máquina */
    stopMachine: (args: { id: string; idempotencyKey: string }, opts?: RequestOptions) =>
      t<Operation>({ method: "POST", path: `/machines/${encodeURIComponent(String(args!.id))}/stop`, signal: opts?.signal, headers: { "Idempotency-Key": args?.idempotencyKey } }),
    /** Ticket de un solo uso para abrir la sesión */
    createMachineTicket: (args: { id: string; idempotencyKey: string }, opts?: RequestOptions) =>
      t<MachineTicket>({ method: "POST", path: `/machines/${encodeURIComponent(String(args!.id))}/tickets`, signal: opts?.signal, headers: { "Idempotency-Key": args?.idempotencyKey } }),
    /** Estado de una operación */
    getOperation: (args: { id: string }, opts?: RequestOptions) =>
      t<Operation>({ method: "GET", path: `/operations/${encodeURIComponent(String(args!.id))}`, signal: opts?.signal }),
    /** Proveedores de IA habilitados y estado de la conexión de la persona */
    listCredentialProviders: (opts?: RequestOptions) =>
      t<CredentialProviderList>({ method: "GET", path: `/credentials/providers`, signal: opts?.signal }),
    /** Inicia la conexión de la persona con un proveedor */
    connectCredentialProvider: (args: { provider: string; idempotencyKey: string; body: Loose }, opts?: RequestOptions) =>
      t<Loose>({ method: "POST", path: `/credentials/providers/${encodeURIComponent(String(args!.provider))}/connections`, signal: opts?.signal, headers: { "Idempotency-Key": args?.idempotencyKey }, body: args?.body }),
    /** Desconecta a la persona del proveedor */
    disconnectCredentialProvider: (args: { provider: string; idempotencyKey: string }, opts?: RequestOptions) =>
      t<void>({ method: "DELETE", path: `/credentials/providers/${encodeURIComponent(String(args!.provider))}/connections/me`, signal: opts?.signal, headers: { "Idempotency-Key": args?.idempotencyKey } }),
    /** Cuentas de IA del workspace y máquinas destinatarias */
    getWorkspaceAccounts: (args: { workspace_id: string }, opts?: RequestOptions) =>
      t<WorkspaceAccounts>({ method: "GET", path: `/credentials/workspaces/${encodeURIComponent(String(args!.workspace_id))}/accounts`, signal: opts?.signal }),
    /** Guarda o rota una cuenta de IA con sus copias selladas */
    putWorkspaceAccount: (args: { workspace_id: string; body: PutWorkspaceAccount }, opts?: RequestOptions) =>
      t<AccountCredentialEnvelope>({ method: "PUT", path: `/credentials/workspaces/${encodeURIComponent(String(args!.workspace_id))}/accounts`, signal: opts?.signal, body: args?.body }),
    /** Borra la cuenta y sus copias */
    deleteWorkspaceAccount: (args: { workspace_id: string; credential_id: string }, opts?: RequestOptions) =>
      t<Ok>({ method: "DELETE", path: `/credentials/workspaces/${encodeURIComponent(String(args!.workspace_id))}/accounts/${encodeURIComponent(String(args!.credential_id))}`, signal: opts?.signal }),
    /** Quita una máquina de la cuenta */
    removeWorkspaceAccountMachine: (args: { workspace_id: string; credential_id: string; machine_id: string }, opts?: RequestOptions) =>
      t<Ok>({ method: "DELETE", path: `/credentials/workspaces/${encodeURIComponent(String(args!.workspace_id))}/accounts/${encodeURIComponent(String(args!.credential_id))}/machines/${encodeURIComponent(String(args!.machine_id))}`, signal: opts?.signal }),
    /** Devuelve la máquina a pending */
    restoreWorkspaceAccountMachine: (args: { workspace_id: string; credential_id: string; machine_id: string }, opts?: RequestOptions) =>
      t<Ok>({ method: "POST", path: `/credentials/workspaces/${encodeURIComponent(String(args!.workspace_id))}/accounts/${encodeURIComponent(String(args!.credential_id))}/machines/${encodeURIComponent(String(args!.machine_id))}/restore`, signal: opts?.signal }),
    /** Estado de GitHub de la persona */
    getGithubConnection: (opts?: RequestOptions) =>
      t<GithubConnection>({ method: "GET", path: `/credentials/github`, signal: opts?.signal }),
    /** Revoca y borra la conexión de GitHub */
    disconnectGithub: (opts?: RequestOptions) =>
      t<Ok>({ method: "DELETE", path: `/credentials/github`, signal: opts?.signal }),
    /** URL para autorizar GitHub en el navegador */
    authorizeGithub: (args: { body: GithubAuthorizeRequest }, opts?: RequestOptions) =>
      t<GithubAuthorizeResponse>({ method: "POST", path: `/credentials/github/authorize`, signal: opts?.signal, body: args?.body }),
    /** CSRF de la sesión web (cookie); se manda como X-CSRF-Token en cada mutación */
    getCsrf: (opts?: RequestOptions) =>
      t<CsrfToken>({ method: "GET", path: `/identity/csrf`, signal: opts?.signal }),
    /** Cierra la sesión web y borra la cookie */
    logout: (args?: { body?: {
  [key: string]: unknown;
} }, opts?: RequestOptions) =>
      t<void>({ method: "POST", path: `/identity/logout`, signal: opts?.signal, body: args?.body }),
  };
}
export type Operations = ReturnType<typeof createOperations>;
