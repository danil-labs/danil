/**
 * Estas pruebas nacieron con la ventana de una sola organización: su borde simulado contesta
 * `identity/me` sin contexto. La ventana de varias sesiones lee primero el conjunto de la cookie
 * (`identity/sessions`) y manda `X-Danil-Session` con eco. Este envoltorio deriva el conjunto del
 * `me` de cada prueba (su status, si falla) y pone el eco a las respuestas con contexto.
 */
export function withSessions(inner) {
  const orgOf = new Map();
  const wrapped = async (input, init = {}) => {
    const url = new URL(String(input));
    const headers = new Headers(init.headers);
    const context = headers.get('X-Danil-Session');
    if (url.pathname === '/v1/identity/sessions' && !url.pathname.endsWith('catalog')) {
      headers.delete('X-Danil-Session');
      const me = await inner(new URL('/v1/identity/me', url).href, { ...init, headers });
      if (!me.ok) return me;
      const body = await me.clone().json();
      const orgs = Array.isArray(body.organizations) && body.organizations.length ? body.organizations.map(o => o.id) : [body.active_organization_id ?? 'org_A'];
      const contexts = orgs.map(org => { const id = `ctx_${org}`; orgOf.set(id, org); return { context_id: id, org, org_name: org, plan: 'pro', ...(org === orgs[0] ? { personal: true } : {}) }; });
      return Response.json({ version: 1, items: [{ session_id: 'ses_A', sub: body.id, email: typeof body.email === 'string' ? body.email : null, contexts }], primary: 'ses_A', default_context: contexts[0].context_id });
    }
    if (url.pathname === '/v1/identity/sessions/catalog' || (context && url.pathname === '/v1/workspaces/preferences')) {
      // Sin catálogo propio, el de la prueba vieja: sus `/v1/workspaces`, todos agregados.
      const own = await inner(input, init).catch(() => null);
      if (own?.ok) return own;
      const listed = await inner(new URL('/v1/workspaces', url).href, {}).then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] }));
      const items = Array.isArray(listed.items) ? listed.items : [];
      if (context) return Response.json({ version: 1, added: items.filter(w => w.org === orgOf.get(context)).map(w => String(w.engine_workspace_id ?? w.id)) }, { headers: { 'X-Danil-Session-Applied': context, 'X-Danil-Session-Applied-Org': orgOf.get(context) ?? '' } });
      const contexts = [...orgOf].map(([id, org]) => ({ context_id: id, org, org_name: org, catalog_state: 'listed', workspaces: items.filter(w => w.org === org).map(w => ({ account_id: String(w.id), engine_workspace_id: String(w.engine_workspace_id ?? w.id), name: w.name })) }));
      return Response.json({ version: 1, items: [{ session_id: 'ses_A', sub: 'user', email: null, contexts }] });
    }
    const reply = await inner(input, init);
    if (!context || !reply.ok) return reply;
    if (url.pathname === '/v1/machines') {
      const body = await reply.clone().json();
      if (Array.isArray(body.items)) body.items = body.items.map(m => ({ kind: 'organization', organization_id: orgOf.get(context), ...m }));
      return Response.json(body, { status: reply.status, headers: { 'X-Danil-Session-Applied': context, 'X-Danil-Session-Applied-Org': orgOf.get(context) ?? '' } });
    }
    const echoed = new Headers(reply.headers);
    echoed.set('X-Danil-Session-Applied', context);
    echoed.set('X-Danil-Session-Applied-Org', orgOf.get(context) ?? '');
    return new Response(reply.status === 204 ? null : await reply.arrayBuffer(), { status: reply.status, headers: echoed });
  };
  wrapped.__jsdomApp = true;
  return wrapped;
}
/** Cada `globalThis.fetch = fetcher` de una prueba queda envuelto. */
export function installSessionsEdge() {
  let installed = globalThis.fetch;
  Object.defineProperty(globalThis, 'fetch', { configurable: true, get: () => installed, set: value => { installed = value?.__jsdomApp && !value.__sessions ? Object.assign(withSessions(value), { __sessions: true }) : value; } });
}

