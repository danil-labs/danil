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
      const response = await env.TERMINUS_WEB.fetch(new Request(request, { signal: upstreamSignal(env, request.signal) }));
      const headers = new Headers(response.headers);
      const policy = (headers.get('Content-Security-Policy') || '').split(';').filter(part => !/^\s*frame-ancestors\b/.test(part)).filter(part => part.trim()).join(';');
      headers.set('Content-Security-Policy', `${policy}${policy ? '; ' : ''}frame-ancestors 'none'`);
      headers.set('X-Frame-Options', 'DENY');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
      logDependency('assets_fetch', error);
      return dependencyProblem('assets_unavailable');
    }
  },
};
