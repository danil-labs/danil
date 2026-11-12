import { upstreamSignal } from "./transport.mjs";
import { dependencyProblem, logDependency } from "./dependency-error.mjs";

/**
 * WorkOS sign-in for alfa. The browser never holds a WorkOS or refresh token:
 * at the callback a service-role RPC resolves an approved existing person. A
 * real Supabase session opens for `users.uuid`; the cookie keeps the WorkOS session
 * id and that refresh token, sealed. Each POST to `/auth/session`
 * checks the WorkOS session and refreshes in GoTrue, so bans, the hook and RLS
 * stay those of app.danil.ai. Any failure denies; there is no fallback.
 */
const WORKOS_API = "https://api.workos.com";
const FLOW_COOKIE = "__Host-danil_alfa_flow";
const SESSION_COOKIE = "__Host-danil_alfa";
const SIGNED_OUT_COOKIE = "__Host-danil_alfa_signed_out";
const SIGNED_OUT_SECONDS = 600;
const FLOW_SECONDS = 600;
const SESSION_SECONDS = 30 * 86_400;
/** The page asks again within this time, so an ended WorkOS session stops it soon. */
export const RECHECK_SECONDS = 600;
const COOKIE_VERSION = "v1";
const SESSION_PAGES = 20;
// The desktop window (docs/desktop-bff-session.md): consent page, one-time code and its own sealed session.
const DESKTOP_PAGE = "/auth/desktop";
const DESKTOP_CODE = "desktop_code";
const DESKTOP_SESSION = "desktop_session";
const DESKTOP_CODE_SECONDS = 120;
const DESKTOP_MAX_BODY = 4096;
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;
const STATE_RE = /^[A-Za-z0-9_-]{16,128}$/;
// Microsoft waits for xms_edov: WorkOS does not expose it, and an unverified email never links a person.
const PROVIDERS = new Set(["authkit", "GoogleOAuth"]);
const ID_RE = /^[A-Za-z0-9_-]{1,200}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

class Denied extends Error {
  constructor(code, status = 401) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
const unavailable = () => new Denied("identity_unavailable", 503);

const encoder = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function fromB64url(value) {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Denied("invalid_cookie");
  const text = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4));
  return Uint8Array.from(text, c => c.charCodeAt(0));
}
const randomToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
const now = () => Math.floor(Date.now() / 1000);

export function sessionConfig(env) {
  const clientId = env.WORKOS_CLIENT_ID?.trim();
  const apiKey = env.WORKOS_API_KEY?.trim();
  const supabaseUrl = env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!clientId || !ID_RE.test(clientId) || !apiKey || !supabaseUrl?.startsWith("https://") || !serviceKey ||
      !env.SESSION_COOKIE_KEY) return null;
  return { clientId, apiKey, supabaseUrl, serviceKey, env };
}

async function cookieKey(env) {
  const raw = fromB64url(env.SESSION_COOKIE_KEY.trim());
  if (raw.length !== 32) throw unavailable();
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** AES-GCM with name and version as associated data, so one cookie never opens as the other or as an older format. */
async function seal(env, name, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(`${name}.${COOKIE_VERSION}`) }, await cookieKey(env), encoder.encode(JSON.stringify(value)));
  return `${COOKIE_VERSION}.${b64url(iv)}.${b64url(data)}`;
}

async function open(env, name, sealed) {
  const [version, iv, data, extra] = (sealed ?? "").split(".");
  if (version !== COOKIE_VERSION || !iv || !data || extra !== undefined) throw new Denied("no_session");
  let value;
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(iv), additionalData: encoder.encode(`${name}.${COOKIE_VERSION}`) }, await cookieKey(env), fromB64url(data));
    value = JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new Denied("no_session");
  }
  if (!value || typeof value !== "object" || !Number.isInteger(value.exp) || value.exp <= now()) throw new Denied("no_session");
  return value;
}

function readCookie(request, name) {
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}
// `__Host-` needs Path=/. Flow and signed-out cookies survive the WorkOS return (Lax); the session stays Strict.
const setCookie = (name, value, maxAge) => `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=${name === SESSION_COOKIE ? "Strict" : "Lax"}`;

// This marker only keeps the sign-in page visible; it never opens a session.
export const hasSignedOutMarker = request => readCookie(request, SIGNED_OUT_COOKIE) === "1";

/** A return path on this site, outside the sign-in itself and the data proxy; anything else goes to the root. */
export function safeNext(value, origin = "https://alfa-app.danil.ai") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x1f]/.test(value)) return "/";
  try {
    const url = new URL(value, origin);
    const path = decodeURIComponent(url.pathname);
    if (url.origin !== origin || (path !== DESKTOP_PAGE && /^\/(auth|sign-in|alpha-api)(\/|$)/.test(path)) || /[\\\x00-\x1f]/.test(path)) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

async function workos(config, path, init = {}) {
  let response;
  try {
    response = await fetch(WORKOS_API + path, {
      ...init,
      signal: upstreamSignal(config.env, init.signal),
      headers: { Authorization: `Bearer ${config.apiKey}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
      redirect: "manual",
    });
  } catch (error) {
    logDependency("identity_dependency", error);
    throw unavailable();
  }
  if (response.status === 429) {
    logDependency("workos_throttled", response);
    throw unavailable();
  }
  if (response.status >= 400 && response.status < 500) throw new Denied("invalid_workos_session");
  if (response.status !== 200) {
    logDependency("identity_response", response);
    throw unavailable();
  }
  try {
    const body = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("shape");
    return body;
  } catch (error) {
    logDependency("identity_dependency", error);
    throw unavailable();
  }
}

async function supabase(config, path, init = {}) {
  let response;
  try {
    response = await fetch(config.supabaseUrl + path, {
      ...init,
      signal: upstreamSignal(config.env, init.signal),
      headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
      redirect: "manual",
    });
  } catch (error) {
    logDependency("identity_dependency", error);
    throw unavailable();
  }
  if (response.status === 429) {
    logDependency("supabase_throttled", response);
    throw unavailable();
  }
  if (response.status === 404 && path.startsWith("/auth/v1/admin/users/")) throw new Denied("no_login_yet", 403);
  if (response.status >= 400 && response.status < 500 && init.refusal) throw new Denied(init.refusal.code, init.refusal.status);
  if (response.status !== 200) {
    logDependency("identity_response", response);
    throw unavailable();
  }
  try {
    return await response.json();
  } catch (error) {
    logDependency("identity_dependency", error);
    throw unavailable();
  }
}

const rpc = (config, name, args) => supabase(config, `/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(args) });

function sessionIdOf(accessToken) {
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(accessToken.split(".")[1])));
    return typeof claims.sid === "string" && ID_RE.test(claims.sid) ? claims.sid : null;
  } catch {
    return null;
  }
}

async function checkSession(config, userId, sessionId) {
  let after = null;
  for (let page = 0; page < SESSION_PAGES; page += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (after) query.set("after", after);
    const body = await workos(config, `/user_management/users/${encodeURIComponent(userId)}/sessions?${query}`);
    if (!Array.isArray(body.data)) throw unavailable();
    const row = body.data.find(r => r?.id === sessionId);
    if (row) {
      const expires = typeof row.expires_at === "string" ? Date.parse(row.expires_at) : NaN;
      if (row.user_id !== userId || row.status !== "active" || row.ended_at != null || !(expires > Date.now())) throw new Denied("session_ended");
      return;
    }
    const next = body.list_metadata?.after;
    if (next == null) throw new Denied("session_ended");
    if (typeof next !== "string" || !ID_RE.test(next) || next === after) throw unavailable();
    after = next;
  }
  throw unavailable();
}

/**
 * Only this service-role RPC may link a login: it resolves an approved existing
 * person atomically and never creates one. Missing RPC fails closed.
 */
async function resolvePerson(config, workosUserId) {
  const user = await workos(config, `/user_management/users/${encodeURIComponent(workosUserId)}`);
  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  if (user.id !== workosUserId || !email) throw unavailable();
  if (user.email_verified !== true) throw new Denied("email_not_verified", 403);
  const name = [user.first_name, user.last_name].filter(v => typeof v === "string" && v.trim()).join(" ").trim() || null;
  const personId = await rpc(config, "resolve_existing_terminus_login", { p_provider: "workos", p_subject: workosUserId, p_email: email, p_email_verified: user.email_verified === true, p_name: name });
  if (!Number.isSafeInteger(personId) || personId < 1) throw new Denied("access_required", 403);
  const rows = await supabase(config, `/rest/v1/users?id=eq.${personId}&select=id,uuid,merged_into_user_id&limit=1`);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || row.id !== personId || row.merged_into_user_id != null) throw new Denied("unknown_person", 403);
  if (typeof row.uuid !== "string" || !UUID_RE.test(row.uuid)) throw new Denied("no_login_yet", 403);
  const login = await supabase(config, `/auth/v1/admin/users/${row.uuid}`);
  if (login?.id !== row.uuid || typeof login.email !== "string" || !login.email) throw new Denied("no_login_yet", 403);
  if ((login.banned_until && Date.parse(login.banned_until) > Date.now()) || login.deleted_at) throw new Denied("login_banned", 403);
  return { uuid: row.uuid, loginEmail: login.email };
}

/** The sealed cookie carries a login UUID; eligibility is read again before every token. */
async function requireTerminusAccess(config, uuid) {
  const rows = await supabase(config, `/rest/v1/users?uuid=eq.${uuid}&select=id,uuid,merged_into_user_id&limit=1`);
  const person = Array.isArray(rows) ? rows[0] : null;
  if (!person || person.uuid !== uuid || !Number.isSafeInteger(person.id) || person.id < 1 || person.merged_into_user_id != null) throw new Denied("access_required", 403);
  const allowed = await rpc(config, "user_can_access_terminus", { p_user: person.id });
  if (allowed === false) throw new Denied("access_required", 403);
  if (allowed !== true) throw unavailable();
}

/** GoTrue's answer as the page gets it; the refresh token stays in the cookie. */
function sessionOf(body, uuid) {
  const user = body?.user;
  if (typeof body?.access_token !== "string" || typeof body.refresh_token !== "string" || !body.refresh_token ||
      !Number.isFinite(body.expires_at) || user?.id !== uuid) throw unavailable();
  const meta = user.user_metadata ?? {};
  const name = [meta.full_name, meta.name].find(v => typeof v === "string" && v.trim()) ?? null;
  return {
    refresh: body.refresh_token,
    answer: { access_token: body.access_token, expires_at: Math.min(body.expires_at, now() + RECHECK_SECONDS), user: { user_id: uuid, email: user.email ?? null, name } },
  };
}

/** A real Supabase session for that login, as a magic link would open it; nothing is emailed. */
async function openSupabaseSession(config, person) {
  const link = await supabase(config, "/auth/v1/admin/generate_link", { method: "POST", body: JSON.stringify({ type: "magiclink", email: person.loginEmail }), refusal: { code: "login_banned", status: 403 } });
  const tokenHash = link?.hashed_token ?? link?.properties?.hashed_token;
  if (typeof tokenHash !== "string" || !tokenHash) throw unavailable();
  return sessionOf(await supabase(config, "/auth/v1/verify", { method: "POST", body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }), refusal: { code: "login_banned", status: 403 } }), person.uuid);
}

/** GoTrue refuses a banned, deleted or signed-out login here. */
async function refreshSupabaseSession(config, refreshToken, uuid) {
  return sessionOf(await supabase(config, "/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: refreshToken }), refusal: { code: "session_ended", status: 401 } }), uuid);
}

const json = (body, status, headers = {}) => Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
const failure = error => {
  if (error instanceof Denied && error.status < 500) return json({ error: error.code }, error.status);
  if (!(error instanceof Denied)) logDependency("identity_failure", error);
  return dependencyProblem(error instanceof Denied ? error.code : "identity_unavailable");
};

async function start(config, url) {
  const provider = url.searchParams.get("provider") ?? "authkit";
  if (!PROVIDERS.has(provider)) return json({ error: "invalid_provider" }, 400);
  const state = randomToken();
  const verifier = randomToken();
  const challenge = b64url(await crypto.subtle.digest("SHA-256", encoder.encode(verifier)));
  const flow = await seal(config.env, FLOW_COOKIE, { state, verifier, next: safeNext(url.searchParams.get("next"), url.origin), exp: now() + FLOW_SECONDS });
  const authorize = new URL(`${WORKOS_API}/user_management/authorize`);
  for (const [key, value] of Object.entries({
    client_id: config.clientId, redirect_uri: `${url.origin}/auth/workos/callback`, response_type: "code",
    provider, screen_hint: "sign-in", state, code_challenge: challenge, code_challenge_method: "S256",
  })) authorize.searchParams.set(key, value);
  const response = new Response(null, { status: 303, headers: { ...NO_STORE, Location: authorize.href, "Set-Cookie": setCookie(FLOW_COOKIE, flow, FLOW_SECONDS) } });
  response.headers.append("Set-Cookie", setCookie(SIGNED_OUT_COOKIE, "", 0));
  return response;
}

function equal(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function callback(config, request, url) {
  let flow;
  const back = (error) => {
    const page = new URL("/auth", url.origin);
    page.searchParams.set("error", error);
    if (flow) page.searchParams.set("next", safeNext(flow.next));
    return new Response(null, { status: 303, headers: { ...NO_STORE, Location: page.href, "Set-Cookie": setCookie(FLOW_COOKIE, "", 0) } });
  };
  try {
    flow = await open(config.env, FLOW_COOKIE, readCookie(request, FLOW_COOKIE));
  } catch {
    return back("callback_failed");
  }
  const code = url.searchParams.get("code");
  if (url.searchParams.has("error") || !code || !ID_RE.test(code) || !equal(url.searchParams.get("state"), flow.state)) return back("callback_failed");
  try {
    const answer = await workos(config, "/user_management/authenticate", {
      method: "POST",
      body: JSON.stringify({ client_id: config.clientId, client_secret: config.apiKey, grant_type: "authorization_code", code, code_verifier: flow.verifier }),
    });
    const userId = answer.user?.id;
    const sessionId = typeof answer.access_token === "string" ? sessionIdOf(answer.access_token) : null;
    if (typeof userId !== "string" || !ID_RE.test(userId) || !sessionId) throw unavailable();
    const person = await resolvePerson(config, userId);
    const opened = await openSupabaseSession(config, person);
    const session = await seal(config.env, SESSION_COOKIE, { user: userId, sid: sessionId, uuid: person.uuid, refresh: opened.refresh, exp: now() + SESSION_SECONDS });
    const headers = new Headers({ ...NO_STORE, Location: new URL(flow.next, url.origin).href });
    headers.append("Set-Cookie", setCookie(FLOW_COOKIE, "", 0));
    headers.append("Set-Cookie", setCookie(SESSION_COOKIE, session, SESSION_SECONDS));
    return new Response(null, { status: 303, headers });
  } catch (error) {
    return back(error instanceof Denied && error.status === 403 ? error.code : error instanceof Denied && error.status === 503 ? "identity_unavailable" : "callback_failed");
  }
}

/** The session takes no body: reading stops at the first byte instead of buffering one. */
async function emptyBody(request) {
  if (!request.body) return;
  const reader = request.body.getReader();
  const { done, value } = await reader.read();
  if (!done && value?.length) {
    await reader.cancel();
    throw new Denied("invalid_body", 400);
  }
}

async function issue(config, request) {
  try {
    await emptyBody(request);
    const session = await open(config.env, SESSION_COOKIE, readCookie(request, SESSION_COOKIE));
    if (!ID_RE.test(session.user ?? "") || !ID_RE.test(session.sid ?? "") || !UUID_RE.test(session.uuid ?? "") || typeof session.refresh !== "string") throw new Denied("no_session");
    await checkSession(config, session.user, session.sid);
    await requireTerminusAccess(config, session.uuid);
    const renewed = await refreshSupabaseSession(config, session.refresh, session.uuid);
    const sealed = await seal(config.env, SESSION_COOKIE, { ...session, refresh: renewed.refresh });
    return json(renewed.answer, 200, { "Set-Cookie": setCookie(SESSION_COOKIE, sealed, Math.max(0, session.exp - now())) });
  } catch (error) {
    const response = failure(error);
    if (error instanceof Denied && (error.status === 401 || error.status === 403)) response.headers.set("Set-Cookie", setCookie(SESSION_COOKIE, "", 0));
    return response;
  }
}

async function logout(config, request, url) {
  let location = new URL("/auth", url.origin).href;
  try {
    const session = await open(config.env, SESSION_COOKIE, readCookie(request, SESSION_COOKIE));
    if (ID_RE.test(session.sid ?? "")) {
      const end = new URL(`${WORKOS_API}/user_management/sessions/logout`);
      end.searchParams.set("session_id", session.sid);
      end.searchParams.set("return_to", location);
      location = end.href;
    }
  } catch {
    // No session to end at WorkOS: the cookie is cleared all the same.
  }
  const response = json({ location }, 200, { "Set-Cookie": setCookie(SESSION_COOKIE, "", 0) });
  response.headers.append("Set-Cookie", setCookie(SIGNED_OUT_COOKIE, "1", SIGNED_OUT_SECONDS));
  return response;
}

/** The three fields of a desktop sign-in, or null: PKCE challenge, the window's state and its loopback port. */
function desktopRequest(params) {
  const challenge = params.get("challenge") ?? "";
  const state = params.get("state") ?? "";
  const rawPort = params.get("port") ?? "";
  const port = Number(rawPort);
  if (!CHALLENGE_RE.test(challenge) || !STATE_RE.test(state) || !/^\d{4,5}$/.test(rawPort) || port < 1024 || port > 65535) return null;
  return { challenge, state, port };
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const DESKTOP_TEXT = {
  es: { title: "Conectar Danil en esta computadora", hint: "La app de escritorio de Danil podrá usar Atención, Difusiones y canales con tu cuenta. Hazlo solo si tú abriste esta página desde la app.", button: "Conectar", account: "Cuenta" },
  en: { title: "Connect Danil on this computer", hint: "The Danil desktop app will be able to use Attention, Broadcasts and channels with your account. Only continue if you opened this page from the app.", button: "Connect", account: "Account" },
};

/** The consent page: the window gets nothing until the person presses the button. */
function desktopPage(request, fields, email) {
  const lang = /^\s*es\b/i.test(request.headers.get("Accept-Language") ?? "") ? "es" : "en";
  const text = DESKTOP_TEXT[lang];
  const hidden = Object.entries(fields).map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`).join("");
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Danil</title>` +
    `<style>body{font-family:system-ui,sans-serif;margin:0;display:flex;justify-content:center;padding:48px 24px;color:#111;background:#fafafa}main{max-width:420px}h1{font-size:24px}p{line-height:1.5;color:#444}button{font:inherit;padding:10px 20px;border-radius:8px;border:0;background:#111;color:#fff;cursor:pointer}@media(prefers-color-scheme:dark){body{background:#111;color:#eee}p{color:#bbb}button{background:#eee;color:#111}}</style></head>` +
    `<body><main><h1>${text.title}</h1><p>${text.hint}</p>${email ? `<p>${text.account}: <strong>${escapeHtml(email)}</strong></p>` : ""}` +
    `<form method="post" action="${DESKTOP_PAGE}/approve">${hidden}<button type="submit">${text.button}</button></form></main></body></html>`;
  return new Response(html, { status: 200, headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' http://127.0.0.1:*; frame-ancestors 'none'; base-uri 'none'", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" } });
}

/** The browser's WorkOS session, checked live; throws `Denied` without one. */
async function browserSession(config, request) {
  const session = await open(config.env, SESSION_COOKIE, readCookie(request, SESSION_COOKIE));
  if (!ID_RE.test(session.user ?? "") || !ID_RE.test(session.sid ?? "") || !UUID_RE.test(session.uuid ?? "")) throw new Denied("no_session");
  await checkSession(config, session.user, session.sid);
  return session;
}

async function desktopStart(config, request, url) {
  const fields = desktopRequest(url.searchParams);
  if (!fields || [...url.searchParams.keys()].length !== 3) return json({ error: "invalid_request" }, 400);
  let session;
  try {
    session = await browserSession(config, request);
  } catch (error) {
    if (!(error instanceof Denied) || error.status === 503) return failure(error);
    const start = new URL("/auth/workos/start", url.origin);
    start.searchParams.set("next", url.pathname + url.search);
    return new Response(null, { status: 303, headers: { ...NO_STORE, Location: start.href } });
  }
  const login = await supabase(config, `/auth/v1/admin/users/${session.uuid}`);
  return desktopPage(request, fields, typeof login?.email === "string" ? login.email : null);
}

/** The person's login, refused when banned or deleted. */
async function loginOf(config, uuid) {
  const login = await supabase(config, `/auth/v1/admin/users/${uuid}`);
  if (login?.id !== uuid || typeof login.email !== "string" || !login.email) throw new Denied("no_login_yet", 403);
  if ((login.banned_until && Date.parse(login.banned_until) > Date.now()) || login.deleted_at) throw new Denied("login_banned", 403);
  return login;
}

/** After the click: a one-time code to the window's loopback port. It holds no token; the session opens at the exchange. */
async function desktopApprove(config, request) {
  try {
    // The consent page posts a form; the device page (`/connect`, CSP `form-action 'none'`) posts JSON and navigates itself.
    const type = request.headers.get("Content-Type") ?? "";
    const asJson = /^application\/json\b/i.test(type);
    if (!asJson && !/^application\/x-www-form-urlencoded\b/i.test(type)) throw new Denied("invalid_body", 400);
    const text = new TextDecoder().decode(await readBounded(request));
    let params;
    if (asJson) {
      let body;
      try { body = JSON.parse(text); } catch { throw new Denied("invalid_body", 400); }
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 3 ||
          !["challenge", "state", "port"].every(key => typeof body[key] === "string")) throw new Denied("invalid_body", 400);
      params = new URLSearchParams(body);
    } else {
      params = new URLSearchParams(text);
    }
    const fields = desktopRequest(params);
    if (!fields) throw new Denied("invalid_body", 400);
    const session = await browserSession(config, request);
    await loginOf(config, session.uuid);
    const code = await seal(config.env, DESKTOP_CODE, { id: randomToken(), user: session.user, sid: session.sid, uuid: session.uuid, challenge: fields.challenge, exp: now() + DESKTOP_CODE_SECONDS });
    const back = new URL(`http://127.0.0.1:${fields.port}/callback`);
    back.searchParams.set("code", code);
    back.searchParams.set("state", fields.state);
    if (asJson) return json({ location: back.href }, 200, { "Referrer-Policy": "no-referrer" });
    return new Response(null, { status: 303, headers: { ...NO_STORE, Location: back.href, "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    return failure(error);
  }
}

async function readBounded(request) {
  if (Number(request.headers.get("Content-Length") ?? "0") > DESKTOP_MAX_BODY) throw new Denied("invalid_body", 400);
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > DESKTOP_MAX_BODY) {
      await reader.cancel().catch(error => logDependency("body_cancel", error));
      throw new Denied("invalid_body", 400);
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const part of parts) { bytes.set(part, at); at += part.byteLength; }
  return bytes;
}

async function desktopJson(request, keys) {
  if (!/^application\/json\b/i.test(request.headers.get("Content-Type") ?? "")) throw new Denied("invalid_body", 400);
  let body;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await readBounded(request)));
  } catch (error) {
    if (error instanceof Denied) throw error;
    throw new Denied("invalid_body", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== keys.length ||
      !keys.every(key => typeof body[key] === "string" && body[key].length > 0 && body[key].length <= 2048)) throw new Denied("invalid_body", 400);
  return body;
}

/** The window's answer: the opaque sealed session (for its keychain) and a short access token. */
async function desktopAnswer(config, value) {
  const renewed = await refreshSupabaseSession(config, value.refresh, value.uuid);
  const session = await seal(config.env, DESKTOP_SESSION, { user: value.user, sid: value.sid, uuid: value.uuid, refresh: renewed.refresh, exp: value.exp });
  return json({ session, ...renewed.answer }, 200);
}

const validPerson = value => ID_RE.test(value.user ?? "") && ID_RE.test(value.sid ?? "") && UUID_RE.test(value.uuid ?? "");
const validDesktop = value => validPerson(value) && typeof value.refresh === "string";

async function desktopExchange(config, request) {
  const body = await desktopJson(request, ["code", "verifier"]);
  let code;
  try {
    code = await open(config.env, DESKTOP_CODE, body.code);
  } catch {
    throw new Denied("invalid_code");
  }
  if (!validPerson(code) || !CHALLENGE_RE.test(code.id ?? "") || !CHALLENGE_RE.test(code.challenge ?? "")) throw new Denied("invalid_code");
  const challenge = b64url(await crypto.subtle.digest("SHA-256", encoder.encode(body.verifier)));
  if (!equal(challenge, code.challenge)) throw new Denied("invalid_code");
  await checkSession(config, code.user, code.sid);
  await requireTerminusAccess(config, code.uuid);
  // A NEW GoTrue session for the window, opened only by whoever holds the verifier.
  const login = await loginOf(config, code.uuid);
  const codes = config.env.DESKTOP_CODES;
  if (!codes) throw unavailable();
  const remaining = code.exp * 1000 - Date.now();
  if (remaining <= 0) throw new Denied("invalid_code");
  const consumed = await codes.get(codes.idFromName(code.id)).fetch("https://desktop-code/consume", {
    method: "POST", body: JSON.stringify({ exp: code.exp }), signal: upstreamSignal(config.env, AbortSignal.timeout(remaining)),
  });
  if (consumed.status === 401) throw new Denied("invalid_code");
  if (consumed.status !== 204) throw unavailable();
  // Una caída posterior quema el código: el usuario debe aprobar otro, nunca reabrir una sesión.
  const opened = await openSupabaseSession(config, { uuid: code.uuid, loginEmail: login.email });
  const session = await seal(config.env, DESKTOP_SESSION, { user: code.user, sid: code.sid, uuid: code.uuid, refresh: opened.refresh, exp: now() + SESSION_SECONDS });
  return json({ session, ...opened.answer }, 200);
}

async function desktopRefresh(config, request) {
  const body = await desktopJson(request, ["session"]);
  const value = await open(config.env, DESKTOP_SESSION, body.session);
  if (!validDesktop(value)) throw new Denied("no_session");
  await checkSession(config, value.user, value.sid);
  // Like the browser's cookie, the window's session reads the grant again before every token.
  await requireTerminusAccess(config, value.uuid);
  return desktopAnswer(config, value);
}

/** Ends the window's GoTrue session only; the browser's stays. */
async function desktopLogout(config, request) {
  const body = await desktopJson(request, ["session"]);
  let value;
  try {
    value = await open(config.env, DESKTOP_SESSION, body.session);
  } catch {
    return new Response(null, { status: 204, headers: NO_STORE });
  }
  if (!validDesktop(value)) return new Response(null, { status: 204, headers: NO_STORE });
  try {
    const renewed = await refreshSupabaseSession(config, value.refresh, value.uuid);
    const response = await fetch(`${config.supabaseUrl}/auth/v1/logout?scope=local`, { method: "POST", headers: { apikey: config.serviceKey, Authorization: `Bearer ${renewed.answer.access_token}` }, redirect: "manual", signal: upstreamSignal(config.env) });
    if (!response.ok && response.status !== 401 && response.status !== 404) throw unavailable();
  } catch (error) {
    if (!(error instanceof Denied) || error.status === 503) throw error instanceof Denied ? error : unavailable();
  }
  return new Response(null, { status: 204, headers: NO_STORE });
}

/** `/auth/desktop*`, for the desktop window; null for any other path. */
async function handleDesktop(request, env, url) {
  const route = url.pathname === DESKTOP_PAGE ? "page" :
    url.pathname === `${DESKTOP_PAGE}/approve` ? "approve" :
    url.pathname === `${DESKTOP_PAGE}/exchange` ? "exchange" :
    url.pathname === `${DESKTOP_PAGE}/session` ? "session" :
    url.pathname === `${DESKTOP_PAGE}/logout` ? "logout" : null;
  if (!route) return null;
  if (request.method !== (route === "page" ? "GET" : "POST")) return json({ error: "method_not_allowed" }, 405);
  if (request.headers.get("x-danil-actor")?.trim().toLowerCase() === "ai") return json({ error: "identity_requires_person" }, 403);
  const origin = request.headers.get("Origin");
  // The form posts from this page; the JSON routes are called by the window's Rust, never by a page.
  if (route === "approve" && origin !== url.origin) return json({ error: "forbidden_origin" }, 403);
  if (route !== "page" && route !== "approve" && origin !== null) return json({ error: "forbidden_origin" }, 403);
  const config = sessionConfig(env);
  if (!config) return dependencyProblem("sign_in_unavailable");
  try {
    if (route === "page") return await desktopStart(config, request, url);
    if (route === "approve") return await desktopApprove(config, request);
    if (route === "exchange") return await desktopExchange(config, request);
    if (route === "session") return await desktopRefresh(config, request);
    return await desktopLogout(config, request);
  } catch (error) {
    return failure(error);
  }
}

/** `/auth/workos/*`, `/auth/session`, `/auth/logout` and `/auth/desktop*`; null for any other path. */
export async function handleAuth(request, env, url) {
  const desktop = await handleDesktop(request, env, url);
  if (desktop) return desktop;
  const route = url.pathname === "/auth/workos/start" ? "start" :
    url.pathname === "/auth/workos/callback" ? "callback" :
    url.pathname === "/auth/session" ? "session" :
    url.pathname === "/auth/logout" ? "logout" : null;
  if (!route) return null;
  const method = route === "start" || route === "callback" ? "GET" : "POST";
  if (request.method !== method) return json({ error: "method_not_allowed" }, 405);
  if (method === "POST" && request.headers.get("Origin") !== url.origin) return json({ error: "forbidden_origin" }, 403);
  if (method === "POST" && request.headers.get("x-danil-actor")?.trim().toLowerCase() === "ai") return json({ error: "identity_requires_person" }, 403);
  const config = sessionConfig(env);
  if (!config) return dependencyProblem("sign_in_unavailable");
  if (route === "start") return start(config, url);
  if (route === "callback") return callback(config, request, url);
  if (route === "session") return issue(config, request);
  return logout(config, request, url);
}
