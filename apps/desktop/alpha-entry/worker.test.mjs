import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.mjs";

const origin = "https://alfa-app.danil.ai";
const prefix = "/alpha-api";
const auth = { Authorization: "Bearer user.jwt" };
function harness() {
  const calls = [];
  const env = {
    APPV2_BFF: { fetch: async request => {
      calls.push(request);
      return Response.json({ ok: true }, { headers: { "Set-Cookie": "unsafe=1", "Cache-Control": "no-store" } });
    } },
    TERMINUS_WEB: { fetch: async request => {
      calls.push(request);
      return new Response("assets", { headers: { "Content-Security-Policy": "default-src 'self'" } });
    } },
  };
  return { calls, env, fetch: (path, options) => worker.fetch(new Request(origin + path, options), env) };
}

test("platform page is unconditional and migrated BFF routes are closed", async () => {
  const h = harness();
  assert.equal(await (await h.fetch("/auth")).text(), "assets");
  h.calls.length = 0;
  for (const path of ["/auth/profile", "/api/inbox/conversations?account_id=7", "/api/inbox/conversations/12/messages?account_id=7", "/api/agents", "/api/credits/balance", "/api/workspace/enter", "/api/messaging/reply"]) {
    assert.equal((await h.fetch(prefix + path, { method: path.endsWith("enter") || path.endsWith("reply") ? "POST" : "GET", headers: auth })).status, 404, path);
  }
  assert.equal((await h.fetch("/auth/session", { method: "POST", headers: { Origin: origin } })).status, 404);
  assert.equal(h.calls.length, 0);
});

test("exact reads preserve identity headers and query, never cookies", async () => {
  for (const path of ["/auth/emails"]) {
    const h = harness();
    const response = await h.fetch(prefix + path, { headers: { ...auth, Origin: origin, Referer: origin + "/inbox", Cookie: "legacy=1", "X-Account-Id": "99" } });
    assert.equal(response.status, 200);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].url, origin + path);
    assert.equal(h.calls[0].headers.get("Origin"), origin);
    assert.equal(h.calls[0].headers.get("Referer"), origin + "/inbox");
    assert.equal(h.calls[0].headers.get("Authorization"), auth.Authorization);
    assert.equal(h.calls[0].headers.get("Cookie"), null);
    assert.equal(h.calls[0].headers.get("X-Account-Id"), null);
    assert.equal(response.headers.get("Set-Cookie"), null);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});

test("writes and unknown BFF paths never reach either binding", async () => {
  const h = harness();
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]) {
    assert.equal((await h.fetch(prefix + "/unknown", { method })).status, 405);
  }
  for (const path of ["", "/", "/auth/account", "/auth/profile/", "/api/inbox/conversations/12/ai", "/api/inbox/conversations/0/messages", "/api/inbox/conversations/9007199254740992/messages", "/api/inbox/conversations/12/messages/", "/api/inbox/conversations/%31/messages"]) {
    assert.ok([400, 404].includes((await h.fetch(prefix + path, { headers: auth })).status));
  }
  assert.equal(h.calls.length, 0);
});

test("query requires bounded integers, rejects duplicate and undeclared fields", async () => {
  const h = harness();
  for (const query of ["", "account_id=-1", "account_id=1x", "account_id=1&account_id=2", "account_id=9007199254740992", "account_id=1&limit=101", "account_id=1&offset=100001", "account_id=1&target=https://evil.example", "account_id=1&channel_id=2"]) {
    assert.equal((await h.fetch(prefix + "/auth/account/support-access?" + query, { headers: auth })).status, 400);
  }
  assert.equal((await h.fetch(prefix + "/auth/emails?account_id=1", { headers: auth })).status, 400);
  assert.equal(h.calls.length, 0);
});

test("missing JWT is rejected and upstream authorization failures stay failures", async () => {
  const h = harness();
  assert.equal((await h.fetch(prefix + "/auth/emails")).status, 401);
  assert.equal(h.calls.length, 0);
  for (const status of [401, 403, 404, 503]) {
    h.env.APPV2_BFF.fetch = async () => Response.json({ error: "denied" }, { status });
    assert.equal((await h.fetch(prefix + "/auth/emails", { headers: auth })).status, status);
  }
});

test("upstream redirects, HTML and transport failures fail closed", async () => {
  const h = harness();
  for (const response of [Response.redirect("https://evil.example"), new Response("login", { headers: { "Content-Type": "text/html" } })]) {
    h.env.APPV2_BFF.fetch = async () => response;
    assert.equal((await h.fetch(prefix + "/auth/emails", { headers: auth })).status, 502);
  }
  h.env.APPV2_BFF.fetch = async () => { throw new Error("offline"); };
  assert.equal((await h.fetch(prefix + "/auth/emails", { headers: auth })).status, 502);
});

test("support access is one read with account_id only; revocation does not pass", async () => {
  const h = harness();
  const path = "/auth/account/support-access?account_id=7";
  const response = await h.fetch(prefix + path, { headers: auth });
  assert.equal(response.status, 200);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, origin + path);
  assert.equal(h.calls[0].headers.get("Authorization"), auth.Authorization);
  for (const query of ["", "account_id=0", "account_id=7&limit=10", "account_id=7&account_id=8", "status=active"]) {
    assert.equal((await h.fetch(prefix + "/auth/account/support-access?" + query, { headers: auth })).status, 400);
  }
  for (const target of ["/auth/account/support-access/9/revoke?account_id=7", "/auth/account/support-access/", "/internal/support-access"]) {
    assert.ok([400, 404].includes((await h.fetch(prefix + target, { headers: auth })).status));
  }
  for (const method of ["POST", "DELETE"]) {
    assert.equal((await h.fetch(prefix + "/auth/account/support-access/9/revoke?account_id=7", { method, headers: auth })).status, 405);
  }
  assert.equal((await h.fetch(prefix + path)).status, 401);
  assert.equal(h.calls.length, 1);
});

test("assets preserve CSP and serve every other path from the root", async () => {
  const h = harness();
  for (const path of ["/", "/inbox", "/m/inbox-x", "/sign-in", "/auth", "/m/sw.js", "/terminusx/"]) {
    const response = await h.fetch(path);
    assert.equal(await response.text(), "assets");
    assert.equal(response.headers.get("Content-Security-Policy"), "default-src 'self'");
    assert.equal(h.calls.at(-1).url, origin + path);
  }
  h.calls.length = 0;
  assert.equal((await h.fetch("/inbox", { method: "POST" })).status, 405);
  assert.equal((await worker.fetch(new Request("https://app.danil.ai/inbox"), h.env)).status, 404);
  assert.equal(h.calls.length, 0);
});

test("ENTRY_HOST moves the entry to another host; alfa then answers 404", async () => {
  const h = harness();
  const env = { ...h.env, ENTRY_HOST: "staging-app.danil.ai" };
  const staging = "https://staging-app.danil.ai";
  assert.equal(await (await worker.fetch(new Request(staging + "/inbox"), env)).text(), "assets");
  assert.equal((await worker.fetch(new Request(origin + "/inbox"), env)).status, 404);
  const email = { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ email: "a@b.co" }) };
  assert.equal((await worker.fetch(new Request(staging + prefix + "/auth/emails", { ...email, headers: { ...email.headers, Origin: origin } }), env)).status, 403);
  const accepted = await worker.fetch(new Request(staging + prefix + "/auth/emails", { ...email, headers: { ...email.headers, Origin: staging } }), env);
  assert.equal(accepted.status, 200);
  assert.equal(h.calls.at(-1).headers.get("Origin"), staging);
});


test("old /terminus paths redirect to the root without hitting bindings", async () => {
  const h = harness();
  const cases = {
    "/terminus": "/",
    "/terminus/": "/",
    "/terminus?next=https%3A%2F%2Fevil.example": "/?next=https%3A%2F%2Fevil.example",
    "/terminus/m/inbox?demo=1": "/m/inbox?demo=1",
    "/terminus/alpha-api/auth/profile": "/alpha-api/auth/profile",
  };
  for (const [from, to] of Object.entries(cases)) for (const method of ["GET", "HEAD"]) {
    const response = await h.fetch(from, { method });
    assert.equal(response.status, 308, from);
    assert.equal(response.headers.get("Location"), origin + to);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
  assert.equal((await h.fetch("/terminus", { method: "POST" })).status, 405);
  assert.equal((await h.fetch("/terminus/inbox", { method: "POST" })).status, 405);
  assert.equal(h.calls.length, 0);
});


test("mobile deep links use the platform SPA", async () => {
  const h = harness();
  for (const path of ["inbox", "inbox-thread", "inbox-detail", "personalize", "broadcasts", "channels", "attention-agents"]) for (const method of ["GET", "HEAD"]) {
    await h.fetch(`/m/${path}?demo=1`, { method });
    const forwarded = h.calls.at(-1);
    assert.equal(forwarded.url, origin + `/m/${path}?demo=1`);
    assert.equal(forwarded.method, method);
  }
});


test("email writes: only the four exact routes, from this page, with the exact JSON body", async () => {
  const cases = [
    ["/auth/emails", { email: "b@x.mx" }],
    ["/auth/emails/verify", { email: "b@x.mx", code: "123456" }],
    ["/auth/emails/primary", { email: "b@x.mx" }],
    ["/auth/emails/remove", { email: "b@x.mx" }],
  ];
  for (const [path, body] of cases) {
    const h = harness();
    const response = await h.fetch(prefix + path, {
      method: "POST",
      headers: { ...auth, Origin: origin, Referer: origin + "/", "Content-Type": "application/json", Cookie: "legacy=1", "X-Danil-Actor": "member" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200, path);
    assert.equal(h.calls.length, 1);
    const sent = h.calls[0];
    assert.equal(sent.method, "POST");
    assert.equal(sent.url, origin + path);
    assert.equal(sent.headers.get("Authorization"), auth.Authorization);
    assert.equal(sent.headers.get("Origin"), origin);
    assert.equal(sent.headers.get("Cookie"), null);
    assert.equal(sent.headers.get("X-Danil-Actor"), null);
    assert.deepEqual(await sent.json(), body);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});

test("the email list is a plain read without query", async () => {
  const h = harness();
  assert.equal((await h.fetch(prefix + "/auth/emails", { headers: auth })).status, 200);
  assert.equal(h.calls[0].method, "GET");
  assert.equal((await h.fetch(prefix + "/auth/emails?account_id=1", { headers: auth })).status, 400);
  assert.equal(h.calls.length, 1);
});

test("email writes fail closed on origin, session, content type, size and fields", async () => {
  const h = harness();
  const post = (path, { headers = {}, body = JSON.stringify({ email: "b@x.mx" }) } = {}) =>
    h.fetch(prefix + path, { method: "POST", headers: { ...auth, Origin: origin, "Content-Type": "application/json", ...headers }, body });
  assert.equal((await post("/auth/emails", { headers: { Origin: "https://evil.example" } })).status, 403);
  assert.equal((await h.fetch(prefix + "/auth/emails", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: "{}" })).status, 403);
  assert.equal((await post("/auth/emails", { headers: { Authorization: "" } })).status, 401);
  assert.equal((await post("/auth/emails", { headers: { "Content-Type": "text/plain" } })).status, 400);
  assert.equal((await post("/auth/emails?x=1")).status, 400);
  for (const body of [
    "",
    "not json",
    "[]",
    JSON.stringify({}),
    JSON.stringify({ email: "b@x.mx", extra: 1 }),
    JSON.stringify({ email: 7 }),
    JSON.stringify({ email: "b@x.mx\r\nBcc: evil@x.mx" }),
    JSON.stringify({ email: "a".repeat(255) }),
    JSON.stringify({ email: "b@x.mx", pad: "x".repeat(2000) }),
  ]) {
    assert.equal((await post("/auth/emails", { body })).status, 400, body.slice(0, 40));
  }
  for (const code of ["12345", "1234567", "12a456", 123456]) {
    assert.equal((await post("/auth/emails/verify", { body: JSON.stringify({ email: "b@x.mx", code }) })).status, 400);
  }
  assert.equal((await post("/auth/emails/verify")).status, 400);
  for (const path of ["/auth/emails/", "/auth/emails/other", "/auth/account"]) {
    assert.equal((await post(path)).status, 405, path);
  }
  for (const method of ["PUT", "PATCH", "DELETE"]) {
    assert.equal((await h.fetch(prefix + "/auth/emails/remove", { method, headers: { ...auth, Origin: origin } })).status, 405);
  }
  assert.equal(h.calls.length, 0);
});

test("email writes: a chunked body over 1 KB is cut while reading, and an AI actor is refused here", async () => {
  const h = harness();
  let pulled = 0;
  const stream = new ReadableStream({
    pull(controller) {
      pulled++;
      if (pulled > 64) return controller.close();
      controller.enqueue(new TextEncoder().encode("x".repeat(512)));
    },
  });
  const chunked = await h.fetch(prefix + "/auth/emails", {
    method: "POST",
    headers: { ...auth, Origin: origin, "Content-Type": "application/json" },
    body: stream,
    duplex: "half",
  });
  assert.equal(chunked.status, 400);
  assert.ok(pulled < 64, `leyó ${pulled} partes`);
  for (const actor of ["ai", " AI "]) {
    const response = await h.fetch(prefix + "/auth/emails", {
      method: "POST",
      headers: { ...auth, Origin: origin, "Content-Type": "application/json", "X-Danil-Actor": actor },
      body: JSON.stringify({ email: "b@x.mx" }),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "identity_requires_person" });
  }
  assert.equal(h.calls.length, 0);
});

test("Desk authentication delegates to its isolated Worker with a bounded deadline", async () => {
  const h = harness();
  const seen = [];
  h.env.DESKTOP_AUTH = { fetch: async request => { seen.push(request); return new Response(null, { status: 303, headers: { Location: "/auth/desktop" } }); } };
  for (const path of ["/auth/desktop?challenge=test", "/auth/workos/start", "/auth/workos/callback?code=test"]) {
    const response = await h.fetch(path);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("Location"), "/auth/desktop");
    assert.ok(seen.at(-1).signal instanceof AbortSignal);
  }
  assert.equal(h.calls.length, 0);
  delete h.env.DESKTOP_AUTH;
  assert.equal((await h.fetch("/auth/desktop")).status, 503);
});

test("retired calendar, funnel and metrics routes never reach the BFF", async () => {
  const h = harness();
  for (const path of ["/api/calendar/connections", "/api/calendar/events", "/api/funnels", "/api/funnels/3/board", "/api/metrics", "/api/metrics/summary"]) {
    assert.equal((await h.fetch(prefix + path, { headers: auth })).status, 404, path);
  }
  assert.equal(h.calls.length, 0);
});


test("forward preserves JSON problems, status and the closed response header list", async () => {
  for (const status of [400, 401, 403, 404, 409, 422, 429, 503]) {
    const h = harness();
    const problem = { type: "about:blank", title: "Upstream failure", status };
    const allowed = { "Content-Type": "application/problem+json; charset=utf-8", "Retry-After": "12", "X-Request-Id": "req-123", ETag: '\"v1\"', "Cache-Control": "private, max-age=0" };
    h.env.APPV2_BFF.fetch = async () => Response.json(problem, { status, headers: { ...allowed, "Set-Cookie": "secret=1", Location: "https://evil.example", "X-Secret": "hidden" } });
    const response = await h.fetch(prefix + "/auth/emails", { headers: auth });
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), problem);
    for (const [name, value] of Object.entries(allowed)) assert.equal(response.headers.get(name), value);
    for (const name of ["Set-Cookie", "Location", "X-Secret", "Pragma"]) assert.equal(response.headers.get(name), null);
  }
});

test("empty upstream responses retain validators and cache policy", async () => {
  const h = harness();
  h.env.APPV2_BFF.fetch = async () => new Response(null, { status: 204, headers: { ETag: '\"v2\"', "Cache-Control": "private", "X-Request-Id": "empty" } });
  const response = await h.fetch(prefix + "/auth/emails", { headers: auth });
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
  assert.equal(response.headers.get("ETag"), '\"v2\"');
  assert.equal(response.headers.get("Cache-Control"), "private");
});

test("BFF calls have a configured deadline and terminate when it expires", async t => {
  const h = harness();
  h.env.UPSTREAM_TIMEOUT_MS = "5";
  let expiry;
  t.after(() => clearTimeout(expiry));
  h.env.APPV2_BFF.fetch = async request => {
    await new Promise((resolve, reject) => request.signal.addEventListener("abort", () => reject(request.signal.reason), { once: true }));
    return Response.json({ late: true });
  };
  const response = await Promise.race([h.fetch(prefix + "/auth/emails", { headers: auth }), new Promise((_, reject) => { expiry = setTimeout(() => reject(new Error("deadline missing")), 100); })]);
  assert.equal(response.status, 502);
});

test("asset fetches also receive a deadline and preserve caller cancellation", async () => {
  const h = harness();
  h.env.UPSTREAM_TIMEOUT_MS = "5";
  for (const path of ["/", "/m/inbox"]) {
    const controller = new AbortController();
    let signal;
    h.env.TERMINUS_WEB.fetch = async request => { signal = request.signal; return new Response("assets"); };
    await worker.fetch(new Request(origin + path, { signal: controller.signal }), h.env);
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal(signal.aborted, true, path);
    const next = new AbortController();
    await worker.fetch(new Request(origin + path, { signal: next.signal }), h.env);
    next.abort();
    assert.equal(signal.aborted, true);
  }
});

test("pending asset fetches expire as controlled HTTP problems", async t => {
  t.mock.method(console, "error", () => {});
  for (const path of ["/", "/m/inbox"]) {
    const h = harness();
    h.env.UPSTREAM_TIMEOUT_MS = "5";
    let calls = 0;
    let aborted;
    let expiry;
    h.env.TERMINUS_WEB.fetch = request => {
      calls++;
      return new Promise((resolve, reject) => {
        const fail = () => { aborted = request.signal.reason; reject(aborted); };
        if (request.signal.aborted) fail();
        else request.signal.addEventListener("abort", fail, { once: true });
      });
    };
    let response;
    try {
      response = await Promise.race([
        h.fetch(path),
        new Promise((_, reject) => { expiry = setTimeout(() => reject(new Error("asset deadline missing")), 500); }),
      ]);
    } finally { clearTimeout(expiry); }
    assert.equal(aborted?.name, "TimeoutError", path);
    assert.equal(calls, 1, "no retry after the deadline");
    assert.equal(response.status, 503, path);
    assert.match(response.headers.get("Content-Type"), /^application\/problem\+json/);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { type: "about:blank", title: "assets_unavailable", status: 503, error: "assets_unavailable" });
  }
});

test("a missing BFF and a failed transport expose retryable problem responses", async t => {
  t.mock.method(console, "error", () => {});
  for (const env of [{}, { APPV2_BFF: { fetch: async () => { throw new Error("offline"); } } }]) {
    const response = await worker.fetch(new Request(origin + prefix + "/auth/emails", { headers: auth }), env);
    assert.ok([502, 503].includes(response.status));
    assert.match(response.headers.get("Content-Type"), /^application\/problem\+json/);
    assert.equal((await response.json()).error, "bff_unavailable");
  }
});

test("an asset dependency outage is a problem response instead of a rejected request", async t => {
  const logged = [];
  t.mock.method(console, "error", (...args) => logged.push(args));
  const env = { TERMINUS_WEB: { fetch: async () => { throw new TypeError("private-asset-message"); } } };
  for (const path of ["/", "/m/inbox"]) {
    const response = await worker.fetch(new Request(origin + path), env);
    assert.equal(response.status, 503);
    assert.match(response.headers.get("Content-Type"), /^application\/problem\+json/);
  }
  assert.ok(logged.length >= 2);
  assert.ok(!JSON.stringify(logged).includes("private-asset-message"));
});

test('W5 messaging domains are retired for every legacy method, even with all switches on', async () => {
  const h = harness();
  h.env.BROADCAST_WRITES = 'on'; h.env.BROADCAST_DELIVERY = 'on';
  for (const path of ['/api/channels', '/api/marketing/campaigns?account_id=7', '/api/marketing/templates', '/api/contacts', '/api/media/upload', '/auth/account/features?account_id=7', '/api/marketing/campaigns/4/start?account_id=7', '/api/marketing/request-access']) {
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
      assert.equal((await h.fetch(prefix + path, { method, headers: { ...auth, Origin: origin } })).status, 404, method + ' ' + path);
    }
  }
  assert.equal(h.calls.length, 0);
});
