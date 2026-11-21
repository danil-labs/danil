// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
export interface PersonSessionFetchParams {
  method: string;
  path: string;
  body?: unknown | null;
  idempotencyKey?: string | null;
  context?: string | null;
}
export type PersonSessionFetchOutput = unknown;

export interface PersonSessionLoginParams {
  mode?: string | null;
}
export type PersonSessionLoginOutput = unknown;

export interface PersonSessionLoginCompleteParams {
  pasted: string;
}
export type PersonSessionLoginCompleteOutput = unknown;

export interface PersonSessionLogoutParams {
  family?: string | null;
  context?: string | null;
}
export type PersonSessionLogoutOutput = unknown;

export interface PersonSessionSelectOrganizationParams {
  organizationId: string;
  context?: string | null;
}
export type PersonSessionSelectOrganizationOutput = unknown;

export type PersonSessionStatusParams = Record<string, never>;
export type PersonSessionStatusOutput = unknown;

export const COMMANDS_PERSON = {
  person_session_fetch: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  person_session_login: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  person_session_login_complete: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  person_session_logout: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  person_session_select_organization: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
  person_session_status: { kind: "invoke", scope: null, authority: "admin", channel: null, relay: false },
} as const;
