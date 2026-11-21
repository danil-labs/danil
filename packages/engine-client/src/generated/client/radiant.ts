// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { RadiantCancelLoginParams, RadiantCancelLoginOutput, RadiantConnectAccountParams, RadiantConnectAccountOutput, RadiantGovernDisableParams, RadiantGovernDisableOutput, RadiantGovernEnableParams, RadiantGovernEnableOutput, RadiantGovernRefreshParams, RadiantGovernRefreshOutput, RadiantGovernanceStatusParams, RadiantGovernanceStatusOutput, RadiantLoginParams, RadiantLoginOutput, RadiantLogoutParams, RadiantLogoutOutput, RadiantSelectOrganizationParams, RadiantSelectOrganizationOutput, RadiantSelectWorkspaceParams, RadiantSelectWorkspaceOutput, RadiantSetServerParams, RadiantSetServerOutput, RadiantStatusParams, RadiantStatusOutput, RadiantUsageSetOptInParams, RadiantUsageSetOptInOutput, RadiantUsageStatusParams, RadiantUsageStatusOutput } from "../commands/radiant.ts";

export function bind_radiant(t: EngineTransport) {
  return {
    radiant_cancel_login: () => t.call("radiant_cancel_login", {}) as Promise<RadiantCancelLoginOutput>,
    radiant_connect_account: (params: RadiantConnectAccountParams) => t.call("radiant_connect_account", params) as Promise<RadiantConnectAccountOutput>,
    radiant_govern_disable: () => t.call("radiant_govern_disable", {}) as Promise<RadiantGovernDisableOutput>,
    radiant_govern_enable: () => t.call("radiant_govern_enable", {}) as Promise<RadiantGovernEnableOutput>,
    radiant_govern_refresh: () => t.call("radiant_govern_refresh", {}) as Promise<RadiantGovernRefreshOutput>,
    radiant_governance_status: () => t.call("radiant_governance_status", {}) as Promise<RadiantGovernanceStatusOutput>,
    radiant_login: () => t.call("radiant_login", {}) as Promise<RadiantLoginOutput>,
    radiant_logout: () => t.call("radiant_logout", {}) as Promise<RadiantLogoutOutput>,
    radiant_select_organization: (params: RadiantSelectOrganizationParams) => t.call("radiant_select_organization", params) as Promise<RadiantSelectOrganizationOutput>,
    radiant_select_workspace: (params: RadiantSelectWorkspaceParams) => t.call("radiant_select_workspace", params) as Promise<RadiantSelectWorkspaceOutput>,
    radiant_set_server: (params: RadiantSetServerParams) => t.call("radiant_set_server", params) as Promise<RadiantSetServerOutput>,
    radiant_status: () => t.call("radiant_status", {}) as Promise<RadiantStatusOutput>,
    radiant_usage_set_opt_in: (params: RadiantUsageSetOptInParams) => t.call("radiant_usage_set_opt_in", params) as Promise<RadiantUsageSetOptInOutput>,
    radiant_usage_status: () => t.call("radiant_usage_status", {}) as Promise<RadiantUsageStatusOutput>,
  };
}
