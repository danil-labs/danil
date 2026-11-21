// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { DanilAccountRefreshParams, DanilAccountRefreshOutput, DanilAccountRemovePhotoParams, DanilAccountRemovePhotoOutput, DanilAccountSetPhotoParams, DanilAccountSetPhotoOutput, DanilClientTokenParams, DanilClientTokenOutput, DanilConnectOptionsParams, DanilConnectOptionsOutput, DanilConnectStartParams, DanilConnectStartOutput, DanilConnectStatusParams, DanilConnectStatusOutput, DanilDisconnectParams, DanilDisconnectOutput, DanilSessionsParams, DanilSessionsOutput, DanilSetDefaultAccountParams, DanilSetDefaultAccountOutput, DanilWorkspaceAccountParams, DanilWorkspaceAccountOutput, DanilWorkspaceLinkParams, DanilWorkspaceLinkOutput, DanilWorkspaceLinkStatusParams, DanilWorkspaceLinkStatusOutput, DanilWorkspaceSetAccountParams, DanilWorkspaceSetAccountOutput, DanilWorkspaceUnlinkParams, DanilWorkspaceUnlinkOutput } from "../commands/danil.ts";

export function bind_danil(t: EngineTransport) {
  return {
    danil_account_refresh: (params?: DanilAccountRefreshParams) => t.call("danil_account_refresh", params) as Promise<DanilAccountRefreshOutput>,
    danil_account_remove_photo: (params?: DanilAccountRemovePhotoParams) => t.call("danil_account_remove_photo", params) as Promise<DanilAccountRemovePhotoOutput>,
    danil_account_set_photo: (params: DanilAccountSetPhotoParams) => t.call("danil_account_set_photo", params) as Promise<DanilAccountSetPhotoOutput>,
    danil_client_token: (params?: DanilClientTokenParams) => t.call("danil_client_token", params) as Promise<DanilClientTokenOutput>,
    danil_connect_options: () => t.call("danil_connect_options", {}) as Promise<DanilConnectOptionsOutput>,
    danil_connect_start: (params?: DanilConnectStartParams) => t.call("danil_connect_start", params) as Promise<DanilConnectStartOutput>,
    danil_connect_status: () => t.call("danil_connect_status", {}) as Promise<DanilConnectStatusOutput>,
    danil_disconnect: (params?: DanilDisconnectParams) => t.call("danil_disconnect", params) as Promise<DanilDisconnectOutput>,
    danil_sessions: () => t.call("danil_sessions", {}) as Promise<DanilSessionsOutput>,
    danil_set_default_account: (params: DanilSetDefaultAccountParams) => t.call("danil_set_default_account", params) as Promise<DanilSetDefaultAccountOutput>,
    danil_workspace_account: (params?: DanilWorkspaceAccountParams) => t.call("danil_workspace_account", params) as Promise<DanilWorkspaceAccountOutput>,
    danil_workspace_link: (params?: DanilWorkspaceLinkParams) => t.call("danil_workspace_link", params) as Promise<DanilWorkspaceLinkOutput>,
    danil_workspace_link_status: (params?: DanilWorkspaceLinkStatusParams) => t.call("danil_workspace_link_status", params) as Promise<DanilWorkspaceLinkStatusOutput>,
    danil_workspace_set_account: (params?: DanilWorkspaceSetAccountParams) => t.call("danil_workspace_set_account", params) as Promise<DanilWorkspaceSetAccountOutput>,
    danil_workspace_unlink: (params?: DanilWorkspaceUnlinkParams) => t.call("danil_workspace_unlink", params) as Promise<DanilWorkspaceUnlinkOutput>,
  };
}
