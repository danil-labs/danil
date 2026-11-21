// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type RadiantCancelLoginParams = Record<string, never>;
export type RadiantCancelLoginOutput = unknown;

export interface RadiantConnectAccountParams {
  id: string;
}
export type RadiantConnectAccountOutput = null;

export type RadiantGovernDisableParams = Record<string, never>;
export type RadiantGovernDisableOutput = unknown;

export type RadiantGovernEnableParams = Record<string, never>;
export type RadiantGovernEnableOutput = unknown;

export type RadiantGovernRefreshParams = Record<string, never>;
export type RadiantGovernRefreshOutput = unknown;

export type RadiantGovernanceStatusParams = Record<string, never>;
export type RadiantGovernanceStatusOutput = unknown;

export type RadiantLoginParams = Record<string, never>;
export type RadiantLoginOutput = unknown;

export type RadiantLogoutParams = Record<string, never>;
export type RadiantLogoutOutput = unknown;

export interface RadiantSelectOrganizationParams {
  id: string;
}
export type RadiantSelectOrganizationOutput = unknown;

export interface RadiantSelectWorkspaceParams {
  id: string;
}
export type RadiantSelectWorkspaceOutput = unknown;

export interface RadiantSetServerParams {
  server: string;
}
export type RadiantSetServerOutput = unknown;

export type RadiantStatusParams = Record<string, never>;
export type RadiantStatusOutput = unknown;

export interface RadiantUsageSetOptInParams {
  enabled: boolean;
}
export type RadiantUsageSetOptInOutput = unknown;

export type RadiantUsageStatusParams = Record<string, never>;
export type RadiantUsageStatusOutput = unknown;

export const COMMANDS_RADIANT = {
  radiant_cancel_login: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  radiant_connect_account: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  radiant_govern_disable: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  radiant_govern_enable: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  radiant_govern_refresh: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  radiant_governance_status: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  radiant_login: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  radiant_logout: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  radiant_select_organization: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  radiant_select_workspace: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  radiant_set_server: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  radiant_status: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  radiant_usage_set_opt_in: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  radiant_usage_status: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
} as const;
