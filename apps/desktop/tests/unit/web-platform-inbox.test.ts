import assert from 'node:assert/strict';
import test from 'node:test';
import { webDomainRoutes, webSessionDeployment } from '../../src/web/session-config.ts';
import { inboxReplies, inboxReplyStore } from '../../src/web/inbox-replies.ts';
import { platformInbox } from '../../src/web/platform-inbox.ts';
import { createMessaging } from '../../../../packages/attention/src/messaging.ts';
import { PlatformSessionError } from '../../src/web/platform-session.ts';

const conversation = { id: 'cnv_opaque', object: 'conversation', contact: { id: 'ct_A', name: 'Ana', phone: '+521555123456' }, channel_id: 'ch_A', status: 'open', ai_enabled: false, unread_count: 1, created_at: '2026-11-12T00:00:00Z', last_message: null };
const message = { id: 'msg_opaque', object: 'message', conversation_id: conversation.id, direction: 'outbound', author: { type: 'person', person_id: 'user_A', name: 'Ana' }, kind: 'text', text: 'hola', created_at: conversation.created_at };
const receipt = { id: 'ms_A', object: 'message_send', status: 'queued', conversation_id: conversation.id, contact_id: 'ct_A', channel_id: 'ch_A', created_at: conversation.created_at };
const options = { origin: 'https://api.danil.ai', timeoutMs: 1000 };

test('inbox reads opaque IDs/cursors and writes one queued operation using cookie and CSRF', async () => {
  const calls: Request[] = [];
  const api = platformInbox(options, async (input, init) => {
    const r = new Request(input, init); calls.push(r);
    assert.equal(r.credentials, 'include');
    assert.equal(r.headers.has('authorization'), false);
    assert.equal(r.headers.has('x-danil-workspace'), false);
    const url = new URL(r.url);
    assert.equal(url.searchParams.has('offset'), false);
    assert.equal(url.searchParams.has('account_id'), false);
    if (url.pathname.endsWith('/csrf')) return Response.json({ csrf_token: 'bound' });
    if (r.method === 'POST') {
      assert.equal(r.headers.get('idempotency-key'), 'client-message-id');
      assert.equal(r.headers.get('x-csrf-token'), 'bound');
      assert.deepEqual(await r.json(), { text: 'hola' });
      return Response.json(receipt, { status: 202 });
    }
    return Response.json({ data: url.pathname.endsWith('/messages') ? [message] : [conversation], page: { has_more: true, next_cursor: 'cursor+/=' } });
  });
  assert.equal((await api.conversations()).data[0].id, 'cnv_opaque');
  assert.equal((await api.conversations('cursor+/=')).page.next_cursor, 'cursor+/=');
  assert.equal(new URL(calls[1].url).searchParams.get('cursor'), 'cursor+/=');
  const author = (await api.messages('cnv_opaque')).data[0].author;
  assert.deepEqual(author, { type: 'person', person_id: 'user_A', name: 'Ana' });
  assert.deepEqual(await api.reply('cnv_opaque', 'hola', 'client-message-id'), receipt);
  assert.equal(calls.filter(r => r.method === 'POST').length, 1);
});

for (const status of [401, 403, 402, 409, 422, 429, 503]) test(`problem ${status} preserves code, request ID and retry delay without fallback`, async () => {
  const api = platformInbox(options, async input => String(input).endsWith('/csrf') ? Response.json({ csrf_token: 'bound' }) : Response.json({ type: 'https://docs.danil.ai/errors/rejected', title: 'Rejected', status, code: 'insufficient_scope', request_id: 'req_A' }, { status, headers: { 'content-type': 'application/problem+json', 'retry-after': '7', 'x-request-id': 'req_A' } }));
  await assert.rejects(api.reply('cnv_A', 'hola', 'client-message-id'), (e: unknown) => e instanceof PlatformSessionError && e.status === status && e.code === 'insufficient_scope' && e.requestId === 'req_A' && e.retryAfter === '7');
});

test('invalid bodies, foreign conversation messages and cancellation fail closed', async () => {
  for (const body of [{}, { data: [conversation], page: { has_more: true, next_cursor: null } }, { data: [{ ...conversation, id: 9007199254740993 }], page: { has_more: false, next_cursor: null } }]) {
    await assert.rejects(platformInbox(options, async () => Response.json(body)).conversations());
  }
  await assert.rejects(platformInbox(options, async () => Response.json({ data: [{ ...message, conversation_id: 'cnv_other' }], page: { has_more: false, next_cursor: null } })).messages('cnv_A'));
  let calls = 0;
  const controller = new AbortController(); controller.abort();
  await assert.rejects(platformInbox(options, async () => { calls++; return Response.json({}); }).reply('cnv_A', 'hola', 'key', controller.signal));
  assert.equal(calls, 0);
});

test('deployment switches the entire inbox and leaves other messaging domains in legacy', () => {
  assert.equal(webDomainRoutes(webSessionDeployment({})).inbox, 'legacy');
  const routes = webDomainRoutes(webSessionDeployment({ DANIL_WEB_SESSION: 'platform', DANIL_WEB_INBOX: 'platform' }));
  assert.equal(routes.inbox, 'v1');
  for (const domain of ['channels', 'agents', 'templates', 'campaigns', 'contacts', 'media', 'billing', 'audit'] as const) assert.equal(routes[domain], 'legacy');
});

test('both reply transports preserve the exact same hyphenated UUID text', async () => {
  for (const clientId of ['7c917305-5975-49d4-9859-46f719a94dd6', '4A5283B1-872E-4C36-91B3-1F4E1933A2D1']) {
    let platformKey: string | null = null, legacyKey: unknown;
    const platform = platformInbox(options, async (input, init) => {
      if (String(input).endsWith('/csrf')) return Response.json({ csrf_token: 'bound' });
      platformKey = new Headers(init?.headers).get('idempotency-key');
      return Response.json(receipt, { status: 202 });
    });
    const legacy = createMessaging({ getToken: async () => 'legacy', unauthorized: async () => false }, async (_input, init) => {
      legacyKey = JSON.parse(String(init?.body)).client_message_id;
      return Response.json({ status: 'pending' }, { status: 201 });
    });
    await platform.reply('cnv_opaque', 'hola', clientId);
    await legacy.reply(12, 'hola', clientId);
    assert.equal(platformKey, clientId); assert.equal(legacyKey, clientId);
    assert.match(String(platformKey), /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
  }
});

test('inbox rollout defaults to legacy and rolls back independently of the platform session', () => {
  const deployment = webSessionDeployment({ DANIL_WEB_SESSION: 'platform', DANIL_WEB_INBOX: 'legacy' });
  assert.equal(deployment.kind, 'platform');
  assert.equal(webDomainRoutes(deployment).inbox, 'legacy');
  assert.equal(webDomainRoutes(webSessionDeployment({ DANIL_WEB_SESSION: 'platform' })).inbox, 'legacy');
  assert.equal(webDomainRoutes(webSessionDeployment({ DANIL_WEB_SESSION: 'platform', DANIL_WEB_INBOX: 'platform' })).inbox, 'v1');
  assert.throws(() => webSessionDeployment({ DANIL_WEB_SESSION: 'platform', DANIL_WEB_INBOX: 'typo' }));
});

test('in-progress retries use one key with backoff and Retry-After, including HTTP dates', async () => {
  let now = 0;
  const waits: number[] = [], keys: string[] = [];
  const send = inboxReplies({ async reply(_id, _text, key) {
    keys.push(key);
    if (keys.length < 3) throw new PlatformSessionError(409, keys.length === 1 ? new Date(5000).toUTCString() : null, 'idempotency_in_progress');
    return {};
  } }, { now: () => now, random: () => 1, pause: async ms => { waits.push(ms); now += ms; } });
  await send('cnv_A', 'hola', 'original-uuid', new AbortController().signal);
  assert.deepEqual(keys, ['original-uuid', 'original-uuid', 'original-uuid']);
  assert.deepEqual(waits, [5000, 2000]);
});

test('exhausted polling and a reread never permit a different key or text until the operation finishes', async () => {
  let now = 0;
  const keys: string[] = [];
  const waits: number[] = [];
  const send = inboxReplies({ async reply(_id, _text, key) {
    keys.push(key);
    if (keys.length <= 3) throw new PlatformSessionError(409, '1', 'idempotency_in_progress');
    return {};
  } }, { now: () => now, random: () => 1, pause: async ms => { waits.push(ms); now += ms; } });
  const signal = new AbortController().signal;
  await assert.rejects(send('cnv_A', 'hola', 'original', signal), /uncertain/);
  await assert.rejects(send('cnv_A', 'edited', 'replacement', signal), /uncertain/);
  await send('cnv_A', 'hola', 'replacement', signal);
  assert.deepEqual(keys, ['original', 'original', 'original', 'original']);
  assert.deepEqual(waits, [1000, 2000, 4000]);
  await send('cnv_A', 'new message', 'new-operation', signal);
  assert.equal(keys.at(-1), 'new-operation');
});

test('aborting an in-progress retry stops the request while retaining its operation key', async () => {
  const controller = new AbortController();
  const keys: string[] = [];
  const send = inboxReplies({ async reply(_id, _text, key) {
    keys.push(key);
    throw new PlatformSessionError(409, '1', 'idempotency_in_progress');
  } }, { now: () => 0, random: () => 1, pause: async (_ms, signal) => { controller.abort(); signal.throwIfAborted(); } });
  await assert.rejects(send('cnv_A', 'hola', 'original', controller.signal), { name: 'AbortError' });
  assert.deepEqual(keys, ['original']);
});


test('session reply store resumes an operation cancelled by its previous mount', async () => {
  let now = 0;
  const controller = new AbortController();
  const keys: string[] = [], waits: number[] = [];
  const store = inboxReplyStore({ async reply(_id, _text, key) {
    keys.push(key);
    if (keys.length === 1) { controller.abort(); throw new PlatformSessionError(409, '1', 'idempotency_in_progress'); }
  } }, { now: () => now, random: () => 1, pause: async (ms, signal) => { signal.throwIfAborted(); waits.push(ms); now += ms; } });
  await assert.rejects(store('11')('cnv_A', 'hola', 'original', controller.signal), { name: 'AbortError' });
  await store('11')('cnv_A', 'hola', 'new-mount-uuid', new AbortController().signal);
  assert.deepEqual(keys, ['original', 'original']);
  assert.deepEqual(waits, [1000]);
});

test('workspace return retains identity and backoff; other workspaces and sessions stay independent', async () => {
  let now = 0, ongoing = true;
  const keys: string[] = [], waits: number[] = [];
  const api = { async reply(_id: string, _text: string, key: string) {
    keys.push(key);
    if (ongoing) throw new PlatformSessionError(409, '1', 'idempotency_in_progress');
  } };
  const clock = { now: () => now, random: () => 1, pause: async (ms: number) => { waits.push(ms); now += ms; } };
  const store = inboxReplyStore(api, clock);
  const signal = new AbortController().signal;
  await assert.rejects(store('11')('cnv_A', 'hola', 'original-A', signal), /uncertain/);
  ongoing = false;
  await store('12')('cnv_A', 'hola', 'original-B', signal);
  await inboxReplyStore(api, clock)('11')('cnv_A', 'hola', 'other-session', signal);
  await store('11')('cnv_A', 'hola', 'replacement-A', signal);
  assert.deepEqual(keys, ['original-A', 'original-A', 'original-A', 'original-B', 'other-session', 'original-A']);
  assert.deepEqual(waits, [1000, 2000, 4000]);
  await store('11')('cnv_A', 'next', 'next-operation', signal);
  assert.equal(keys.at(-1), 'next-operation');
});
