import { PlatformSessionError, type platformSession, type PlatformProfile } from './platform-session.ts';
import { workspaceSelection } from './workspace-selection.ts';

/** Missing organization endpoints use membership data without inventing a plan or active tenant. */
export function organizationSession(api: ReturnType<typeof platformSession>, key?: () => string) {
  async function list(person: PlatformProfile) {
    try { return { ...await api.organizations(), fallback: false }; }
    catch (error) {
      if (!(error instanceof PlatformSessionError) || ![404, 501].includes(error.status)) throw error;
      return { items: person.organizations, active_organization_id: person.active_organization_id ?? null, fallback: true };
    }
  }
  const intent = workspaceSelection({
    active: async () => (await list(await api.me())).active_organization_id,
    select: (id, idempotencyKey) => api.selectOrganization(id, idempotencyKey),
  }, key, [404, 501]);
  return { ...intent, list };
}
