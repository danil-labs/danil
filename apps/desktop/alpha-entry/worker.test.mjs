import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './worker.mjs';

test('serves assets and their CSP without copying account credentials to a service', async () => {
  const csp = "default-src 'self'; connect-src 'self' https://edge.danil.ai";
  const reply = await worker.fetch(new Request('https://beta.danil.ai/'), {
    ENTRY_HOST: 'beta.danil.ai', TERMINUS_WEB: { fetch: async () => new Response('<html>Danil</html>', { headers: { 'Content-Security-Policy': csp } }) },
  });
  assert.equal(reply.headers.get('Content-Security-Policy'), csp + "; frame-ancestors 'none'");
  assert.equal(reply.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(await reply.text(), '<html>Danil</html>');
});

test('installed paths redirect only on the configured host and preserve the query', async () => {
  const reply = await worker.fetch(new Request('https://alfa-app.danil.ai/terminus/?w=engine'), {});
  assert.equal(reply.status, 308);
  assert.equal(reply.headers.get('location'), 'https://alfa-app.danil.ai/?w=engine');
  for (const url of ['https://evil.test/', 'http://alfa-app.danil.ai/']) assert.equal((await worker.fetch(new Request(url), {})).status, 404);
  assert.equal((await worker.fetch(new Request('https://alfa-app.danil.ai/terminus', { method: 'POST' }), {})).status, 405);
});

test('an unavailable asset binding is visible and never falls back to an API', async () => {
  assert.equal((await worker.fetch(new Request('https://alfa-app.danil.ai/'), {})).status, 503);
  const response = await worker.fetch(new Request('https://alfa-app.danil.ai/'), { TERMINUS_WEB: { fetch: async () => { throw new Error('down'); } } });
  assert.equal(response.status, 503);
});

test('beta enforces anti-framing when the assets binding supplies no CSP', async () => {
  const reply = await worker.fetch(new Request('https://beta.danil.ai/'), {
    ENTRY_HOST: 'beta.danil.ai', TERMINUS_WEB: { fetch: async () => new Response('<html>Danil</html>') },
  });
  assert.equal(reply.headers.get('Content-Security-Policy'), "frame-ancestors 'none'");
  assert.equal(reply.headers.get('X-Frame-Options'), 'DENY');
});
