import { type AccountWorkspace, accountWorkspace, type Answer, type Computer } from './api.ts';
import { requestId } from './relay.ts';

/** An edge session owns authentication, CSRF, deadlines and HTTP problems. */
export type ComputeTransport = {
  call(path: string, init?: RequestInit): Promise<Response>;
  mutation(path: string, init?: RequestInit): Promise<Response>;
};
export type Admission = { url: string; ticket: string };

export function computeClient(transport: ComputeTransport) {
  async function call<T>(path: string, read: (value: unknown) => T, method = 'GET', body?: unknown): Promise<Answer<T>> {
    try {
      const response = method === 'GET' ? await transport.call(`compute/${path}`) : await transport.mutation(`compute/${path}`, {
        method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId() },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { kind: 'ok', value: read(response.status === 204 ? null : await response.json()) };
    } catch (error) {
      const problem = error as { status?: number; code?: string } | null;
      if (problem?.status === 401) return { kind: 'unauthorized' };
      if (problem?.status === 404) return { kind: 'missing' };
      if (problem?.code === 'license_required') return { kind: 'license' };
      return { kind: 'error', status: problem?.status ?? null, ...(problem?.code ? { code: problem.code } : {}) };
    }
  }
  const idPath = (id: string) => `computers/${encodeURIComponent(id)}`;
  return {
    list: () => call('computers', value => {
      const rows = (value as { computers?: unknown } | null)?.computers;
      if (!Array.isArray(rows) || rows.some(c => typeof c?.computer_id !== 'string' || typeof c?.state !== 'string')) throw new Error('invalid_computers');
      return rows as Computer[];
    }),
    workspaces: () => call('workspaces', value => {
      const rows = (value as { workspaces?: unknown } | null)?.workspaces;
      if (!Array.isArray(rows)) throw new Error('invalid_workspaces');
      return rows.map(accountWorkspace).map(row => {
        if (!row) throw new Error('invalid_workspace');
        return row;
      }) as AccountWorkspace[];
    }),
    start: (id: string) => call(`${idPath(id)}/start`, value => {
      const state = (value as { state?: unknown } | null)?.state;
      if (typeof state !== 'string') throw new Error('invalid_start');
      return { state };
    }, 'POST'),
    async admission(id: string): Promise<Admission> {
      const response = await transport.mutation(`compute/computers/${encodeURIComponent(id)}/tickets`, {
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId() },
      });
      const value = await response.json() as Partial<Admission>;
      if (typeof value.ticket !== 'string' || !value.ticket || typeof value.url !== 'string') throw new Error('invalid_admission');
      const url = new URL(value.url);
      if (url.protocol === 'https:') url.protocol = 'wss:';
      if (url.origin !== 'wss://connect.danil.ai' || url.pathname !== `/v1/compute/computers/${encodeURIComponent(id)}/session` || url.search || url.hash || url.username || url.password) throw new Error('invalid_admission_url');
      return { url: url.href, ticket: value.ticket };
    },
  };
}
