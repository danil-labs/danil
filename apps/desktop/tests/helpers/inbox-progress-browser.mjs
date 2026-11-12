import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

/** Pause the receipt after the real enqueue, as if its first writer were still completing. */
export async function inboxProgressBrowser({ db, messaging, browserFetch }) {
  let key, attempts = 0, output = '';
  messaging.afterResponse = async (response, request) => {
    if (request.method !== 'POST' || !new URL(request.url).pathname.endsWith('/messages')) return response;
    if (!key) {
      key = request.headers.get('idempotency-key');
      assert.equal(response.status, 202);
      await db.admin.query("UPDATE public.v1_idempotency_keys SET state='in_progress' WHERE idem_key=$1", [key]);
      // A fresh edge JWT obtains the genuine in-progress response from workers.
      const csrf = await (await browserFetch('https://api.danil.ai/v1/identity/csrf', { credentials: 'include' })).json();
      return browserFetch(request.url, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'idempotency-key': key, 'x-csrf-token': csrf.csrf_token }, body: JSON.stringify({ text: 'browser in progress' }) });
    }
    if (response.status === 409) {
      assert.equal((await response.clone().json()).code, 'idempotency_in_progress');
      if (++attempts === 2) await db.admin.query("UPDATE public.v1_idempotency_keys SET state='done' WHERE idem_key=$1", [key]);
    }
    return response;
  };
  const server = createServer(async (req, res) => {
    try {
      let raw = ''; for await (const part of req) raw += part;
      const call = JSON.parse(raw);
      const response = await browserFetch(call.url, call.init);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() }));
    } catch (cause) { res.writeHead(500); res.end(String(cause)); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const child = spawn(process.env.DANIL_INBOX_BROWSER_PYTHON, ['apps/desktop/tests/integration/platform-inbox-real-progress.browser.py'], {
      cwd: new URL('../../../../', import.meta.url),
      env: { ...process.env, DANIL_INBOX_BRIDGE: `http://127.0.0.1:${server.address().port}` }, stdio: ['ignore','pipe','pipe'],
    });
    child.stdout.on('data', part => { output += part; }); child.stderr.on('data', part => { output += part; });
    const exit = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
    assert.equal(exit, 0, output);
    assert.equal(attempts, 2);
    const rows = (await db.admin.query('SELECT client_message_id FROM public.outgoing_messages WHERE client_message_id=$1', [key])).rows;
    assert.deepEqual(rows, [{ client_message_id: key }]);
    return `${output.trim()}; PostgreSQL: exactly one outgoing row`;
  } finally { messaging.afterResponse = undefined; await new Promise(resolve => server.close(resolve)); }
}
