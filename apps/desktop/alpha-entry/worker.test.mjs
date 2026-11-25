import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './worker.mjs';

const beta = { ENTRY_HOST: 'beta.danil.ai' };

test('serves assets and their CSP without copying account credentials to a service', async () => {
  const csp = "default-src 'self'; connect-src 'self' https://edge.danil.ai wss://connect.danil.ai";
  const reply = await worker.fetch(new Request('https://beta.danil.ai/'), {
    ...beta, TERMINUS_WEB: { fetch: async () => new Response('<html>Danil</html>', { headers: { 'Content-Security-Policy': csp } }) },
  });
  assert.equal(reply.headers.get('Content-Security-Policy'), csp);
  assert.equal(await reply.text(), '<html>Danil</html>');
});

test('installed paths redirect only on the configured host and preserve the query', async () => {
  const reply = await worker.fetch(new Request('https://beta.danil.ai/terminus/?w=engine'), beta);
  assert.equal(reply.status, 308);
  assert.equal(reply.headers.get('location'), 'https://beta.danil.ai/?w=engine');
  for (const url of ['https://evil.test/', 'http://beta.danil.ai/']) assert.equal((await worker.fetch(new Request(url), beta)).status, 404);
  assert.equal((await worker.fetch(new Request('https://beta.danil.ai/terminus', { method: 'POST' }), beta)).status, 405);
});

test('a deployment without its own host answers nothing, never another host', async () => {
  for (const env of [{}, { ENTRY_HOST: ' ' }]) {
    const reply = await worker.fetch(new Request('https://beta.danil.ai/'), env);
    assert.equal(reply.status, 404, JSON.stringify(env));
  }
});

test('an unavailable asset binding is visible and never falls back to an API', async () => {
  assert.equal((await worker.fetch(new Request('https://beta.danil.ai/'), beta)).status, 503);
  const response = await worker.fetch(new Request('https://beta.danil.ai/'), { ...beta, TERMINUS_WEB: { fetch: async () => { throw new Error('down'); } } });
  assert.equal(response.status, 503);
});
