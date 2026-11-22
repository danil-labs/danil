// GENERADO por packages/platform-client/scripts/generate.mjs desde contract/openapi.json. No editar a mano.
// repo: danil-labs/danil-contracts; commit: 76173608d54571782453c165d1cfcacf612a6ea1; path: platform/openapi.json
// source: ../../contract/openapi.json

/** sha256 del openapi.json vendorizado (R7): si no coincide, se regenera. */
export const CONTRACT_HASH = "88fa77dbb0c5d43d72b7c77e4fcb7fcb3d53ca0e7289951c1b1f87ae9b56bf30";
export const CONTRACT_VERSION = "0.1.0-draft";

/** Método y ruta de cada operación generada. */
export const OPERATIONS = {
  getMe: { method: "GET", path: "/v1/identity/me" },
  getOrganizations: { method: "GET", path: "/v1/identity/organizations" },
  selectOrganization: { method: "POST", path: "/v1/identity/organizations/select" },
  getWorkspaces: { method: "GET", path: "/v1/workspaces" },
  selectWorkspace: { method: "POST", path: "/v1/workspaces/select" },
  getMachines: { method: "GET", path: "/v1/machines" },
  getMachine: { method: "GET", path: "/v1/machines/{id}" },
  startMachine: { method: "POST", path: "/v1/machines/{id}/start" },
  stopMachine: { method: "POST", path: "/v1/machines/{id}/stop" },
  createMachineTicket: { method: "POST", path: "/v1/machines/{id}/tickets" },
  getOperation: { method: "GET", path: "/v1/operations/{id}" },
} as const;
