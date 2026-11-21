// GENERADO por packages/engine-client/scripts/generate.mjs. No editar a mano.
import type { EngineTransport } from "../transport.ts";
import type { PersonSessionFetchParams, PersonSessionFetchOutput, PersonSessionLoginParams, PersonSessionLoginOutput, PersonSessionLoginCompleteParams, PersonSessionLoginCompleteOutput, PersonSessionLogoutParams, PersonSessionLogoutOutput, PersonSessionSelectOrganizationParams, PersonSessionSelectOrganizationOutput, PersonSessionStatusParams, PersonSessionStatusOutput } from "../commands/person.ts";

export function bind_person(t: EngineTransport) {
  return {
    person_session_fetch: (params: PersonSessionFetchParams) => t.call("person_session_fetch", params) as Promise<PersonSessionFetchOutput>,
    person_session_login: (params?: PersonSessionLoginParams) => t.call("person_session_login", params) as Promise<PersonSessionLoginOutput>,
    person_session_login_complete: (params: PersonSessionLoginCompleteParams) => t.call("person_session_login_complete", params) as Promise<PersonSessionLoginCompleteOutput>,
    person_session_logout: (params?: PersonSessionLogoutParams) => t.call("person_session_logout", params) as Promise<PersonSessionLogoutOutput>,
    person_session_select_organization: (params: PersonSessionSelectOrganizationParams) => t.call("person_session_select_organization", params) as Promise<PersonSessionSelectOrganizationOutput>,
    person_session_status: () => t.call("person_session_status", {}) as Promise<PersonSessionStatusOutput>,
  };
}
