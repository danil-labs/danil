import type { InboxSession } from './inbox.ts';

/**
 * Same-origin BFF call with the session token; a 401 refreshes the session and retries once.
 * With `workspaceKey` it sends `X-Danil-Workspace`. A stale tab gets 409 with no data: it
 * enters again (`reenter`) and retries once.
 */
export function sessionFetch(session: InboxSession, request: typeof fetch) {
  return async (url: string, init: RequestInit = {}) => {
    const send = async () => {
      const key = session.workspaceKey?.();
      return request(url, { ...init, cache: 'no-store', headers: { ...init.headers, ...(key ? { 'X-Danil-Workspace': key } : {}), Authorization: `Bearer ${await session.getToken()}` } });
    };
    const response = await send();
    if (response.status === 401) return await session.unauthorized() ? send() : response;
    if (response.status !== 409 || !session.reenter) return response;
    const body = await response.clone().json().catch(() => null) as { error?: unknown } | null;
    return body?.error === 'workspace_context_mismatch' && await session.reenter() ? send() : response;
  };
}
