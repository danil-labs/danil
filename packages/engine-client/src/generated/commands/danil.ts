// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface DanilAccountRefreshParams {
  account?: string | null;
}
export type DanilAccountRefreshOutput = unknown;

export interface DanilAccountRemovePhotoParams {
  account?: string | null;
}
export type DanilAccountRemovePhotoOutput = unknown;

export interface DanilAccountSetPhotoParams {
  image: string;
  account?: string | null;
}
export type DanilAccountSetPhotoOutput = unknown;

export interface DanilClientTokenParams {
  account?: string | null;
}
export type DanilClientTokenOutput = unknown;

export type DanilConnectOptionsParams = Record<string, never>;
export type DanilConnectOptionsOutput = unknown[];

export interface DanilConnectStartParams {
  name?: string | null;
  workspace?: string | null;
  accountHint?: string | null;
  add?: boolean | null;
}
export type DanilConnectStartOutput = unknown;

export type DanilConnectStatusParams = Record<string, never>;
export type DanilConnectStatusOutput = unknown;

export interface DanilConnectedDetachParams {
  organizationId: string;
}
export type DanilConnectedDetachOutput = unknown;

export type DanilConnectedStatusParams = Record<string, never>;
export type DanilConnectedStatusOutput = unknown;

export interface DanilDisconnectParams {
  account?: string | null;
}
export type DanilDisconnectOutput = unknown;

export type DanilSessionsParams = Record<string, never>;
export type DanilSessionsOutput = unknown[];

export interface DanilSetDefaultAccountParams {
  account: string;
}
export type DanilSetDefaultAccountOutput = unknown[];

export interface DanilWorkspaceAccountParams {
  workspace?: string | null;
}
export type DanilWorkspaceAccountOutput = unknown;

export interface DanilWorkspaceLinkParams {
  mode?: string | null;
  workspace?: string | null;
}
export type DanilWorkspaceLinkOutput = unknown;

export interface DanilWorkspaceLinkStatusParams {
  workspace?: string | null;
}
export type DanilWorkspaceLinkStatusOutput = unknown;

export interface DanilWorkspaceSetAccountParams {
  workspace?: string | null;
  account?: string | null;
}
export type DanilWorkspaceSetAccountOutput = unknown;

export interface DanilWorkspaceUnlinkParams {
  workspace?: string | null;
}
export type DanilWorkspaceUnlinkOutput = unknown;

export const COMMANDS_DANIL = {
  danil_account_refresh: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  danil_account_remove_photo: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  danil_account_set_photo: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  danil_client_token: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  danil_connect_options: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  danil_connect_start: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  danil_connect_status: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  danil_connected_detach: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  danil_connected_status: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  danil_disconnect: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  danil_sessions: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  danil_set_default_account: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  danil_workspace_account: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  danil_workspace_link: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  danil_workspace_link_status: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  danil_workspace_set_account: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  danil_workspace_unlink: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
} as const;
