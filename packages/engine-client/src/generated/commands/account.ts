// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export type CliAccountDefaultParams = Record<string, never>;
export type CliAccountDefaultOutput = null;

export type CliAccountListParams = Record<string, never>;
export type CliAccountListOutput = null;

export interface AccountCredentialDeleteParams {
  credential: string;
}
export type AccountCredentialDeleteOutput = null;

export interface AccountCredentialRemoveMachineParams {
  credential: string;
  computer: string;
}
export type AccountCredentialRemoveMachineOutput = unknown;

export interface AccountCredentialRestoreMachineParams {
  credential: string;
  computer: string;
}
export type AccountCredentialRestoreMachineOutput = unknown;

export type AccountCredentialsListParams = Record<string, never>;
export type AccountCredentialsListOutput = unknown;

export interface AccountCredentialsUploadParams {
  slots: string[];
}
export type AccountCredentialsUploadOutput = unknown;

export interface AccountLimitsParams {
  provider: string;
  id: string;
  force: boolean;
}
export type AccountLimitsOutput = unknown;

export interface AccountStatusParams {
  provider: string;
  id: string;
}
export type AccountStatusOutput = unknown;

export const COMMANDS_ACCOUNT = {
  "account default": { kind: "cli", scope: null, authority: "admin", channel: null },
  "account list": { kind: "cli", scope: null, authority: "read", channel: null },
  account_credential_delete: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  account_credential_remove_machine: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  account_credential_restore_machine: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  account_credentials_list: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  account_credentials_upload: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  account_limits: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
  account_status: { kind: "invoke", scope: "workspace", authority: "admin", channel: null },
} as const;
