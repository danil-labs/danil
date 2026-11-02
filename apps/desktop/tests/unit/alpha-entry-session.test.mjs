import test from "node:test";
import assert from "node:assert/strict";
import worker from "../../alpha-entry/worker.mjs";
import { safeNext } from "../../alpha-entry/session.mjs";
import { createHash } from "node:crypto";

const origin = "https://alfa-app.danil.ai";
const supabaseUrl = "https://project.supabase.co";
const uuid = "6f1c2b8e-3a4d-4e5f-8a9b-0c1d2e3f4a5b";
const b64url = bytes => Buffer.from(bytes).toString("base64url");

const workosAccess = `${b64url(Buffer.from("{}"))}.${b64url(Buffer.from(JSON.stringify({ sid: "session_01ABC", sub: "user_01ABC" })))}.sig`;

/** WorkOS and Supabase as the Worker sees them; `state` changes what each answers. */
function world(overrides = {}) {
  const state = {
    workosUser: { id: "user_01ABC", email: "Prueba@danil.ai", email_verified: true, first_name: "Prueba", last_name: "Danil" },
    sessions: [{ id: "session_01ABC", user_id: "user_01ABC", status: "active", ended_at: null, expires_at: new Date(Date.now() + 3_600_000).toISOString() }],
    person: 42,
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
    calls.push({ url: request.url, method: request.method, headers: request.headers, body: init.body ?? null });
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
      if (url.pathname === "/rest/v1/rpc/resolve_login") return Response.json(state.person);
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
const latest = (before, response) => cookieHeader(response) || before;

async function signedIn(w, next = "/inbox") {
  const started = await call(w, `/auth/workos/start?provider=GoogleOAuth&next=${encodeURIComponent(next)}`);
  const state = new URL(started.headers.get("Location")).searchParams.get("state");
  const back = await call(w, `/auth/workos/callback?code=code_ok&state=${state}`, { headers: { Cookie: cookieHeader(started) } });
  return { started, back, cookie: cookieHeader(back) };
}

const session = (w, cookie, headers = {}) => call(w, "/auth/session", { method: "POST", headers: { Origin: origin, Cookie: cookie, ...headers } });

test("start sends to WorkOS with PKCE and a sealed, host-only flow cookie", async () => {
  const w = world();
  const response = await call(w, "/auth/workos/start?provider=GoogleOAuth&next=/inbox");
  assert.equal(response.status, 303);
  const location = new URL(response.headers.get("Location"));
  assert.equal(location.origin + location.pathname, "https://api.workos.com/user_management/authorize");
  assert.equal(location.searchParams.get("client_id"), "client_01TEST");
  assert.equal(location.searchParams.get("redirect_uri"), `${origin}/auth/workos/callback`);
  assert.equal(location.searchParams.get("provider"), "GoogleOAuth");
  assert.equal(location.searchParams.get("code_challenge_method"), "S256");
  const cookie = response.headers.getSetCookie()[0];
  assert.match(cookie, /^__Host-danil_alfa_flow=v1\.[\w-]+\.[\w-]+; Path=\/; Max-Age=600; HttpOnly; Secure; SameSite=Lax$/);
  assert.ok(!cookie.includes(location.searchParams.get("state")));
  for (const provider of ["GitHubOAuth", "MicrosoftOAuth"]) assert.equal((await call(w, `/auth/workos/start?provider=${provider}`)).status, 400);
  assert.equal((await call(w, "/auth/workos/start", { method: "POST" })).status, 405);
});

test("callback opens a real Supabase session and the page only ever gets its access token", async () => {
  const w = world();
  const { back, cookie } = await signedIn(w);
  assert.equal(back.status, 303);
  assert.equal(back.headers.get("Location"), `${origin}/inbox`);
  assert.match(back.headers.getSetCookie().find(c => c.startsWith("__Host-danil_alfa=")), /^__Host-danil_alfa=v1\.[\w-]+\.[\w-]+; Path=\/; Max-Age=\d+; HttpOnly; Secure; SameSite=Strict$/);
  assert.ok(!cookie.includes("rt_0"));
  const sent = JSON.parse(w.calls.find(c => c.url.endsWith("/user_management/authenticate")).body);
  assert.equal(sent.grant_type, "authorization_code");
  assert.ok(sent.code_verifier.length >= 43);
  const resolve = JSON.parse(w.calls.find(x => x.url.endsWith("/rpc/resolve_login")).body);
  assert.deepEqual(resolve, { p_provider: "workos", p_subject: "user_01ABC", p_email: "prueba@danil.ai", p_email_verified: true, p_name: "Prueba Danil" });

  const first = await session(w, cookie);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("Cache-Control"), "no-store");
  const body = await first.json();
  assert.equal(body.access_token, "sb.rt_1");
  assert.deepEqual(body.user, { user_id: uuid, email: "prueba@danil.ai", name: "Prueba Danil" });
  assert.equal("refresh_token" in body, false);
  assert.ok(body.expires_at <= Math.floor(Date.now() / 1000) + 600, "the page asks again within ten minutes");
  const rotated = latest(cookie, first);
  assert.notEqual(rotated, cookie);
  assert.equal((await (await session(w, rotated)).json()).access_token, "sb.rt_2");
  assert.equal(w.calls.filter(x => x.url.endsWith("/rpc/resolve_login")).length, 1, "resolve_login writes: only at the callback");
});

test("callback refuses a forged state, a missing flow cookie and a refused code", async () => {
  const w = world();
  const started = await call(w, "/auth/workos/start");
  const state = new URL(started.headers.get("Location")).searchParams.get("state");
  const forged = `${state[0] === "x" ? "y" : "x"}${state.slice(1)}`;
  for (const [query, cookie] of [[`code=code_ok&state=${forged}`, cookieHeader(started)], [`code=code_ok&state=${state}`, ""], [`code=bad&state=${state}`, cookieHeader(started)], [`error=access_denied&state=${state}`, cookieHeader(started)]]) {
    const response = await call(w, `/auth/workos/callback?${query}`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("Location"), `${origin}/auth?error=callback_failed`);
    assert.ok(!cookiesOf(response).some(c => c.startsWith("__Host-danil_alfa=") && !c.endsWith("=")));
  }
});

test("the database decides who enters", async () => {
  for (const [overrides, error] of [
    [{ workosUser: { id: "user_01ABC", email: "prueba@danil.ai", email_verified: false } }, "email_not_verified"],
    [{ person: null }, "unknown_person"],
    [{ row: { id: 42, uuid, merged_into_user_id: 9 } }, "unknown_person"],
    [{ row: { id: 42, uuid: null, merged_into_user_id: null } }, "no_login_yet"],
    [{ login: null }, "no_login_yet"],
    [{ login: { id: uuid, email: "prueba@danil.ai", banned_until: "2126-01-01T00:00:00Z" } }, "login_banned"],
  ]) {
    const { back } = await signedIn(world(overrides));
    assert.equal(back.headers.get("Location"), `${origin}/auth?error=${error}`, error);
  }
  const w = world();
  const { cookie } = await signedIn(w);
  w.state.gotrueRefuses = true;
  const response = await session(w, cookie);
  assert.equal(response.status, 401, "GoTrue refuses a login banned after the callback");
  assert.deepEqual(cookiesOf(response), ["__Host-danil_alfa="]);
});

test("an ended WorkOS session or a tampered cookie gives no token and clears the cookie", async () => {
  const w = world();
  const { cookie } = await signedIn(w);
  w.state.sessions = [{ ...w.state.sessions[0], status: "revoked" }];
  const ended = await session(w, cookie);
  assert.equal(ended.status, 401);
  assert.deepEqual(await ended.json(), { error: "session_ended" });
  assert.deepEqual(cookiesOf(ended), ["__Host-danil_alfa="]);
  const tampered = cookie.slice(0, -2) + (cookie.endsWith("A") ? "BB" : "AA");
  assert.equal((await session(world(), tampered)).status, 401);
  assert.equal((await session(world(), cookie.replace("=v1.", "=v0."))).status, 401);
  assert.equal((await session(world(), "")).status, 401);
});

test("WorkOS down denies with 503 and never a token", async () => {
  const w = world();
  const { cookie } = await signedIn(w);
  w.state.workosDown = true;
  const response = await session(w, cookie);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "identity_unavailable" });
  assert.deepEqual(cookiesOf(response), []);
  const { back } = await signedIn(world({ workosDown: true }));
  assert.equal(back.status, 303);
  assert.notEqual(new URL(back.headers.get("Location")).hostname, "api.workos.com");
});

test("session and logout need the same Origin, no body and a person, not an AI", async () => {
  const w = world();
  const { cookie } = await signedIn(w);
  const before = w.calls.length;
  assert.equal((await session(w, cookie, { Origin: "https://evil.example" })).status, 403);
  assert.equal((await call(w, "/auth/session", { method: "POST", headers: { Cookie: cookie } })).status, 403);
  assert.equal((await call(w, "/auth/session", { method: "GET", headers: { Origin: origin, Cookie: cookie } })).status, 405);
  const ai = await session(w, cookie, { "x-danil-actor": "AI" });
  assert.equal(ai.status, 403);
  assert.deepEqual(await ai.json(), { error: "identity_requires_person" });
  assert.equal(w.calls.length, before);
  const withBody = await call(w, "/auth/session", { method: "POST", headers: { Origin: origin, Cookie: cookie }, body: "x".repeat(10_000_000) });
  assert.equal(withBody.status, 400);
});

test("logout clears the session, keeps the registered WorkOS return and marks the sign-in page", async () => {
  const w = world();
  const { cookie } = await signedIn(w);
  const response = await call(w, "/auth/logout", { method: "POST", headers: { Origin: origin, Cookie: cookie } });
  assert.equal(response.status, 200);
  assert.deepEqual(cookiesOf(response), ["__Host-danil_alfa=", "__Host-danil_alfa_signed_out=1"]);
  assert.match(response.headers.getSetCookie()[1], /^__Host-danil_alfa_signed_out=1; Path=\/; Max-Age=600; HttpOnly; Secure; SameSite=Lax$/);
  const location = new URL((await response.json()).location);
  assert.equal(location.origin + location.pathname, "https://api.workos.com/user_management/sessions/logout");
  assert.equal(location.searchParams.get("session_id"), "session_01ABC");
  assert.equal(location.searchParams.get("return_to"), `${origin}/auth`);
  const marker = cookieHeader(response);
  for (const path of ["/auth", "/auth?next=/inbox", "/sign-in"]) {
    const landing = await call(w, path, { headers: { Cookie: marker } });
    assert.equal(landing.status, 200, "logging out must stop on the signed-out page without starting authentication");
    assert.equal(await landing.text(), "assets");
  }
  for (const cookie of ["", "__Host-danil_alfa=invalid"]) {
    const anonymous = await call(w, "/auth/logout", { method: "POST", headers: { Origin: origin, Cookie: cookie } });
    assert.equal((await anonymous.json()).location, `${origin}/auth`);
    assert.deepEqual(cookiesOf(anonymous), ["__Host-danil_alfa=", "__Host-danil_alfa_signed_out=1"]);
  }
});

test("the signed-out marker grants no authority and explicit sign-in clears it separately from the flow cookie", async () => {
  const w = world();
  const marker = "__Host-danil_alfa_signed_out=1";
  assert.equal((await session(w, marker)).status, 401);
  const proxy = await call(w, "/alpha-api/auth/profile", { headers: { Cookie: marker } });
  assert.equal(proxy.status, 401);
  assert.equal(w.calls.length, 0, "a marker must never resolve a person or refresh a session");
  for (const headers of [{ Origin: "https://evil.example" }, { Origin: origin, "x-danil-actor": "ai" }]) {
    const refused = await call(w, "/auth/logout", { method: "POST", headers });
    assert.equal(refused.status, 403);
    assert.deepEqual(refused.headers.getSetCookie(), [], "a refused logout must not plant a marker");
  }
  const start = await call(w, "/auth/workos/start?next=/inbox", { headers: { Cookie: marker } });
  assert.equal(start.status, 303);
  const cookies = start.headers.getSetCookie();
  assert.equal(cookies.length, 2, "Set-Cookie fields must not be comma-folded");
  assert.match(cookies[0], /^__Host-danil_alfa_flow=v1\./);
  assert.equal(cookies[1], "__Host-danil_alfa_signed_out=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
  assert.equal(new URL(start.headers.get("Location")).origin, "https://api.workos.com");
  assert.equal((await call(w, "/auth")).status, 302, "after deleting the marker automatic entry is available again");
  assert.equal((await call(w, "/auth", { headers: { Cookie: "__Host-danil_alfa_signed_out=other" } })).status, 302);
});

test("without its configuration sign-in is unavailable, never open", async () => {
  const w = world();
  delete w.env.SESSION_COOKIE_KEY;
  assert.equal((await call(w, "/auth/workos/start")).status, 503);
  assert.equal((await session(w, "")).status, 503);
  assert.equal((await call(w, "/auth")).status, 200);
});

test("return paths stay inside Terminus", () => {
  assert.equal(safeNext("/inbox?x=1#y"), "/inbox?x=1#y");
  assert.equal(safeNext("/m/inbox"), "/m/inbox");
  for (const value of [null, "", "inbox", "https://evil.example/", "//evil.example/", "/auth", "/auth?next=x", "/auth/workos/start", "/sign-in", "/sign-in?next=/inbox", "/x/../auth", "/x/../sign-in", "/%61uth", "/%73ign-in", "/alpha-api/auth/profile", "/\\evil", "/inbox\n"]) {
    assert.equal(safeNext(value), "/", String(value));
  }
  assert.equal(safeNext("/inbox", "https://staging-app.danil.ai"), "/inbox");
  assert.equal(safeNext("https://alfa-app.danil.ai/inbox", "https://staging-app.danil.ai"), "/");
});

test("callback refuses authentication and foreign return destinations without re-entering auth", async () => {
  for (const next of ["/sign-in", "/sign-in?next=/inbox", "/x/../auth", "/%61uth", "//evil.example/", "https://evil.example/", "/\\evil.example/"]) {
    const { back } = await signedIn(world(), next);
    assert.equal(back.headers.get("Location"), `${origin}/`, next);
  }
});

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
  assert.equal(w.calls.filter(c => c.url.endsWith("/auth/v1/verify")).length, 1, "approving opens no session; only the browser's exists");

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
    if (url.pathname === "/auth/v1/logout") { loggedOut = new Headers(init.headers).get("Authorization"); return new Response(null, { status: 204 }); }
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
