import test from "node:test";
import assert from "node:assert/strict";
import worker from "../../legacy-desktop-auth/worker.mjs";
import { DesktopCodeStore } from "../../alpha-entry/desktop-code-store.mjs";
import { safeNext } from "../../legacy-desktop-auth/worker.mjs";
import { createHash } from "node:crypto";

const origin = "https://alfa-app.danil.ai";
const supabaseUrl = "https://project.supabase.co";
const uuid = "6f1c2b8e-3a4d-4e5f-8a9b-0c1d2e3f4a5b";
const b64url = bytes => Buffer.from(bytes).toString("base64url");

const workosAccess = `${b64url(Buffer.from("{}"))}.${b64url(Buffer.from(JSON.stringify({ sid: "session_01ABC", sub: "user_01ABC" })))}.sig`;

/** Storage persists across object instances; transactions serialize concurrent requests. */
function desktopCodes() {
  const objects = new Map();
  return {
    idFromName: name => name,
    get: id => ({ fetch: (input, init) => {
      if (!objects.has(id)) {
        let values = new Map();
        let pending = Promise.resolve();
        objects.set(id, {
          setAlarm: async () => {},
          deleteAll: async () => { values.clear(); },
          transaction: fn => {
            const run = pending.then(async () => {
              const next = new Map(values);
              const result = await fn({ get: async key => next.get(key), put: async (key, value) => { next.set(key, value); } });
              values = next;
              return result;
            });
            pending = run.catch(() => {});
            return run;
          },
        });
      }
      return new DesktopCodeStore({ storage: objects.get(id) }).fetch(new Request(input, init));
    } }),
  };
}

/** WorkOS and Supabase as the Worker sees them; `state` changes what each answers. */
function world(overrides = {}) {
  const state = {
    workosUser: { id: "user_01ABC", email: "Prueba@danil.ai", email_verified: true, first_name: "Prueba", last_name: "Danil" },
    sessions: [{ id: "session_01ABC", user_id: "user_01ABC", status: "active", ended_at: null, expires_at: new Date(Date.now() + 3_600_000).toISOString() }],
    person: 42,
    resolverMissing: false,
    access: true,
    accessRpcMissing: false,
    row: { id: 42, uuid, merged_into_user_id: null },
    login: { id: uuid, email: "prueba@danil.ai", banned_until: null },
    refreshes: 0,
    gotrueRefuses: false,
    workosDown: false,
    ...overrides,
  };
  const calls = [];
  const fetch = async (input, init = {}) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    calls.push({ url: request.url, method: request.method, headers: request.headers, body: init.body ?? null, signal: init.signal });
    if (url.origin === "https://api.workos.com") {
      if (state.workosDown) throw new TypeError("network");
      assert.equal(request.headers.get("Authorization"), "Bearer sk_test");
      if (url.pathname === "/user_management/authenticate") {
        const body = JSON.parse(init.body);
        if (body.code !== "code_ok") return Response.json({ error: "invalid_grant" }, { status: 400 });
        return Response.json({ user: { id: "user_01ABC" }, access_token: workosAccess, refresh_token: "rt", authentication_method: "GoogleOAuth" });
      }
      if (url.pathname === "/user_management/users/user_01ABC") return Response.json(state.workosUser);
      if (url.pathname === "/user_management/users/user_01ABC/sessions") return Response.json({ data: state.sessions, list_metadata: { after: null } });
      return Response.json({}, { status: 404 });
    }
    if (url.origin === supabaseUrl) {
      assert.equal(request.headers.get("apikey"), "service");
      if (url.pathname === "/rest/v1/rpc/resolve_existing_terminus_login") return state.resolverMissing
        ? Response.json({ code: "PGRST202" }, { status: 404 })
        : Response.json(state.person);
      if (url.pathname === "/rest/v1/rpc/user_can_access_terminus") return state.accessRpcMissing
        ? Response.json({ code: "PGRST202" }, { status: 404 })
        : Response.json(state.access);
      if (url.pathname === "/rest/v1/users") return Response.json(state.row ? [state.row] : []);
      if (url.pathname === `/auth/v1/admin/users/${uuid}`) return state.login ? Response.json(state.login) : Response.json({}, { status: 404 });
      const gotrue = (refresh) => Response.json({ access_token: `sb.${refresh}`, refresh_token: refresh, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: uuid, email: state.login.email, user_metadata: { full_name: "Prueba Danil" } } });
      if (url.pathname === "/auth/v1/admin/generate_link") {
        assert.deepEqual(JSON.parse(init.body), { type: "magiclink", email: state.login.email });
        return Response.json({ id: uuid, hashed_token: "hash_1", action_link: "https://never.example" });
      }
      if (url.pathname === "/auth/v1/verify") {
        assert.deepEqual(JSON.parse(init.body), { type: "magiclink", token_hash: "hash_1" });
        return gotrue("rt_0");
      }
      if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
        if (state.gotrueRefuses) return Response.json({ error_code: "user_banned" }, { status: 400 });
        assert.equal(JSON.parse(init.body).refresh_token, `rt_${state.refreshes}`);
        state.refreshes += 1;
        return gotrue(`rt_${state.refreshes}`);
      }
    }
    return Response.json({}, { status: 500 });
  };
  const env = {
    WORKOS_CLIENT_ID: "client_01TEST",
    WORKOS_API_KEY: "sk_test",
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: "service",
    SESSION_COOKIE_KEY: b64url(Buffer.alloc(32, 7)),
    TERMINUS_WEB: { fetch: async () => new Response("assets") },
    DESKTOP_CODES: desktopCodes(),
  };
  return { state, calls, env, fetch };
}

async function withFetch(w, run) {
  const original = globalThis.fetch;
  globalThis.fetch = w.fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

const call = (w, path, init = {}) => withFetch(w, () => worker.fetch(new Request(origin + path, { redirect: "manual", ...init }), w.env));
const cookiesOf = response => response.headers.getSetCookie().map(c => c.split(";")[0]);
const cookieHeader = response => cookiesOf(response).filter(c => !c.endsWith("=")).join("; ");

async function signedIn(w, next = `/auth/desktop?${desktopQuery()}`) {
  const started = await call(w, `/auth/workos/start?provider=GoogleOAuth&next=${encodeURIComponent(next)}`);
  const state = new URL(started.headers.get("Location")).searchParams.get("state");
  const back = await call(w, `/auth/workos/callback?code=code_ok&state=${state}`, { headers: { Cookie: cookieHeader(started) } });
  return { started, back, cookie: cookieHeader(back) };
}


const desktopVerifier = "v".repeat(43);
const desktopChallenge = () => createHash("sha256").update(desktopVerifier).digest("base64url");
const desktopQuery = (port = "49152") => `challenge=${desktopChallenge()}&state=${"s".repeat(16)}&port=${port}`;
const desktopJson = (w, path, body, headers = {}) => call(w, path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

test("desktop: without a browser session the page sends to WorkOS and comes back to itself", async () => {
  const w = world();
  const page = await call(w, `/auth/desktop?${desktopQuery()}`);
  assert.equal(page.status, 303);
  const start = new URL(page.headers.get("Location"));
  assert.equal(start.pathname, "/auth/workos/start");
  const next = start.searchParams.get("next");
  assert.equal(next, `/auth/desktop?${desktopQuery()}`);
  assert.equal(safeNext(next, origin), next);
  for (const bad of ["challenge=short&state=ssssssssssssssss&port=49152", desktopQuery("80"), `${desktopQuery()}&extra=1`]) {
    assert.equal((await call(w, `/auth/desktop?${bad}`)).status, 400);
  }
});

test("desktop: consent, one-time code to the loopback port, PKCE exchange, refresh and logout", async () => {
  const w = world();
  const { cookie } = await signedIn(w);
  const page = await call(w, `/auth/desktop?${desktopQuery()}`, { headers: { Cookie: cookie, "Accept-Language": "es-MX" } });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /Conectar Danil en esta computadora/);
  assert.match(html, /prueba@danil\.ai/);
  assert.match(page.headers.get("Content-Security-Policy"), /form-action 'self' http:\/\/127\.0\.0\.1:\*/);

  const form = new URLSearchParams(desktopQuery()).toString();
  const formInit = (headers = {}) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie, Origin: origin, ...headers }, body: form });
  assert.equal((await call(w, "/auth/desktop/approve", formInit({ Origin: "https://evil.example" }))).status, 403);
  assert.equal((await call(w, "/auth/desktop/approve", formInit({ "X-Danil-Actor": "ai" }))).status, 403);
  const approved = await call(w, "/auth/desktop/approve", formInit());
  assert.equal(approved.status, 303);
  const back = new URL(approved.headers.get("Location"));
  assert.equal(back.origin + back.pathname, "http://127.0.0.1:49152/callback");
  assert.equal(back.searchParams.get("state"), "s".repeat(16));
  const code = back.searchParams.get("code");
  assert.equal(w.calls.filter(c => c.url.endsWith("/auth/v1/verify")).length, 0, "approving opens no GoTrue session");

  assert.equal((await desktopJson(w, "/auth/desktop/exchange", { code, verifier: "w".repeat(43) })).status, 401, "a wrong verifier gets nothing");
  assert.equal((await desktopJson(w, "/auth/desktop/exchange", { code, verifier: desktopVerifier }, { Origin: origin })).status, 403, "no page may call it");
  const exchanged = await desktopJson(w, "/auth/desktop/exchange", { code, verifier: desktopVerifier });
  assert.equal(exchanged.status, 200);
  const first = await exchanged.json();
  assert.equal(first.access_token, "sb.rt_0");
  assert.deepEqual(first.user, { user_id: uuid, email: "prueba@danil.ai", name: "Prueba Danil" });
  assert.ok(!first.session.includes("rt_"));
  assert.equal("refresh_token" in first, false);
  assert.equal((await desktopJson(w, "/auth/desktop/session", { session: code })).status, 401, "a code never opens as a session");

  const renewed = await desktopJson(w, "/auth/desktop/session", { session: first.session });
  assert.equal(renewed.status, 200);
  const second = await renewed.json();
  assert.equal(second.access_token, "sb.rt_1");
  assert.notEqual(second.session, first.session);

  const original = w.fetch;
  let loggedOut = null;
  w.fetch = async (input, init = {}) => {
    const url = new URL(new Request(input, init).url);
    if (url.pathname === "/auth/v1/logout") { assert.ok(init.signal instanceof AbortSignal); loggedOut = new Headers(init.headers).get("Authorization"); return new Response(null, { status: 204 }); }
    return original(input, init);
  };
  const out = await desktopJson(w, "/auth/desktop/logout", { session: second.session });
  assert.equal(out.status, 204);
  assert.equal(loggedOut, "Bearer sb.rt_2");
});

test("desktop: an ended WorkOS session ends the window's session too", async () => {
  const w = world();
  const { cookie } = await signedIn(w);
  const approved = await call(w, "/auth/desktop/approve", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie, Origin: origin }, body: desktopQuery() });
  const code = new URL(approved.headers.get("Location")).searchParams.get("code");
  const first = await (await desktopJson(w, "/auth/desktop/exchange", { code, verifier: desktopVerifier })).json();
  w.state.sessions[0].status = "inactive";
  const refused = await desktopJson(w, "/auth/desktop/session", { session: first.session });
  assert.equal(refused.status, 401);
  assert.deepEqual(await refused.json(), { error: "session_ended" });
});

test("desktop: the device page approves with JSON and gets the loopback location to navigate to", async () => {
  const w = world();
  const { cookie } = await signedIn(w);
  const fields = Object.fromEntries(new URLSearchParams(desktopQuery()));
  const post = (body, headers = {}) => call(w, "/auth/desktop/approve", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin, ...headers }, body: JSON.stringify(body) });
  assert.equal((await post(fields, { Origin: "https://evil.example" })).status, 403);
  assert.equal((await post({ ...fields, port: "80" })).status, 400, "the port is checked again on the server");
  assert.equal((await post({ ...fields, extra: "1" })).status, 400);
  const answer = await post(fields);
  assert.equal(answer.status, 200);
  const location = new URL((await answer.json()).location);
  assert.equal(location.origin + location.pathname, "http://127.0.0.1:49152/callback");
  const code = location.searchParams.get("code");
  const exchanged = await desktopJson(w, "/auth/desktop/exchange", { code, verifier: desktopVerifier });
  assert.equal(exchanged.status, 200);
});

test("desktop: exchange and refresh read the grant again; a revoked person gets no token", async () => {
  const w = world();
  const { cookie } = await signedIn(w);
  const approve = () => call(w, "/auth/desktop/approve", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie, Origin: origin }, body: desktopQuery() });
  const codeOf = async () => new URL((await approve()).headers.get("Location")).searchParams.get("code");
  const first = await (await desktopJson(w, "/auth/desktop/exchange", { code: await codeOf(), verifier: desktopVerifier })).json();
  const pending = await codeOf();
  w.state.access = false;
  const refreshed = await desktopJson(w, "/auth/desktop/session", { session: first.session });
  assert.equal(refreshed.status, 403);
  assert.deepEqual(await refreshed.json(), { error: "access_required" });
  const exchanged = await desktopJson(w, "/auth/desktop/exchange", { code: pending, verifier: desktopVerifier });
  assert.equal(exchanged.status, 403);
  assert.equal("access_token" in await exchanged.json(), false);
});

async function approvedDesktopCode(w) {
  const { cookie } = await signedIn(w);
  const approved = await call(w, "/auth/desktop/approve", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie, Origin: origin }, body: desktopQuery(),
  });
  assert.equal(approved.status, 303);
  return new URL(approved.headers.get("Location")).searchParams.get("code");
}

const exchangeRequest = code => new Request(origin + "/auth/desktop/exchange", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, verifier: desktopVerifier }),
});
const sessionOpens = w => w.calls.filter(c => c.url.endsWith("/auth/v1/verify")).length;

test("desktop: a valid code opens exactly one new session", async () => {
  const w = world();
  const code = await approvedDesktopCode(w);
  const before = sessionOpens(w);
  const response = await withFetch(w, () => worker.fetch(exchangeRequest(code), w.env));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.user_id, uuid);
  assert.equal(sessionOpens(w), before + 1);
});

test("desktop: a second exchange rejects the consumed code without opening a session", async () => {
  const w = world();
  const code = await approvedDesktopCode(w);
  assert.equal((await withFetch(w, () => worker.fetch(exchangeRequest(code), w.env))).status, 200);
  const before = sessionOpens(w);
  const replay = await withFetch(w, () => worker.fetch(exchangeRequest(code), w.env));
  assert.equal(replay.status, 401);
  assert.deepEqual(await replay.json(), { error: "invalid_code" });
  assert.equal(sessionOpens(w), before);
});

test("desktop: concurrent exchanges accept exactly one and open only one session", async () => {
  const w = world();
  const code = await approvedDesktopCode(w);
  const before = sessionOpens(w);
  const replies = await withFetch(w, () => Promise.all([
    worker.fetch(exchangeRequest(code), w.env), worker.fetch(exchangeRequest(code), w.env),
  ]));
  assert.deepEqual(replies.map(r => r.status).sort(), [200, 401]);
  assert.deepEqual(await replies.find(r => r.status === 401).json(), { error: "invalid_code" });
  assert.equal(sessionOpens(w), before + 1);
});

test("desktop: a code expires at 120 seconds without opening a session", async t => {
  const issuedAt = Date.now();
  t.mock.method(Date, "now", () => issuedAt);
  const w = world();
  const code = await approvedDesktopCode(w);
  const before = sessionOpens(w);
  t.mock.method(Date, "now", () => issuedAt + 120_000);
  const response = await withFetch(w, () => worker.fetch(exchangeRequest(code), w.env));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "invalid_code" });
  assert.equal(sessionOpens(w), before);
});

test("desktop: storage unavailability fails closed without a new session", async () => {
  for (const unavailable of [undefined, { idFromName: name => name, get: () => ({ fetch: async () => { throw new Error("storage unavailable"); } }) },
    { idFromName: name => name, get: () => ({ fetch: async () => new Response(null, { status: 503 }) }) }]) {
    const w = world();
    const code = await approvedDesktopCode(w);
    const before = sessionOpens(w);
    w.env.DESKTOP_CODES = unavailable;
    const response = await withFetch(w, () => worker.fetch(exchangeRequest(code), w.env));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { type: "about:blank", title: "identity_unavailable", status: 503, error: "identity_unavailable" });
    assert.equal(sessionOpens(w), before);
  }
});

test("desktop: a lost storage acknowledgement never permits a replay", async () => {
  const w = world();
  const code = await approvedDesktopCode(w);
  const before = sessionOpens(w);
  const codes = w.env.DESKTOP_CODES;
  w.env.DESKTOP_CODES = { idFromName: codes.idFromName, get: id => ({ fetch: async (...args) => {
    await codes.get(id).fetch(...args);
    throw new Error("acknowledgement lost");
  } }) };
  assert.equal((await withFetch(w, () => worker.fetch(exchangeRequest(code), w.env))).status, 503);
  w.env.DESKTOP_CODES = codes;
  assert.equal((await withFetch(w, () => worker.fetch(exchangeRequest(code), w.env))).status, 401);
  assert.equal(sessionOpens(w), before);
});

test("desktop: a GoTrue failure leaves the code consumed", async () => {
  const w = world();
  const code = await approvedDesktopCode(w);
  const original = w.fetch;
  w.fetch = async (input, init) => new URL(input).pathname === "/auth/v1/verify"
    ? new Response(null, { status: 503 }) : original(input, init);
  assert.equal((await withFetch(w, () => worker.fetch(exchangeRequest(code), w.env))).status, 503);
  w.fetch = original;
  const before = sessionOpens(w);
  const replay = await withFetch(w, () => worker.fetch(exchangeRequest(code), w.env));
  assert.equal(replay.status, 401);
  assert.equal(sessionOpens(w), before);
});


test("desktop consent surfaces a failed login lookup instead of rendering anonymous consent", async t => {
  const logged = [];
  t.mock.method(console, "error", (...args) => logged.push(args));
  const w = world();
  const { cookie } = await signedIn(w);
  const original = w.fetch;
  for (const reply of [() => new Response(null, { status: 503 }), () => { throw new TypeError("private-session-must-not-leak"); }]) {
    w.fetch = async (input, init) => new URL(input).pathname === `/auth/v1/admin/users/${uuid}` ? reply() : original(input, init);
    const response = await call(w, `/auth/desktop?${desktopQuery()}`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 503);
    assert.match(response.headers.get("Content-Type"), /^application\/problem\+json/);
    assert.equal(response.headers.get("Retry-After"), "1");
    assert.equal((await response.json()).error, "identity_unavailable");
  }
  assert.ok(logged.length >= 2);
  assert.ok(!JSON.stringify(logged).includes("private-session-must-not-leak"));
});

test("Desk callback stores sealed identity without opening GoTrue or exposing a web token endpoint", async () => {
  const w = world();
  const { cookie, back } = await signedIn(w);
  assert.equal(back.status, 303);
  assert.equal(new URL(back.headers.get("Location")).pathname, "/auth/desktop");
  assert.ok(cookie.includes("__Host-danil_alfa="));
  assert.equal(sessionOpens(w), 0);
  for (const path of ["/auth/session", "/auth/logout"]) {
    assert.equal((await call(w, path, { method: "POST", headers: { Origin: origin, Cookie: cookie } })).status, 404);
  }
  assert.equal(sessionOpens(w), 0);
});

test("Desk sign-in rejects non-Desk return paths, forged state and absent flow cookies", async () => {
  for (const next of ["/inbox", "/", "//evil.test/", "/auth/desktop?challenge=bad"]) {
    assert.equal((await call(world(), `/auth/workos/start?next=${encodeURIComponent(next)}`)).status, 400);
  }
  const w = world();
  const started = await call(w, `/auth/workos/start?next=${encodeURIComponent(`/auth/desktop?${desktopQuery()}`)}`);
  const state = new URL(started.headers.get("Location")).searchParams.get("state");
  for (const [value, cookie] of [["forged", cookieHeader(started)], [state, ""]]) {
    const response = await call(w, `/auth/workos/callback?code=code_ok&state=${value}`, { headers: { Cookie: cookie } });
    assert.equal(new URL(response.headers.get("Location")).pathname, "/auth/desktop/error");
    assert.ok(!cookieHeader(response).includes("__Host-danil_alfa="));
  }
  assert.equal(w.calls.length, 0);
});

test("Desk identity resolution denies unverified, merged, missing and banned logins", async () => {
  for (const [overrides, error] of [
    [{ workosUser: { id: "user_01ABC", email: "prueba@danil.ai", email_verified: false } }, "email_not_verified"],
    [{ person: null }, "access_required"],
    [{ resolverMissing: true }, "identity_unavailable"],
    [{ row: { id: 42, uuid, merged_into_user_id: 9 } }, "unknown_person"],
    [{ login: null }, "no_login_yet"],
    [{ login: { id: uuid, email: "prueba@danil.ai", banned_until: "2126-01-01T00:00:00Z" } }, "login_banned"],
  ]) {
    const w = world(overrides);
    const { back, cookie } = await signedIn(w);
    assert.equal(new URL(back.headers.get("Location")).searchParams.get("error"), error);
    assert.ok(!cookie.includes("__Host-danil_alfa="));
    assert.equal(sessionOpens(w), 0);
  }
});

test("cancelling the Desk request aborts its WorkOS dependency before the upstream timeout", async () => {
  const w = world();
  const { cookie } = await signedIn(w);
  w.env.UPSTREAM_TIMEOUT_MS = "500";
  const controller = new AbortController();
  let signal;
  w.fetch = async (_input, init) => {
    signal = init.signal;
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      controller.abort();
    });
  };
  let timer;
  const deadline = new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error("Desk cancellation did not finish")), 1000); });
  try {
    const response = await Promise.race([deadline, withFetch(w, () => worker.fetch(new Request(`${origin}/auth/desktop?${desktopQuery()}`, { headers: { Cookie: cookie }, signal: controller.signal }), w.env))]);
    assert.equal(response.status, 503);
    assert.equal(signal.aborted, true);
    assert.equal(signal.reason.name, "AbortError", "the caller cancellation, not the 500ms upstream timeout, closes the request");
  } finally { clearTimeout(timer); }
});
