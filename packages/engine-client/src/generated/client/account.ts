// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { CliAccountDefaultParams, CliAccountDefaultOutput, CliAccountListParams, CliAccountListOutput, AccountCredentialDeleteParams, AccountCredentialDeleteOutput, AccountCredentialRemoveMachineParams, AccountCredentialRemoveMachineOutput, AccountCredentialRestoreMachineParams, AccountCredentialRestoreMachineOutput, AccountCredentialsListParams, AccountCredentialsListOutput, AccountCredentialsUploadParams, AccountCredentialsUploadOutput, AccountLimitsParams, AccountLimitsOutput, AccountStatusParams, AccountStatusOutput } from "../commands/account.ts";

export function bind_account(t: EngineTransport) {
  return {
    "account default": () => t.call("account default", {}) as Promise<CliAccountDefaultOutput>,
    "account list": () => t.call("account list", {}) as Promise<CliAccountListOutput>,
    account_credential_delete: (params: AccountCredentialDeleteParams) => t.call("account_credential_delete", params) as Promise<AccountCredentialDeleteOutput>,
    account_credential_remove_machine: (params: AccountCredentialRemoveMachineParams) => t.call("account_credential_remove_machine", params) as Promise<AccountCredentialRemoveMachineOutput>,
    account_credential_restore_machine: (params: AccountCredentialRestoreMachineParams) => t.call("account_credential_restore_machine", params) as Promise<AccountCredentialRestoreMachineOutput>,
    account_credentials_list: () => t.call("account_credentials_list", {}) as Promise<AccountCredentialsListOutput>,
    account_credentials_upload: (params: AccountCredentialsUploadParams) => t.call("account_credentials_upload", params) as Promise<AccountCredentialsUploadOutput>,
    account_limits: (params: AccountLimitsParams) => t.call("account_limits", params) as Promise<AccountLimitsOutput>,
    account_status: (params: AccountStatusParams) => t.call("account_status", params) as Promise<AccountStatusOutput>,
  };
}
