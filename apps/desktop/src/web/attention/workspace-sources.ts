import { type DirectoryEntry, listDirectory } from '@terminus/computers';
import type { InboxSession } from '../../../../../packages/attention/src/inbox.ts';
import { type AccountSources, enterWorkspace } from '../../../../../packages/attention/src/workspace-account.ts';
import { bffTransport } from './transport';

/** La sesión de las pantallas de agentes: quién es, qué puede entrar y el workspace con que habla al BFF. */
export type AgentsSession = InboxSession & {
  directory: () => Promise<DirectoryEntry[]>;
  rememberWorkspace: (key: string | null) => void;
};

export function agentsSession(endpoint: string, session: InboxSession): AgentsSession {
  let key: string | null = null;
  return {
    ...session,
    workspaceKey: () => key,
    rememberWorkspace: value => { key = value; },
    reenter: async () => {
      if (!key) return false;
      const bff = bffTransport();
      return enterWorkspace(session, bff.request, bff.prefix, key).then(() => true, () => false);
    },
    directory: async () => {
      const answer = await listDirectory(endpoint, await session.getToken());
      if (answer.kind !== 'ok') throw new Error('directory_unavailable');
      return answer.value.workspaces;
    },
  };
}

export const accountSources = (session: AgentsSession): AccountSources => ({
  directory: session.directory,
  active: () => bffTransport().active(session),
  enter: key => {
    const bff = bffTransport();
    return enterWorkspace(session, bff.request, bff.prefix, key);
  },
  remember: session.rememberWorkspace,
});
