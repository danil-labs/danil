import type { BroadcastSource } from '../../../../../../packages/attention/src/broadcast-panel.ts';
import { resolveWorkspaceAccount } from '../../../../../../packages/attention/src/workspace-account.ts';
import { bffTransport } from '../transport';
import { accountSources, type AgentsSession } from '../workspace-sources';

/** La web: por la entrada alfa y con la cuenta del workspace activo. Otro cliente trae su propia fuente. */
export const webBroadcastSource = (session: BroadcastSource['session'] & AgentsSession, workspace: () => string | null): BroadcastSource => {
  const { prefix, request } = bffTransport();
  return {
    session, request, prefix,
    writes: import.meta.env.TERMINUS_BROADCAST_WRITES === true, delivery: import.meta.env.TERMINUS_BROADCAST_DELIVERY === true, demo: false,
    account: async () => (await resolveWorkspaceAccount(workspace(), accountSources(session)))?.id ?? null,
  };
};
