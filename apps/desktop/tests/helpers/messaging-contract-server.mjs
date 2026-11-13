import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

// Fallback only: validates the actual PR contract, not a substitute workers implementation.
export async function messagingContractServer({ publicKeys, jwtVerify }) {
  if (!process.env.DANIL_CONTRACT_TOOLS || !process.env.DANIL_CONTRACTS_REPO) throw new Error('DANIL_CONTRACT_TOOLS (ajv, ajv-formats, yaml) and DANIL_CONTRACTS_REPO are required');
  const require = createRequire(join(resolve(process.env.DANIL_CONTRACT_TOOLS), 'package.json'));
  const { parse } = require('yaml');
  const Ajv = require('ajv/dist/2020');
  const ajv = new Ajv({ strict: false });
  require('ajv-formats')(ajv);
  const load = path => parse(execFileSync('git', ['show', `${process.env.DANIL_CONTRACT_REF ?? 'origin/feat/messaging-v1'}:openapi/${path}`], { cwd: process.env.DANIL_CONTRACTS_REPO, encoding: 'utf8' }));
  const fragments = ['_shared.yaml', 'paths/messaging-conversations.yaml', 'paths/messaging-sends.yaml'].map(load);
  const schema = JSON.parse(JSON.stringify({ components: { schemas: Object.assign({}, ...fragments.map(f => f.components.schemas)) } }).replaceAll('_shared.yaml#', '#'));
  const validator = name => ajv.compile({ ...schema, $ref: `#/components/schemas/${name}` });
  const validateConversation = validator('Conversation'), validateMessage = validator('Message'), validateSend = validator('MessageSend'), validateError = validator('Error'), validatePage = validator('Page'), validateReply = validator('ReplyCreate');
  const checked = (validate, value) => { assert.ok(validate(value), JSON.stringify(validate.errors)); return value; };
  const created_at = '2026-11-12T00:00:00Z';
  const conversation = { id: 'cnv_opaque', object: 'conversation', contact: { id: 'ct_A', name: 'Ana', phone: '+521555123456' }, channel_id: 'ch_A', status: 'open', ai_enabled: false, unread_count: 1, created_at, last_message: null };
  const message = { id: 'msg_latest', object: 'message', conversation_id: conversation.id, direction: 'outbound', author: { type: 'person', name: 'Ana' }, kind: 'text', text: 'latest', created_at };
  const receipts = new Map(), calls = [], failures = [];
  let denied = false, limited = false, writes = 0;
  const server = createServer(async (req, res) => {
    const send = (status, value, headers = {}) => { res.writeHead(status, { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json', 'x-request-id': 'req_contract', ...headers }); res.end(JSON.stringify(value)); };
    const problem = (status, code, headers = {}) => send(status, checked(validateError, { type: `https://docs.danil.ai/errors/${code}`, title: code, status, code, request_id: 'req_contract' }), headers);
    try {
      const url = new URL(req.url, 'http://localhost');
      const legacy = url.pathname === '/legacy/api/messaging/reply';
      if (!legacy) {
        const { payload } = await jwtVerify(req.headers.authorization?.replace(/^Bearer /, '') ?? '', publicKeys, { issuer: 'edge-gateway', audience: 'workers' });
        assert.equal(payload.sub, 'user_A'); assert.equal(String(payload.workspace), '9007199254740993');
        assert.equal(req.headers.cookie, undefined);
        assert.equal(req.headers['x-danil-workspace'], undefined);
      } else assert.equal(req.headers.authorization, 'Bearer legacy-synthetic');
      calls.push({ method: req.method, path: url.pathname, cursor: url.searchParams.get('cursor'), key: req.headers['idempotency-key'] });
      assert.equal(url.searchParams.has('account_id'), false); assert.equal(url.searchParams.has('offset'), false);
      if (limited) return problem(429, 'rate_limited', { 'retry-after': '7' });
      if (req.method === 'GET') {
        const isMessages = url.pathname.endsWith('/messages');
        if (isMessages && !url.pathname.includes('/cnv_opaque/')) return problem(404, 'not_found');
        const cursor = url.searchParams.get('cursor');
        assert.ok(cursor === null || cursor === 'opaque+/=');
        const data = isMessages ? [{ ...message, id: cursor ? 'msg_older' : message.id, text: cursor ? 'older' : 'latest' }] : [conversation];
        data.forEach(value => checked(isMessages ? validateMessage : validateConversation, value));
        return send(200, { data, page: checked(validatePage, { has_more: !cursor, next_cursor: cursor ? null : 'opaque+/=' }) });
      }
      assert.equal(req.method, 'POST');
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      checked(validateReply, legacy ? { text: body.text } : body);
      const key = legacy ? body.client_message_id : req.headers['idempotency-key'];
      assert.ok(key); if (legacy) calls.at(-1).key = key;
      if (denied) return problem(403, 'insufficient_scope');
      const saved = receipts.get(key);
      if (saved && saved.text !== body.text) return problem(409, 'idempotency_conflict');
      if (!saved) {
        writes++;
        receipts.set(key, { text: body.text, receipt: checked(validateSend, { id: `ms_${writes}`, object: 'message_send', status: 'queued', conversation_id: conversation.id, contact_id: 'ct_A', channel_id: 'ch_A', created_at }) });
      }
      return legacy ? send(200, { status: saved ? 'duplicate' : 'pending', outgoing_id: writes }) : send(202, receipts.get(key).receipt);
    } catch (cause) { failures.push(cause); send(500, { error: String(cause) }); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { origin: `http://127.0.0.1:${server.address().port}`, calls, failures, writes: () => writes,
    deny: value => { denied = value; }, limit: value => { limited = value; },
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}
