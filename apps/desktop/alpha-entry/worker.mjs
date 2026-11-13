export { DesktopCodeStore } from './desktop-code-store.mjs';
import { upstreamSignal } from './transport.mjs';
import { dependencyProblem, logDependency } from './dependency-error.mjs';

const HOST = 'alfa-app.danil.ai';
const json = (error, status) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/** Assets only: every service request is made directly to the configured edge. */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname !== (env.ENTRY_HOST?.trim() || HOST) || url.protocol !== 'https:') return json('not_found', 404);
    if (url.pathname === '/terminus' || url.pathname.startsWith('/terminus/')) {
      if (!['GET', 'HEAD'].includes(request.method)) return json('method_not_allowed', 405);
      url.pathname = url.pathname.slice('/terminus'.length) || '/';
      return new Response(null, { status: 308, headers: { Location: url.href, 'Cache-Control': 'no-store' } });
    }
    if (/^\/(alpha-api|v1)(\/|$)/.test(url.pathname) || /^\/auth\//.test(url.pathname)) return json('not_found', 404);
    if (!['GET', 'HEAD'].includes(request.method)) return json('method_not_allowed', 405);
    if (!env.TERMINUS_WEB) return dependencyProblem('assets_unavailable');
    try {
      return await env.TERMINUS_WEB.fetch(new Request(request, { signal: upstreamSignal(env, request.signal) }));
    } catch (error) {
      logDependency('assets_fetch', error);
      return dependencyProblem('assets_unavailable');
    }
  },
};
