// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface CancelBrowserLoginParams {
  id: string;
  scope?: string | null;
}
export type CancelBrowserLoginOutput = null;

export interface CancelGoogleDriveLoginParams {
  workspace?: string | null;
}
export type CancelGoogleDriveLoginOutput = null;

export interface CancelInstallParams {
  operation: string;
}
export type CancelInstallOutput = boolean;

export type CancelLocalModelParams = Record<string, never>;
export type CancelLocalModelOutput = null;

export interface CancelLoginParams {
  id: string;
}
export type CancelLoginOutput = null;

export interface CancelProjectCloneParams {
  operation: string;
}
export type CancelProjectCloneOutput = null;

export interface CancelQuestionParams {
  project: string;
  session: string;
  turn: string;
}
export type CancelQuestionOutput = unknown;

export const COMMANDS_CANCEL = {
  cancel_browser_login: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  cancel_google_drive_login: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  cancel_install: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
  cancel_local_model: { kind: "invoke", scope: "machine", authority: "admin", channel: null, relay: true },
  cancel_login: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  cancel_project_clone: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
  cancel_question: { kind: "invoke", scope: "workspace", authority: "admin", channel: null, relay: true },
} as const;
