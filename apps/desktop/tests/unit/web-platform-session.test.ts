import assert from "node:assert/strict";
import test from "node:test";
import { platformSession, PlatformSessionError, preparePlatformSession } from "../../src/web/platform-session.ts";
import { webSessionDeployment } from "../../src/web/session-config.ts";

test("platform requires an explicit HTTPS edge origin and preserves its request budget", () => {
  for (const origin of ["https://edge.danil.ai", "https://edge.test:8443/"]) {
    assert.deepEqual(webSessionDeployment({ DANIL_WEB_API_ORIGIN: origin }), {
      origin: new URL(origin).origin, timeoutMs: 15000,
    });
  }
  assert.deepEqual(webSessionDeployment({ DANIL_WEB_API_ORIGIN: "https://api.danil.ai", DANIL_WEB_API_TIMEOUT_MS: "2500" }), {
    origin: "https://api.danil.ai", timeoutMs: 2500,
  });
});

for (const origin of [undefined, "", "   ", "not-a-url", "//edge.test", "http://api.danil.ai",
  "http://localhost:8787", "http://127.0.0.1:8787", "http://[::1]:8787", "ftp://edge.test",
  "https://edge.test/path", "https://edge.test/?query=1", "https://edge.test/#fragment",
  "https://edge.test:invalid", "https://[invalid]",
  "https://user:password@edge.test", "https:edge.test", "https:/edge.test",
  "https://edge.test/path/..", "https://edge.test\\", "https://edge.test\n"]) {
  test(`deployment rejects missing or invalid HTTPS origin: ${JSON.stringify(origin)}`, () => {
    assert.throws(() => webSessionDeployment({ DANIL_WEB_API_ORIGIN: origin }),
      /DANIL_WEB_API_ORIGIN.*required.*HTTPS origin/);
  });
}

for (const timeout of ["0", "60001", "1.5", "NaN"]) {
  test(`deployment rejects invalid timeout: ${timeout}`, () => {
    assert.throws(() => webSessionDeployment({ DANIL_WEB_API_ORIGIN: "https://edge.test", DANIL_WEB_API_TIMEOUT_MS: timeout }),
      /Invalid DANIL_WEB_API_TIMEOUT_MS/);
  });
}

test("cookie session reads profile and all workspace pages, selects with CSRF and logs out", async () => {
  const calls: Request[] = [];
  const request: typeof fetch = async (input, init) => {
    const r = new Request(input, init);
    calls.push(r);
    assert.equal(r.credentials, "include");
    assert.equal(r.cache, "no-store");
    assert.equal(r.redirect, "error");
    assert.equal(r.headers.has("authorization"), false);
    assert.equal(r.headers.has("x-danil-workspace"), false);
    const url = new URL(r.url);
    assert.equal(url.origin, "https://api.danil.ai");
    if (url.pathname.endsWith("/me")) return Response.json({ id: "user_A", name: "A", workspace: "11", organizations: [] });
    if (url.pathname.endsWith("/csrf")) return Response.json({ csrf_token: "bound-to-session" });
    if (url.pathname.endsWith("/select")) {
      assert.equal(r.headers.get("x-csrf-token"), "bound-to-session");
      assert.equal(r.headers.get("idempotency-key"), "selection-1");
      assert.deepEqual(await r.json(), { workspace: "9007199254740993" });
      return Response.json({ workspace: { id: "9007199254740993", org: "org_A", name: "Workspace", role: "owner" } });
    }
    if (url.pathname.endsWith("/logout")) {
      assert.equal(r.headers.get("x-csrf-token"), "bound-to-session");
      return new Response(null, { status: 204 });
    }
    assert.equal(url.pathname, "/v1/workspaces");
    return Response.json({ items: [{ id: url.search ? "9007199254740993" : "11", org: "org_A", name: "Workspace", role: "owner" }], next_cursor: url.search ? null : "opaque+/=" });
  };
  const api = platformSession({ origin: "https://api.danil.ai", timeoutMs: 1000 }, request);
  assert.equal(new URL(api.loginUrl("https://app.danil.ai/")).searchParams.get("return_to"), "https://app.danil.ai/");
  assert.equal((await api.me()).id, "user_A");
  assert.deepEqual((await api.workspaces()).map(w => w.id), ["11", "9007199254740993"]);
  assert.equal((await api.select("9007199254740993", "selection-1")).workspace.id, "9007199254740993");
  await api.logout();
  assert.equal(calls.filter(r => r.method === "POST").length, 2);
});

for (const status of [401, 403, 429, 503]) test(`HTTP ${status} stays distinct, without login or legacy fallback`, async () => {
  let calls = 0;
  const api = platformSession({ origin: "https://api.danil.ai", timeoutMs: 1000 }, async () => {
    calls++;
    return Response.json({ code: "dependency_failure" }, { status, headers: { "retry-after": "10", "content-type": "application/problem+json" } });
  });
  await assert.rejects(api.me(), (e: unknown) => e instanceof PlatformSessionError && e.status === status && e.retryAfter === "10");
  assert.equal(calls, 1);
});

test("invalid bodies, repeated cursors and expired requests fail without partial success", async () => {
  const options = { origin: "https://api.danil.ai", timeoutMs: 10 };
  await assert.rejects(platformSession(options, async () => Response.json({ access_token: "must-not-be-a-profile" })).me());
  await assert.rejects(platformSession(options, async () => Response.json({ items: [], next_cursor: "loop" })).workspaces());
  const api = platformSession(options, async (_input, init) => new Promise((_resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error("request did not abort")), 1000);
    init?.signal?.addEventListener("abort", () => { clearTimeout(deadline); reject(init.signal?.reason); }, { once: true });
  }));
  await assert.rejects(api.me(), { name: "TimeoutError" });
});

for (const status of [200, 201]) test(`promo redemption HTTP ${status} uses the cookie organization and CSRF`, async () => {
  const api = platformSession({ origin: 'https://edge.danil.ai', timeoutMs: 1000 }, async (input, init) => {
    const req = new Request(input, init);
    assert.equal(req.credentials, 'include');
    assert.equal(req.headers.has('authorization'), false);
    if (req.url.endsWith('/identity/csrf')) return Response.json({ csrf_token: 'csrf' });
    assert.equal(req.url, 'https://edge.danil.ai/v1/workspaces/promo/redeem');
    assert.equal(req.method, 'POST');
    assert.equal(req.headers.get('x-csrf-token'), 'csrf');
    assert.equal(req.headers.get('idempotency-key'), 'promo-attempt');
    assert.deepEqual(await req.json(), { code: 'ABCDEFGHIJKLMNOP' });
    return Response.json({ entitlement: { kind: 'ram_bonus', amount: { ram_gb: 2 }, state: 'active' },
      ...(status === 200 ? { machine: { state: 'future-state', extra: true } } : {}), future: true }, { status });
  });
  assert.deepEqual(await api.redeemPromo('ABCDEFGHIJKLMNOP', 'promo-attempt'),
    status === 200 ? { machine: { state: 'future-state' } } : {});
});

for (const [status, code] of [[422, 'promo_code_invalid'], [409, 'promo_already_active'],
  [409, 'organization_has_machine'], [403, 'promo_admin_required'], [404, null], [501, null]] as const) {
  test(`promo preserves HTTP ${status} ${code} without retrying`, async () => {
    const api = platformSession({ origin: 'https://edge.danil.ai', timeoutMs: 1000 }, async (input) =>
      String(input).endsWith('/csrf') ? Response.json({ csrf_token: 'csrf' }) :
        Response.json({ code }, { status, headers: { 'content-type': 'application/problem+json' } }));
    await assert.rejects(api.redeemPromo('ABCDEFGHIJKLMNOP', 'attempt'),
      (e: unknown) => e instanceof PlatformSessionError && e.status === status && e.code === code);
  });
}

test('promo network failure is observable', async () => {
  const api = platformSession({ origin: 'https://edge.danil.ai', timeoutMs: 1000 }, async () => { throw new TypeError('offline'); });
  await assert.rejects(api.redeemPromo('ABCDEFGHIJKLMNOP', 'attempt'), /offline/);
});

for (const status of [403, 404]) test(`startup hides transient HTTP ${status} until identity is ready`, async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let calls = 0;
  const api = platformSession({ origin: 'https://edge.test', timeoutMs: 1000 }, async () => {
    if (++calls === 1) return Response.json({ code: 'authorization_forbidden' },
      { status, headers: { 'content-type': 'application/problem+json', 'retry-after': '2' } });
    return Response.json({ id: 'user_A', name: 'A', workspace: '11', organizations: [] });
  });
  let preparing = false;
  const result = preparePlatformSession(() => api.me(), new AbortController().signal, () => { preparing = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(preparing, true);
  t.mock.timers.tick(1999);
  assert.equal(calls, 1);
  t.mock.timers.tick(1);
  assert.equal((await result).id, 'user_A');
});

for (const retryAfter of ['30', new Date(30_000).toUTCString()]) test(`startup stops after 20s without violating Retry-After ${retryAfter}`, async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  let calls = 0;
  const api = platformSession({ origin: 'https://edge.test', timeoutMs: 1000 }, async () => {
    calls++;
    return Response.json({ code: 'authorization_forbidden' }, { status: 403,
      headers: { 'content-type': 'application/problem+json', 'retry-after': retryAfter } });
  });
  const result = assert.rejects(preparePlatformSession(() => api.me(), new AbortController().signal, () => {}),
    (e: unknown) => e instanceof PlatformSessionError && e.status === 403 && e.code === 'authorization_forbidden');
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(20_000);
  await result;
  assert.equal(calls, 1);
});

for (const [status, code] of [[401, 'invalid_session'], [403, 'workspace_selection_required'],
  [403, 'organization_selection_required'], [503, 'dependency_unavailable']] as const) {
  test(`startup preserves HTTP ${status} ${code} immediately`, async () => {
    let preparing = false;
    const refusal = new PlatformSessionError(status, null, code);
    await assert.rejects(preparePlatformSession(async () => { throw refusal; }, new AbortController().signal,
      () => { preparing = true; }), e => e === refusal);
    assert.equal(preparing, false);
  });
}

test('closing the page cancels startup backoff without another request', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const controller = new AbortController();
  let calls = 0;
  const result = assert.rejects(preparePlatformSession(async () => {
    calls++;
    throw new PlatformSessionError(403, '2', 'authorization_forbidden');
  }, controller.signal, () => {}), { name: 'AbortError' });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await result;
  t.mock.timers.tick(30_000);
  assert.equal(calls, 1);
});


test("promo attempt survives closing Plan after an uncertain response, only in session memory", async () => {
  const { sessionPromoRedemption } = await import("../../src/web/promo-redemption.ts");
  const keys: string[] = [];
  let calls = 0;
  const redeem = sessionPromoRedemption(async (_code: string, key: string) => {
    keys.push(key);
    if (calls++ === 0) throw new TypeError("offline after send");
    return {};
  });
  await assert.rejects(redeem("EXAMPLE", "first-component"), /offline/);
  assert.deepEqual(await redeem("EXAMPLE", "reopened-component"), {});
  assert.deepEqual(keys, ["first-component", "first-component"]);
  await redeem("EXAMPLE", "next-attempt");
  assert.equal(keys[2], "next-attempt");
});

test('a pending startup rereads until ready without manufacturing an HTTP refusal', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let calls = 0;
  let preparing = false;
  const result = preparePlatformSession(async () => ++calls > 1, new AbortController().signal,
    () => { preparing = true; }, value => value);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(preparing, true);
  t.mock.timers.tick(1000);
  assert.equal(await result, true);
  assert.equal(calls, 2);
});

test('a directory that stays empty exhausts startup after 20s and stops rereading', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  let calls = 0;
  const result = preparePlatformSession(async () => { calls++; return false; }, new AbortController().signal,
    () => {}, value => value);
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(20_000);
  assert.equal(await result, false);
  const stoppedAt = calls;
  t.mock.timers.tick(60_000);
  assert.equal(calls, stoppedAt);
});

test('pending startup preserves its result when an in-flight read crosses the deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const deadline = new AbortController();
  t.mock.method(AbortSignal, 'timeout', () => deadline.signal);
  let calls = 0;
  const result = preparePlatformSession(async signal => {
    if (++calls === 1) return false;
    return new Promise<boolean>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  }, new AbortController().signal, () => {}, value => value);
  const observed = result.then(value => ({ value }), error => ({ error }));
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(1000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  t.mock.timers.tick(19_000);
  deadline.abort(new DOMException('Startup deadline', 'TimeoutError'));
  assert.deepEqual(await observed, { value: false });
});
