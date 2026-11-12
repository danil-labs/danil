import assert from 'node:assert/strict';
import test from 'node:test';
import { boot } from '../helpers/jsdom-app.mjs';

async function until(read) {
  const end = Date.now() + 3000;
  while (!read()) { if (Date.now() > end) throw new Error('Page condition timed out'); await new Promise(resolve => setTimeout(resolve, 10)); }
}
const button = (w, label) => [...w.document.querySelectorAll('button')].find(b => b.textContent.trim() === label);

test('messaging navigation shows edge data, closes unavailable media, and clears workspace data', async () => {
  let workspace = '11';
  let down = false;
  const seen = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === 'http://localhost' && url.pathname.includes('/assets/')) return new Response('');
    assert.equal(url.origin, 'https://api.danil.ai');
    assert.equal(init.credentials, 'include');
    assert.equal(new Headers(init.headers).has('authorization'), false);
    seen.push(url.pathname);
    if (url.pathname.endsWith('/me')) return Response.json({ id: 'user_A', name: 'Operator', workspace, organizations: [] });
    if (url.pathname.endsWith('/workspaces')) return Response.json({ items: ['11','12'].map(id => ({ id, org: 'org_A', name: id === '11' ? 'Alpha' : 'Beta', role: 'owner' })), next_cursor: null });
    if (url.pathname.endsWith('/csrf')) return Response.json({ csrf_token: 'bound' });
    if (url.pathname.endsWith('/select')) { workspace = JSON.parse(init.body).workspace; return Response.json({ workspace, ctx: 'ctx', authz_ver: 1 }); }
    if (url.pathname.endsWith('/contacts') && down) return new Response(null, { status: 503 });
    return Response.json({ data: url.pathname.endsWith('/contacts') ? [{ id: 'ct_opaque', object: 'contact', name: workspace === '11' ? 'Ana' : 'Bea', phone: null, email: null, tags: [], blocked: false, ai_blocked: false }] : [], page: { has_more: false, next_cursor: null } });
  };
  globalThis.fetch.__jsdomApp = true;
  const app = await boot('listo', 'messaging-domains', {}, undefined, {}, { web: true });
  await until(() => button(app.w, 'Contactos'));
  button(app.w, 'Contactos').click();
  await until(() => app.w.document.body.textContent.includes('Ana'));
  button(app.w, 'Beta').click();
  await until(() => app.w.document.body.textContent.includes('Bea'));
  assert.equal(app.w.document.body.textContent.includes('Ana'), false);
  down = true;
  button(app.w, 'Actualizar').click();
  await until(() => app.w.document.querySelector('[data-platform-messaging] [role="alert"]'));
  assert.equal(app.w.document.body.textContent.includes('Bea'), false);
  button(app.w, 'Medios').click();
  await until(() => app.w.document.querySelector('[data-messaging-unavailable]'));
  assert.equal(seen.some(path => path.includes('/media')), false);
  assert.deepEqual(app.failures, []);
});
