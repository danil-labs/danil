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
      return Response.json({ ok: true }, { headers: { "Set-Cookie": "unsafe=1", "Cache-Control": "public" } });
    } },
    TERMINUS_WEB: { fetch: async request => {
      calls.push(request);
      return new Response("assets", { headers: { "Content-Security-Policy": "default-src 'self'" } });
    } },
  };
  return { calls, env, fetch: (path, options) => worker.fetch(new Request(origin + path, options), env) };
}

test("exact reads preserve identity headers and query, never cookies or cache headers", async () => {
  for (const path of ["/auth/profile", "/api/inbox/conversations?account_id=7&limit=30&offset=0", "/api/inbox/conversations/12/messages?account_id=7&limit=50&before_id=100", "/api/channels"]) {
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
    assert.equal((await h.fetch(prefix + "/auth/profile", { method })).status, 405);
  }
  for (const path of ["", "/", "/auth/account", "/auth/profile/", "/api/inbox/conversations/12/ai", "/api/inbox/conversations/0/messages", "/api/inbox/conversations/9007199254740992/messages", "/api/inbox/conversations/12/messages/", "/api/inbox/conversations/%31/messages"]) {
    assert.ok([400, 404].includes((await h.fetch(prefix + path, { headers: auth })).status));
  }
  assert.equal(h.calls.length, 0);
});

test("query requires bounded integers, rejects duplicate and undeclared fields", async () => {
  const h = harness();
  for (const query of ["", "account_id=-1", "account_id=1x", "account_id=1&account_id=2", "account_id=9007199254740992", "account_id=1&limit=101", "account_id=1&offset=100001", "account_id=1&target=https://evil.example", "account_id=1&channel_id=2"]) {
    assert.equal((await h.fetch(prefix + "/api/inbox/conversations?" + query, { headers: auth })).status, 400);
  }
  assert.equal((await h.fetch(prefix + "/auth/profile?account_id=1", { headers: auth })).status, 400);
  assert.equal(h.calls.length, 0);
});

test("missing JWT is rejected and upstream authorization failures stay failures", async () => {
  const h = harness();
  assert.equal((await h.fetch(prefix + "/auth/profile")).status, 401);
  assert.equal(h.calls.length, 0);
  for (const status of [401, 403, 404, 503]) {
    h.env.APPV2_BFF.fetch = async () => Response.json({ error: "denied" }, { status });
    assert.equal((await h.fetch(prefix + "/auth/profile", { headers: auth })).status, status);
  }
});

test("upstream redirects, HTML and transport failures fail closed", async () => {
  const h = harness();
  for (const response of [Response.redirect("https://evil.example"), new Response("login", { headers: { "Content-Type": "text/html" } })]) {
    h.env.APPV2_BFF.fetch = async () => response;
    assert.equal((await h.fetch(prefix + "/auth/profile", { headers: auth })).status, 502);
  }
  h.env.APPV2_BFF.fetch = async () => { throw new Error("offline"); };
  assert.equal((await h.fetch(prefix + "/auth/profile", { headers: auth })).status, 502);
});

test("organization workspaces is one GET with account_id only", async () => {
  const h = harness();
  const path = "/auth/organization/workspaces?account_id=476";
  const response = await h.fetch(prefix + path, { headers: auth });
  assert.equal(response.status, 200);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, origin + path);
  assert.equal(h.calls[0].headers.get("Authorization"), auth.Authorization);
  for (const query of ["", "account_id=0", "account_id=7&limit=10", "account_id=7&account_id=8", "organization_id=189"]) {
    assert.equal((await h.fetch(prefix + "/auth/organization/workspaces?" + query, { headers: auth })).status, 400);
  }
  for (const method of ["POST", "PATCH", "DELETE"]) {
    assert.equal((await h.fetch(prefix + path, { method, headers: auth })).status, 405);
  }
  assert.equal((await h.fetch(prefix + "/auth/organization/workspaces/476", { headers: auth })).status, 404);
  assert.equal((await h.fetch(prefix + path)).status, 401);
  assert.equal(h.calls.length, 1);
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


test("mobile inbox deep link serves the phone entry rather than global SPA fallback", async () => {
  const h = harness();
  for (const path of ["inbox", "inbox-thread", "inbox-detail", "personalize", "broadcasts", "channels", "attention-agents"]) for (const method of ["GET", "HEAD"]) {
    await h.fetch(`/m/${path}?demo=1`, { method });
    const forwarded = h.calls.at(-1);
    assert.equal(forwarded.url, origin + "/m/?demo=1");
    assert.equal(forwarded.method, method);
  }
});


test("channels list is read-only and takes no query", async () => {
  const h = harness();
  for (const path of ["/api/channels?include_archived=true", "/api/channels?account_id=7", "/api/channels/5", "/api/channels/whatsapp/connect", "/api/channels/identities"]) {
    assert.ok([400, 404].includes((await h.fetch(prefix + path, { headers: auth })).status), path);
  }
  for (const method of ["POST", "PATCH", "DELETE"]) assert.equal((await h.fetch(prefix + "/api/channels", { method, headers: auth })).status, 405);
  assert.equal((await h.fetch(prefix + "/api/channels")).status, 401);
  assert.equal(h.calls.length, 0);
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
  for (const path of ["/auth/emails/", "/auth/emails/other", "/auth/profile", "/auth/account"]) {
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

test("with WorkOS configured the entry goes straight to it, except to show a message", async () => {
  const h = harness();
  Object.assign(h.env, { WORKOS_CLIENT_ID: "client_01ABC", WORKOS_API_KEY: "sk_test", SUPABASE_URL: "https://db.example", SUPABASE_SERVICE_ROLE_KEY: "service", SESSION_COOKIE_KEY: "key" });
  for (const [path, to] of [["/auth", "/auth/workos/start"], ["/sign-in", "/auth/workos/start"], ["/auth?next=%2Finbox", "/auth/workos/start?next=%2Finbox"], ["/sign-in?next=%2Fm%2Finbox", "/auth/workos/start?next=%2Fm%2Finbox"]]) {
    const response = await h.fetch(path);
    assert.equal(response.status, 302, path);
    assert.equal(response.headers.get("Location"), to);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
  assert.equal(h.calls.length, 0);
  for (const path of ["/auth?error=session_failed", "/auth?signed_out=1", "/auth?error=x&next=%2Finbox", "/sign-in?code=abc"]) {
    assert.equal(await (await h.fetch(path)).text(), "assets", path);
  }
  assert.equal((await h.fetch("/auth", { method: "HEAD" })).status, 200);
  assert.equal((await h.fetch("/auth", { method: "POST" })).status, 405);
});

test("WorkOS sign-in routes stay in the Worker; the sign-in page is an asset", async () => {
  const h = harness();
  const session = await h.fetch("/auth/session", { method: "POST", headers: { Origin: origin } });
  assert.equal(session.status, 503, "without its secrets nobody gets a session");
  assert.equal((await session.json()).error, "sign_in_unavailable");
  assert.equal((await h.fetch("/auth/workos/start")).status, 503);
  assert.equal((await h.fetch("/auth/session", { method: "POST", headers: { Origin: "https://evil.example" } })).status, 403);
  assert.equal(h.calls.length, 0);
  assert.equal(await (await h.fetch("/auth?next=%2Finbox")).text(), "assets");
  assert.equal(h.calls.length, 1);
});

test("the panel adds exact reads over marketingProxy", async () => {
  const h = harness();
  for (const path of ["/auth/account/features?account_id=7", "/api/marketing/campaigns/4/messages?limit=200&offset=0", "/api/marketing/templates/9", "/api/contacts/metadata-keys", "/api/funnels", "/api/funnels/3/board"]) {
    const response = await h.fetch(prefix + path, { headers: auth });
    assert.equal(response.status, 200, path);
    assert.equal(new URL(h.calls.at(-1).url).pathname + new URL(h.calls.at(-1).url).search, path);
    assert.equal(h.calls.at(-1).headers.get("Cookie"), null);
  }
  const before = h.calls.length;
  for (const path of ["/api/marketing/campaigns/4/messages?limit=201&offset=0", "/api/marketing/campaigns/4/messages?limit=5", "/auth/account/features", "/auth/account/features?account_id=7&x=1", "/api/marketing/templates/9?x=1"]) {
    assert.equal((await h.fetch(prefix + path, { headers: auth })).status, 400, path);
  }
  for (const path of ["/api/marketing/campaigns/4", "/api/marketing/other", "/api/contacts/5", "/api/contacts/imports/1", "/api/funnels/3", "/api/media"]) {
    assert.equal((await h.fetch(prefix + path, { headers: auth })).status, 404, path);
  }
  assert.equal((await h.fetch(prefix + "/api/funnels")).status, 401);
  assert.equal(h.calls.length, before);
});

const accountToken = { Authorization: `Bearer a.${btoa(JSON.stringify({ active_account_id: 7 }))}.c` };
const MEDIA_BASE = "https://cdn.example/";
const metaWrites = [
  ["POST", "/api/marketing/templates", { channel_id: 2, name: "promo", category: "MARKETING", language: "es_MX", header: { format: "IMAGE", text: null, media_url: `${MEDIA_BASE}a.png` }, body: { text: "Hola" }, footer: null, submit: false }],
  ["POST", "/api/marketing/templates/sync", {}],
  ["PATCH", "/api/marketing/templates/9", { name: "promo_2", body: { text: "Hola" } }],
  ["POST", "/api/marketing/templates/9/submit"], ["DELETE", "/api/marketing/templates/9"],
];
const access = ["POST", "/auth/account/request-access", { account_id: 7, feature: "campaigns", phone: "+525512345678" }];
const deliveryWrites = [
  ["POST", "/api/marketing/campaigns/4/contacts?account_id=7", { contact_account_ids: [1, 2] }],
  ["POST", "/api/marketing/campaigns/4/start?account_id=7"], ["POST", "/api/marketing/campaigns/4/resume?account_id=7"],
  ["POST", "/api/marketing/campaigns/4/schedule?account_id=7", { scheduled_at: "2026-11-01T12:00:00.000Z" }],
];
const send = (h, method, path, body, extra = {}) => h.fetch(prefix + path, { method, headers: { ...accountToken, Origin: origin, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
const upload = (h, form) => h.fetch(prefix + "/api/media", { method: "POST", headers: { ...accountToken, Origin: origin }, body: form });
const mediaForm = (fields = {}) => {
  const form = new FormData();
  form.append("file", new File(["x"], "a.png", { type: "image/png" }));
  form.append("kind", "template");
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
};
function broadcastHarness(permissions = ["campaigns.manage"]) {
  const h = harness();
  h.env.BROADCAST_WRITES = "on";
  h.env.BROADCAST_DELIVERY = "on";
  h.env.MEDIA_PUBLIC_BASE = MEDIA_BASE;
  h.env.APPV2_BFF.fetch = async request => {
    const preflight = new URL(request.url).pathname === "/auth/account/my-permissions";
    if (!preflight) h.calls.push(request);
    return Response.json(preflight ? { role: "custom", permissions, scoped: [] } : { ok: true });
  };
  return h;
}

test("switches off: Meta writes answer 403, delivery keeps its 409, nothing reaches the BFF", async () => {
  const h = harness();
  for (const [method, path, body] of [...metaWrites, access]) {
    const response = await send(h, method, path, body);
    assert.equal(response.status, 403, path);
    assert.deepEqual(await response.json(), { error: "broadcast_writes_disabled" });
  }
  assert.equal((await upload(h, mediaForm())).status, 403);
  h.env.BROADCAST_WRITES = "on";
  for (const [method, path, body] of deliveryWrites) {
    const response = await send(h, method, path, body);
    assert.equal(response.status, 409, `${path}: opening Meta must not open delivery`);
    assert.deepEqual(await response.json(), { error: "campaign_delivery_unavailable" });
  }
  assert.equal(h.calls.length, 0);
});

test("switches on: each write keeps its barriers and sends a rebuilt body", async () => {
  const h = broadcastHarness();
  for (const [method, path, body] of [...metaWrites, ...deliveryWrites, access]) {
    assert.equal((await send(h, method, path, body)).status, 200, path);
    const call = h.calls.at(-1);
    assert.equal(call.method, method);
    assert.equal(new URL(call.url).pathname, path.split("?")[0]);
    assert.equal(new URL(call.url).search, "");
    assert.equal(call.headers.get("Cookie"), null);
    if (body) assert.deepEqual(await call.json(), body);
  }
  const before = h.calls.length;
  const [method, path, body] = metaWrites[0];
  assert.equal((await h.fetch(prefix + path, { method, headers: { ...accountToken, Origin: "https://evil.example", "Content-Type": "application/json" }, body: JSON.stringify(body) })).status, 403);
  assert.equal((await h.fetch(prefix + path, { method, headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) })).status, 401);
  assert.equal((await send(h, method, path, body, { "X-Danil-Actor": "ai" })).status, 403);
  assert.equal((await send(h, method, path + "?x=1", body)).status, 400);
  assert.equal((await send(h, "POST", "/api/marketing/campaigns/4/start?account_id=8")).status, 403, "another account");
  assert.equal((await send(h, "POST", "/api/marketing/campaigns/4/start")).status, 403, "no account");
  for (const [badPath, bad] of [
    ["/api/marketing/campaigns/4/contacts?account_id=7", { contact_account_ids: [] }], ["/api/marketing/campaigns/4/contacts?account_id=7", { contact_account_ids: [1.5] }],
    ["/api/marketing/campaigns/4/contacts?account_id=7", { contact_account_ids: Array.from({ length: 101 }, (_, index) => index + 1) }],
    ["/api/marketing/campaigns/4/schedule?account_id=7", { scheduled_at: "mañana" }],
    ["/api/marketing/templates", { ...body, name: "Con Espacios" }], ["/api/marketing/templates", { ...body, submit: "yes" }], ["/api/marketing/templates", { ...body, body: { text: "x".repeat(1025) } }],
    ["/api/marketing/templates", { ...body, header: { format: "IMAGE", text: null, media_url: "https://evil.example/a.png" } }],
    ["/auth/account/request-access", { ...access[2], feature: "funnels" }], ["/auth/account/request-access", { ...access[2], account_id: 8 }],
  ]) assert.equal((await send(h, "POST", badPath, bad)).status, 400, JSON.stringify(bad));
  assert.equal((await h.fetch(prefix + path, { method, headers: { ...accountToken, Origin: origin, "Content-Type": "text/plain" }, body: JSON.stringify(body) })).status, 400);
  for (const [m, p] of [["PUT", "/api/marketing/templates/9"], ["POST", "/api/contacts"], ["POST", "/api/contacts/import"]]) {
    assert.equal((await h.fetch(prefix + p, { method: m, headers: { ...accountToken, Origin: origin } })).status, 405, p);
  }
  assert.equal(h.calls.length, before);
});

test("the media envelope is rebuilt: only file and kind=template with an allowed type", async () => {
  const h = broadcastHarness();
  assert.equal((await upload(h, mediaForm())).status, 200);
  const form = await h.calls.at(-1).formData();
  assert.deepEqual([...form.keys()].sort(), ["file", "kind"]);
  assert.equal(form.get("kind"), "template");
  const before = h.calls.length;
  assert.equal((await upload(h, mediaForm({ kind: "inventory" }))).status, 400);
  assert.equal((await upload(h, mediaForm({ session_id: "5" }))).status, 400);
  const html = mediaForm();
  html.set("file", new File(["<script>"], "a.html", { type: "text/html" }));
  assert.equal((await upload(h, html)).status, 400);
  assert.equal(h.calls.length, before);
});

test("without campaigns.manage no write leaves the Worker; request-access needs only membership", async () => {
  const h = broadcastHarness([]);
  for (const [method, path, body] of [...metaWrites, ...deliveryWrites]) {
    const response = await send(h, method, path, body);
    assert.equal(response.status, 403, path);
    assert.deepEqual(await response.json(), { error: "forbidden_read_only" });
  }
  assert.equal((await upload(h, mediaForm())).status, 403);
  assert.equal(h.calls.length, 0);
  assert.equal((await send(h, ...access)).status, 200);
});

test("pause and cancel also stop at the preflight", async () => {
  const h = marketingHarness();
  h.env.APPV2_BFF.fetch = async request => { h.calls.push(request); return Response.json({ role: "custom", permissions: [], scoped: [] }); };
  for (const action of ["pause", "cancel"]) {
    const response = await h.fetch(`${prefix}/api/marketing/campaigns/4/${action}?account_id=7`, { method: "POST", headers: marketingHeaders });
    assert.equal(response.status, 403, action);
  }
  assert.ok(h.calls.every(call => new URL(call.url).pathname === "/auth/account/my-permissions"));
});

test("a 204 from the BFF passes without a body", async () => {
  const h = broadcastHarness();
  const fetchBff = h.env.APPV2_BFF.fetch;
  h.env.APPV2_BFF.fetch = async request => new URL(request.url).pathname === "/auth/account/my-permissions" ? fetchBff(request) : new Response(null, { status: 204 });
  assert.equal((await send(h, "DELETE", "/api/marketing/templates/9")).status, 204);
});

const replyBody = { conversation_id: 12, text: ' hola ', client_message_id: 'ea6db9df-1c8c-4b53-9b36-0d60575ef400' };
const replyHeaders = { ...auth, Origin: origin, 'Content-Type': 'application/json' };
test('reply is an exact JSON write preserving user identity and target, stripping ambient authority', async () => {
  const h = harness();
  const response = await h.fetch(prefix + '/api/messaging/reply', { method: 'POST', headers: { ...replyHeaders, Cookie: 'admin=true', 'X-Account-Id': '9' }, body: JSON.stringify(replyBody) });
  assert.equal(response.status, 200);
  assert.equal(h.calls.length, 1);
  const upstream = h.calls[0];
  assert.equal(upstream.url, origin + '/api/messaging/reply');
  assert.equal(upstream.headers.get('Authorization'), auth.Authorization);
  assert.equal(upstream.headers.get('Cookie'), null);
  assert.equal(upstream.headers.get('X-Account-Id'), null);
  assert.deepEqual(await upstream.json(), { ...replyBody, text: 'hola' });
});
test('reply rejects CSRF, AI identity, extra fields, malformed targets and non JSON before BFF', async () => {
  const h = harness();
  const options = { method: 'POST', headers: replyHeaders, body: JSON.stringify(replyBody) };
  for (const headers of [{ ...replyHeaders, Origin: 'https://evil.example' }, { ...replyHeaders, Origin: '' }, { ...replyHeaders, 'X-Danil-Actor': ' AI ' }]) {
    assert.equal((await h.fetch(prefix + '/api/messaging/reply', { ...options, headers })).status, 403);
  }
  for (const body of [{ ...replyBody, account_id: 9 }, { ...replyBody, conversation_id: 0 }, { ...replyBody, conversation_id: 9007199254740992 }, { ...replyBody, text: '  ' }, { ...replyBody, text: 'x'.repeat(4097) }, { ...replyBody, client_message_id: 'anything' }, []]) {
    assert.equal((await h.fetch(prefix + '/api/messaging/reply', { ...options, body: JSON.stringify(body) })).status, 400);
  }
  assert.equal((await h.fetch(prefix + '/api/messaging/reply?account_id=7', options)).status, 400);
  assert.equal((await h.fetch(prefix + '/api/messaging/reply', { ...options, headers: { ...replyHeaders, 'Content-Type': 'application/json-evil' } })).status, 400);
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(' '.repeat(20 * 1024 + 1))); controller.close(); } });
  assert.equal((await h.fetch(prefix + '/api/messaging/reply', { ...options, body: stream, duplex: 'half' })).status, 400);
  assert.equal(h.calls.length, 0);
});
test('effective permissions are account scoped and server write denials remain denials', async () => {
  const h = harness();
  assert.equal((await h.fetch(prefix + '/auth/account/my-permissions?account_id=7', { headers: auth })).status, 200);
  for (const query of ['', 'account_id=0', 'account_id=7&limit=30', 'account_id=7&account_id=8']) assert.equal((await h.fetch(prefix + '/auth/account/my-permissions?' + query, { headers: auth })).status, 400);
  for (const status of [401, 402, 403, 404, 503]) {
    h.env.APPV2_BFF.fetch = async () => Response.json({ error: 'forbidden_read_only' }, { status });
    assert.equal((await h.fetch(prefix + '/api/messaging/reply', { method: 'POST', headers: replyHeaders, body: JSON.stringify(replyBody) })).status, status);
  }
});

const marketingToken = account => `Bearer header.${Buffer.from(JSON.stringify({ active_account_id: account })).toString('base64url')}.signature`;
const marketingHeaders = { Authorization: marketingToken(7), Origin: origin, 'Content-Type': 'application/json' };
function marketingHarness() {
  const h = harness();
  h.env.APPV2_BFF.fetch = async request => {
    h.calls.push(request);
    return Response.json(new URL(request.url).pathname === '/auth/account/my-permissions' ? { role: 'custom', permissions: ['campaigns.manage'], scoped: [] } : { id: 4, status: 'draft' });
  };
  return h;
}
test('marketing reads are exact and account query must match the same Bearer claim', async () => {
  const h = marketingHarness();
  for (const path of ['/api/marketing/campaigns?account_id=7', '/api/marketing/templates?status=APPROVED&account_id=7', '/api/marketing/templates/2/channels?account_id=7', '/api/marketing/campaigns/4/stats?account_id=7', '/api/contacts?account_id=7']) {
    assert.equal((await h.fetch(prefix + path, { headers: marketingHeaders })).status, 200);
  }
  const before = h.calls.length;
  for (const path of ['/api/marketing/campaigns?account_id=8', '/api/contacts?account_id=8']) assert.equal((await h.fetch(prefix + path, { headers: marketingHeaders })).status, 403);
  for (const query of ['', 'account_id=7&limit=1000', 'account_id=7&account_id=7', 'account_id=9007199254740992']) assert.equal((await h.fetch(prefix + '/api/marketing/campaigns?' + query, { headers: marketingHeaders })).status, 400);
  assert.equal((await h.fetch(prefix + '/api/marketing/campaigns?account_id=7', { headers: auth })).status, 403);
  assert.equal(h.calls.length, before);
});
test('marketing create and safety stops check effective permission on every write before BFF authority', async () => {
  const h = marketingHarness();
  const create = { method: 'POST', headers: { ...marketingHeaders, Cookie: 'admin=true', 'X-Account-Id': '9' }, body: JSON.stringify({ name: ' Draft ', template_id: 2, channel_id: 3, variable_mapping: { first_name: 'Persona' } }) };
  assert.equal((await h.fetch(prefix + '/api/marketing/campaigns?account_id=7', create)).status, 200);
  assert.equal(h.calls.length, 2);
  assert.match(h.calls[0].url, /my-permissions\?account_id=7$/);
  const upstream = h.calls[1];
  assert.equal(upstream.headers.get('Authorization'), marketingHeaders.Authorization);
  assert.equal(upstream.headers.get('Cookie'), null);
  assert.equal(upstream.headers.get('X-Account-Id'), null);
  assert.equal((await upstream.json()).name, 'Draft');
  for (const action of ['pause', 'cancel']) assert.equal((await h.fetch(prefix + `/api/marketing/campaigns/4/${action}?account_id=7`, { method: 'POST', headers: marketingHeaders })).status, 200);
  assert.equal(h.calls.length, 6);
  for (const permissions of [[], ['channels.manage']]) {
    const denied = marketingHarness();
    denied.env.APPV2_BFF.fetch = async request => { denied.calls.push(request); return Response.json({ role: 'owner', permissions, scoped: [] }); };
    assert.equal((await denied.fetch(prefix + '/api/marketing/campaigns?account_id=7', create)).status, 403);
    assert.equal(denied.calls.length, 1);
  }
});
test('delivery, scheduling and audience additions remain closed without any upstream calls', async () => {
  const h = marketingHarness();
  for (const action of ['start', 'resume', 'schedule', 'contacts']) {
    const response = await h.fetch(prefix + `/api/marketing/campaigns/4/${action}?account_id=7`, { method: 'POST', headers: marketingHeaders, body: '{}' });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'campaign_delivery_unavailable' });
  }
  assert.equal(h.calls.length, 0);
});
test('marketing rejects unknown methods, routes and bodies before authorization preflight', async () => {
  const h = marketingHarness();
  const options = { method: 'POST', headers: marketingHeaders };
  const base = { name: 'Draft', template_id: 2, channel_id: 3 };
  for (const body of [{ ...base, budget: 999 }, { ...base, name: '' }, { ...base, channel_id: 0 }, { ...base, variable_mapping: { x: 'x'.repeat(1025) } }, { ...base, variable_mapping: { __header_media_url: 'https://evil.example' } }]) assert.equal((await h.fetch(prefix + '/api/marketing/campaigns?account_id=7', { ...options, body: JSON.stringify(body) })).status, 400);
  assert.equal((await h.fetch(prefix + '/api/marketing/campaigns?account_id=7', { ...options, headers: { ...marketingHeaders, Origin: 'https://evil.example' }, body: JSON.stringify(base) })).status, 403);
  assert.equal((await h.fetch(prefix + '/api/marketing/campaigns?account_id=7', { ...options, headers: { ...marketingHeaders, 'X-Danil-Actor': 'ai' }, body: JSON.stringify(base) })).status, 403);
  assert.equal((await h.fetch(prefix + '/api/marketing/campaigns/4/pause?account_id=7', { ...options, body: '{}' })).status, 400);
  assert.equal((await h.fetch(prefix + '/api/contacts?account_id=7', options)).status, 405);
  assert.equal((await h.fetch(prefix + '/api/marketing/campaigns/4/start?account_id=7', { headers: marketingHeaders })).status, 405);
  const submit = await h.fetch(prefix + '/api/marketing/templates/2/submit', options);
  assert.equal(submit.status, 403);
  assert.deepEqual(await submit.json(), { error: 'broadcast_writes_disabled' });
  for (const path of ['/api/marketing/campaigns/4/unknown', '/api/marketing/channels']) assert.ok([404, 405].includes((await h.fetch(prefix + path, options)).status));
  assert.equal(h.calls.length, 0);
});
