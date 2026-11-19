import { scopedCreditsRead } from "../../src/web/scoped-credits.ts";
import { activeGroupCredits } from "../../src/web/active-group-credits.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { platformSession, PlatformSessionError } from "../../src/web/platform-session.ts";
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

test("credits use the authenticated organization even without a workspace", async () => {
  const paths: string[] = [];
  let balanceOrg = "org_A";
  const api = platformSession({ origin: "https://edge.test", timeoutMs: 1000 }, async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    paths.push(path);
    assert.equal(request.method, "GET");
    assert.equal(request.credentials, "include");
    assert.equal(request.headers.has("x-danil-workspace"), false);
    if (path === "/v1/identity/me") return Response.json({
      id: "user_A", name: "A", workspace: null, organizations: [], active_organization_id: "org_A",
    });
    assert.equal(path, "/v1/credits/balance");
    return Response.json({ organization_id: balanceOrg, available: { currency: "MXN", amount_micro: "1000000000" } });
  });
  const profile = await api.me();
  const signal = new AbortController().signal;
  assert.equal(await api.creditsBalance(profile.active_organization_id, signal), 1000);
  balanceOrg = "org_B";
  assert.equal(await api.creditsBalance(profile.active_organization_id, signal), null);
  assert.equal(await api.creditsBalance(null, signal), null);
  assert.deepEqual(paths, ["/v1/identity/me", "/v1/credits/balance", "/v1/credits/balance"]);
});

test("credits discard a response when its organization session closes", async () => {
  const controller = new AbortController();
  const api = platformSession({ origin: "https://edge.test", timeoutMs: 1000 }, async (_input, init) => {
    controller.abort();
    assert.equal(init?.signal?.aborted, true);
    return Response.json({ organization_id: "org_A", available: { currency: "MXN", amount_micro: "1000000000" } });
  });
  assert.equal(await api.creditsBalance("org_A", controller.signal), null);
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

test("composer and group share one scoped balance, validate organization and never reuse an unscoped response", async () => {
  const headers: (string | null)[] = [];
  const api = platformSession({ origin: "https://edge.test", timeoutMs: 1000 }, async (input, init) => {
    const request = new Request(input, init);
    if (request.url.endsWith("identity/sessions")) return Response.json({ default_context: "a", items: [{ contexts: [{ context_id: "a", org: "org_A", org_name: "A" }] }] });
    const context = request.headers.get("X-Danil-Session");
    headers.push(context);
    return Response.json({ organization_id: context === "b" ? "org_B" : "org_A", available: { currency: "MXN", amount_micro: "1000000" } }, { headers: context ? { "X-Danil-Session-Applied": context } : {} });
  });
  const signal = new AbortController().signal;
  assert.equal(await api.creditsBalance("org_A", signal), 1);
  const [balance, reply] = await Promise.all([activeGroupCredits(api, "org_A").readBalance(signal), api.groupAccount.send("a", "GET", "/v1/credits/balance")]);
  assert.equal(balance, 1); assert.equal(reply.status, 200);
  assert.deepEqual(headers, [null, "a"]);
  assert.equal(await api.creditsBalance("org_B", signal, "a"), null);
  assert.equal(await api.creditsBalance("org_B", signal, "b"), 1);
  assert.deepEqual(headers, [null, "a", "b"]);
});
test("both grouped consumers discard a response without the matching echo and can retry", async () => {
  let echo = false;
  const api = platformSession({ origin: "https://edge.test", timeoutMs: 1000 }, async () => Response.json({ organization_id: "org_A", available: { currency: "MXN", amount_micro: "1000000" } }, { headers: echo ? { "X-Danil-Session-Applied": "a" } : {} }));
  await assert.rejects(api.creditsBalance("org_A", new AbortController().signal, "a"), { detail: "session_echo_mismatch" });
  echo = true;
  assert.equal((await api.groupAccount.send("a", "GET", "/v1/credits/balance")).status, 200);
});

for (const status of [404, 501]) test(`legacy sessions HTTP ${status} preserves the active organization balance without a workspace`, async () => {
  let reads = 0;
  const api = platformSession({ origin: "https://edge.test", timeoutMs: 1000 }, async (input, init) => {
    const request = new Request(input, init);
    if (request.url.endsWith("identity/sessions")) return Response.json({}, { status });
    reads++; assert.equal(request.headers.has("X-Danil-Session"), false);
    return Response.json({ organization_id: "org_A", available: { currency: "MXN", amount_micro: "1000000" } });
  });
  assert.equal(await activeGroupCredits(api, "org_A").readBalance(new AbortController().signal), 1);
  assert.equal(reads, 1);
});

test("scoped reads expire without polling and explicit invalidation refreshes a balance", async () => {
  let now = 0; let calls = 0;
  const reader = scopedCreditsRead({ call: async () => { calls++; return Response.json({ organization_id: "org_A" }, { headers: { "X-Danil-Session-Applied": "a" } }); } } as never, () => now);
  await reader.read("a"); await reader.read("a"); assert.equal(calls, 1);
  now = 30_000; assert.equal(calls, 1);
  await reader.read("a"); assert.equal(calls, 2);
  reader.clear(); await reader.read("a"); assert.equal(calls, 3);
});

for (const role of ["owner", "admin", undefined, "future-role", "member", "guest", "x".repeat(129)]) test(`web context preserves a short role: ${role?.slice(0, 20)}`, async () => {
  const api = platformSession({ origin: "https://edge.test", timeoutMs: 1000 }, async () => Response.json({ default_context: "a", items: [{ contexts: [{ context_id: "a", org: "org_A", role }] }] }));
  assert.equal((await api.groupAccount.current())?.role, role && role.length > 128 ? undefined : role);
});
