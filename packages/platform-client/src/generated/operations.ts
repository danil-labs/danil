// GENERADO por scripts/generate.mjs. No editar.
import type { CreateWorkspaceRequest, CredentialProviderList, Loose, Machine, MachineList, MachineTicket, Me, Operation, OrganizationList, SelectOrganizationRequest, SelectOrganizationResponse, SelectWorkspaceRequest, SelectWorkspaceResponse, Workspace, WorkspaceList } from "./types.ts";

export type TransportRequest = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string | undefined>;
  body?: unknown;
};
export type Transport = <T>(req: TransportRequest) => Promise<T>;

export function createOperations(t: Transport) {
  return {
    /** Perfil de la persona y sus organizaciones */
    getMe: () =>
      t<Me>({ method: "GET", path: `/identity/me` }),
    /** Organizaciones de la persona */
    getOrganizations: () =>
      t<OrganizationList>({ method: "GET", path: `/identity/organizations` }),
    /** Fija la organización activa */
    selectOrganization: (args: { idempotencyKey: string; body: SelectOrganizationRequest }) =>
      t<SelectOrganizationResponse>({ method: "POST", path: `/identity/organizations/select`, headers: { "Idempotency-Key": args?.idempotencyKey }, body: args?.body }),
    /** Lista los workspaces */
    getWorkspaces: () =>
      t<WorkspaceList>({ method: "GET", path: `/workspaces` }),
    /** Crea un workspace */
    createWorkspace: (args: { idempotencyKey: string; body: CreateWorkspaceRequest }) =>
      t<Workspace>({ method: "POST", path: `/workspaces`, headers: { "Idempotency-Key": args?.idempotencyKey }, body: args?.body }),
    /** Selecciona el workspace activo */
    selectWorkspace: (args: { idempotencyKey: string; body: SelectWorkspaceRequest }) =>
      t<SelectWorkspaceResponse>({ method: "POST", path: `/workspaces/select`, headers: { "Idempotency-Key": args?.idempotencyKey }, body: args?.body }),
    /** Lista las máquinas visibles para la persona */
    getMachines: (args?: { cursor?: string; limit?: number }) =>
      t<MachineList>({ method: "GET", path: `/machines`, query: { cursor: args?.cursor, limit: args?.limit } }),
    /** Detalle de una máquina */
    getMachine: (args: { id: string }) =>
      t<Machine>({ method: "GET", path: `/machines/${encodeURIComponent(String(args!.id))}` }),
    /** Enciende una máquina */
    startMachine: (args: { id: string; idempotencyKey: string }) =>
      t<Operation>({ method: "POST", path: `/machines/${encodeURIComponent(String(args!.id))}/start`, headers: { "Idempotency-Key": args?.idempotencyKey } }),
    /** Apaga una máquina */
    stopMachine: (args: { id: string; idempotencyKey: string }) =>
      t<Operation>({ method: "POST", path: `/machines/${encodeURIComponent(String(args!.id))}/stop`, headers: { "Idempotency-Key": args?.idempotencyKey } }),
    /** Ticket de un solo uso para abrir la sesión */
    createMachineTicket: (args: { id: string; idempotencyKey: string }) =>
      t<MachineTicket>({ method: "POST", path: `/machines/${encodeURIComponent(String(args!.id))}/tickets`, headers: { "Idempotency-Key": args?.idempotencyKey } }),
    /** Estado de una operación */
    getOperation: (args: { id: string }) =>
      t<Operation>({ method: "GET", path: `/operations/${encodeURIComponent(String(args!.id))}` }),
    /** Proveedores de IA habilitados y estado de la conexión de la persona */
    listCredentialProviders: () =>
      t<CredentialProviderList>({ method: "GET", path: `/credentials/providers` }),
    /** Inicia la conexión de la persona con un proveedor */
    connectCredentialProvider: (args: { provider: string; idempotencyKey: string; body: Loose }) =>
      t<Loose>({ method: "POST", path: `/credentials/providers/${encodeURIComponent(String(args!.provider))}/connections`, headers: { "Idempotency-Key": args?.idempotencyKey }, body: args?.body }),
    /** Desconecta a la persona del proveedor */
    disconnectCredentialProvider: (args: { provider: string; idempotencyKey: string }) =>
      t<void>({ method: "DELETE", path: `/credentials/providers/${encodeURIComponent(String(args!.provider))}/connections/me`, headers: { "Idempotency-Key": args?.idempotencyKey } }),
  };
}
export type Operations = ReturnType<typeof createOperations>;
