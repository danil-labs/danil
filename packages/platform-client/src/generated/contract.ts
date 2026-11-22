// GENERADO por packages/platform-client/scripts/generate.mjs desde contract/openapi.json. No editar a mano.
// repo: danil-labs/danil-contracts; commit: 23b351f70eb03f241047d339510a8f1b5caef2d0; path: platform/openapi.json; billing-v2: platform/billing-v2/openapi/public.openapi.json platform/billing-v2/schemas/common.v1.schema.json (mismo commit; copiados en contract/billing-v2/)
// source: ../../contract/openapi.json

/** sha256 del openapi.json vendorizado (R7): si no coincide, se regenera. */
export const CONTRACT_HASH = "9a5642ac2330ee2f7cf57f621739752e65f51e0ec2608af9d00d6b94fd16dc93";
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
  listCredentialProviders: { method: "GET", path: "/v1/credentials/providers" },
  connectCredentialProvider: { method: "POST", path: "/v1/credentials/providers/{provider}/connections" },
  disconnectCredentialProvider: { method: "DELETE", path: "/v1/credentials/providers/{provider}/connections/me" },
  getWorkspaceAccounts: { method: "GET", path: "/v1/credentials/workspaces/{workspace_id}/accounts" },
  putWorkspaceAccount: { method: "PUT", path: "/v1/credentials/workspaces/{workspace_id}/accounts" },
  deleteWorkspaceAccount: { method: "DELETE", path: "/v1/credentials/workspaces/{workspace_id}/accounts/{credential_id}" },
  removeWorkspaceAccountMachine: { method: "DELETE", path: "/v1/credentials/workspaces/{workspace_id}/accounts/{credential_id}/machines/{machine_id}" },
  restoreWorkspaceAccountMachine: { method: "POST", path: "/v1/credentials/workspaces/{workspace_id}/accounts/{credential_id}/machines/{machine_id}/restore" },
  getGithubConnection: { method: "GET", path: "/v1/credentials/github" },
  disconnectGithub: { method: "DELETE", path: "/v1/credentials/github" },
  authorizeGithub: { method: "POST", path: "/v1/credentials/github/authorize" },
} as const;

/** sha256 de billing-v2 (public.openapi.json y luego common.v1.schema.json); si no coincide, se regenera. */
export const BILLING_CONTRACT_HASH = "b70643f3dafc28ec2eb2725c1d35bded3b871163aaa884c800cde0b2123092d7";
export const BILLING_CONTRACT_VERSION = "2.13.0-draft";

/** Método y ruta de cada operación de billing-v2 generada. */
export const BILLING_OPERATIONS = {
  getCatalog: { method: "GET", path: "/v1/billing/catalog" },
  getOrganizationBilling: { method: "GET", path: "/v1/billing/organization" },
  createCheckoutSession: { method: "POST", path: "/v1/billing/checkout-sessions" },
  getCheckoutSession: { method: "GET", path: "/v1/billing/checkout-sessions/{checkout_id}" },
  createPortalSession: { method: "POST", path: "/v1/billing/portal-sessions" },
  getCreditBalance: { method: "GET", path: "/v1/credits/balance" },
  listCreditTransactions: { method: "GET", path: "/v1/credits/transactions" },
  createCreditPurchase: { method: "POST", path: "/v1/credits/purchases" },
  getCreditPurchase: { method: "GET", path: "/v1/credits/purchases/{purchase_id}" },
} as const;
