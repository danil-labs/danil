// Entrada de alfa-app.danil.ai (o del host de ENTRY_HOST, como la web de staging): sirve Terminus
// web (TERMINUS_WEB) en la raíz, la entrada con WorkOS (session.mjs) y, en /alpha-api, una lista cerrada del BFF de appv2 (APPV2_BFF).
// Lecturas GET: /auth/profile, /auth/emails, /auth/account/support-access,
// /auth/organization/workspaces, /api/channels, el
// inbox y los agentes y conexiones de atención de Configuración, con query acotada.
// Las escrituras usan Origin exacto, Bearer personal y cuerpos JSON reconstruidos y acotados.
// La autorización de respuestas se revalida en el BFF sobre la cuenta y canal de la conversación.
// Difusiones: lo que falta sobre marketingProxy son listas cerradas en broadcasts.mjs. Lo que llega
// a Meta responde 403 salvo con BROADCAST_WRITES="on"; lo que llega a clientes, 409 salvo con
// BROADCAST_DELIVERY="on". Ambas pasan por el preflight de campaigns.manage.
import { broadcastRead, broadcastWrite } from "./broadcasts.mjs";
import { handleAuth, hasSignedOutMarker, sessionConfig } from "./session.mjs";

const HOST = "alfa-app.danil.ai";
// Pasada la puerta de `fetch`, `url.origin` es `https://<host>`: las escrituras comparan contra él.
// La web vive en la raíz del dominio (build con `TERMINUS_WEB_BASE=/`).
const PREFIX = "/alpha-api";
const ENTRY_PATHS = ["/auth", "/sign-in"];
// Donde vivía antes; sus enlaces y PWA instaladas se mandan a la raíz.
const LEGACY = "/terminus";
const PHONE_ROUTES = ["inbox", "inbox-thread", "inbox-detail", "personalize", "broadcasts", "channels", "attention-agents"].map(route => `/m/${route}`);
const json = (error, status) => Response.json({ error }, {
  status,
  headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});

// Los correos de la persona (Configuración → Cuenta de Danil).
const EMAIL_WRITES = {
  "/auth/emails": ["email"],
  "/auth/emails/verify": ["email", "code"],
  "/auth/emails/primary": ["email"],
  "/auth/emails/remove": ["email"],
};
const MAX_BODY = 1024;
const WORKSPACE_KEY = /^(a:[1-9][0-9]{0,17}|w:[!-~]{1,128})$/;
// Atención en Configuración: sin query; el BFF ancla cada una a la cuenta activa de la sesión.
const SERVICE_READS = ["/api/agents", "/api/calendar/connections", "/api/http_tools", "/api/account_variables"];
const SERVICE_AGENT = /^\/api\/agents\/[1-9]\d*(\/connections)?$/;

const positive = value => Number.isSafeInteger(value) && value > 0;
const exact = (body, required, optional = []) => body && typeof body === "object" && !Array.isArray(body) && required.every(key => Object.hasOwn(body, key)) && Object.keys(body).every(key => required.includes(key) || optional.includes(key));

function marketingRoute(path) {
  if (path === "/api/marketing/campaigns") return "campaigns";
  if (path === "/api/marketing/templates") return "templates";
  if (path === "/api/contacts") return "contact-list";
  const match = /^\/api\/marketing\/(?:templates\/([1-9]\d*)\/(channels)|campaigns\/([1-9]\d*)\/(stats|pause|cancel|contacts|start|resume|schedule))$/.exec(path);
  return match && positive(Number(match[1] ?? match[3])) ? match[2] ?? match[4] : null;
}

/** Solo restringe; la firma y la autoridad del mismo Bearer se verifican después en el BFF. */
function bearerAccount(authorization) {
  try {
    const token = authorization.split(" ")[1];
    if (token.split(".").length !== 3) return null;
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const account = JSON.parse(atob(payload)).active_account_id;
    return positive(account) ? account : null;
  } catch { return null; }
}

/** Toda escritura de marketing lo pasa: las reglas de la base no cubren cada ruta ni cada fallo. */
async function requireCampaignsManage(env, url, headers, account) {
  const permissionsUrl = new URL(`/auth/account/my-permissions?account_id=${account}`, url.origin);
  const response = await forward(env, new Request(permissionsUrl, { headers, redirect: "manual" }));
  if (!response.ok) return json("permissions_unavailable", response.status === 401 ? 401 : 403);
  let permissions;
  try { permissions = await response.json(); } catch { return json("permissions_unavailable", 403); }
  if (typeof permissions?.role !== "string" || !Array.isArray(permissions.permissions) || !permissions.permissions.every(value => typeof value === "string") || !Array.isArray(permissions.scoped) || !permissions.scoped.every(grant => grant && typeof grant.permission === "string" && typeof grant.scope_type === "string" && positive(grant.scope_id)) || !permissions.permissions.includes("campaigns.manage")) return json("forbidden_read_only", 403);
  return null;
}

async function marketingProxy(request, env, url, path, route) {
  const write = request.method === "POST";
  if (!write && request.method !== "GET") return json("method_not_allowed", 405);
  if ((!write && !["campaigns", "templates", "contact-list", "channels", "stats"].includes(route)) || (write && !["campaigns", "pause", "cancel", "contacts", "start", "resume", "schedule"].includes(route))) return json("method_not_allowed", 405);
  if (write && request.headers.get("Origin") !== url.origin) return json("forbidden_origin", 403);
  if (write && (request.headers.get("X-Danil-Actor") ?? "").trim().toLowerCase() === "ai") return json("identity_requires_person", 403);
  const authorization = request.headers.get("Authorization");
  if (!authorization || !/^Bearer \S+$/i.test(authorization)) return json("unauthorized", 401);
  const keys = [...url.searchParams.keys()];
  const templateList = !write && route === "templates" && keys.includes("status");
  if (keys.length !== (templateList ? 2 : 1) || new Set(keys).size !== keys.length || !keys.includes("account_id") || (templateList && url.searchParams.get("status") !== "APPROVED")) return json("invalid_query", 400);
  const rawAccount = url.searchParams.get("account_id");
  const account = Number(rawAccount);
  if (!/^\d+$/.test(rawAccount ?? "") || !positive(account)) return json("invalid_query", 400);
  const active = bearerAccount(authorization);
  if (active === null) return json("missing_active_account", 403);
  if (active !== account) return json("account_mismatch", 403);
  if (write && ["contacts", "start", "resume", "schedule"].includes(route)) return json("campaign_delivery_unavailable", 409);
  if (!env.APPV2_BFF) return json("bff_unavailable", 503);
  const headers = new Headers({ Authorization: authorization, Accept: "application/json", Origin: url.origin });
  let body;
  if (write) {
    if (route === "campaigns") {
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("Content-Type") ?? "")) return json("invalid_body", 400);
      const bytes = await boundedBody(request, 20 * 1024);
      let value;
      try { value = bytes && JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return json("invalid_body", 400); }
      if (!exact(value, ["name", "template_id", "channel_id"], ["variable_mapping"]) || typeof value.name !== "string" || !value.name.trim() || value.name.trim().length > 200 || !positive(value.template_id) || !positive(value.channel_id)) return json("invalid_body", 400);
      const mapping = value.variable_mapping;
      if (mapping !== undefined && (!mapping || typeof mapping !== "object" || Array.isArray(mapping) || Object.keys(mapping).length > 50 || Object.entries(mapping).some(([key, val]) => !/^[a-zA-Z0-9_.]{1,64}$/.test(key) || key === "__header_media_url" || typeof val !== "string" || !val.trim() || val.length > 1024))) return json("invalid_body", 400);
      body = JSON.stringify({ name: value.name.trim(), template_id: value.template_id, channel_id: value.channel_id, ...(mapping === undefined ? {} : { variable_mapping: Object.fromEntries(Object.entries(mapping)) }) });
      headers.set("Content-Type", "application/json");
    } else {
      const bytes = await boundedBody(request, 0);
      if (!bytes) return json("invalid_body", 400);
    }
    const denied = await requireCampaignsManage(env, url, headers, account);
    if (denied) return denied;
  }
  url.pathname = path;
  url.search = new URLSearchParams({ account_id: String(account), ...(templateList ? { status: "APPROVED" } : {}) }).toString();
  return forward(env, new Request(url, { method: request.method, headers, ...(body === undefined ? {} : { body }), redirect: "manual" }));
}

async function replyWrite(request, env, url) {
  if (request.headers.get("Origin") !== url.origin) return json("forbidden_origin", 403);
  if ((request.headers.get("X-Danil-Actor") ?? "").trim().toLowerCase() === "ai") return json("identity_requires_person", 403);
  const authorization = request.headers.get("Authorization");
  if (!authorization || !/^Bearer \S+$/i.test(authorization)) return json("unauthorized", 401);
  if (url.search) return json("invalid_query", 400);
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("Content-Type") ?? "")) return json("invalid_body", 400);
  const bytes = await boundedBody(request, 20 * 1024);
  if (!bytes) return json("invalid_body", 400);
  let body;
  try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return json("invalid_body", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 3 ||
      !["conversation_id", "text", "client_message_id"].every(key => Object.hasOwn(body, key)) ||
      !Number.isSafeInteger(body.conversation_id) || body.conversation_id <= 0 ||
      typeof body.text !== "string" || !body.text.trim() || body.text.trim().length > 4096 ||
      typeof body.client_message_id !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.client_message_id)) return json("invalid_body", 400);
  if (!env.APPV2_BFF) return json("bff_unavailable", 503);
  url.pathname = "/api/messaging/reply";
  const headers = { Authorization: authorization, Accept: "application/json", "Content-Type": "application/json", Origin: url.origin };
  return forward(env, new Request(url, { method: "POST", headers, body: JSON.stringify({ conversation_id: body.conversation_id, text: body.text.trim(), client_message_id: body.client_message_id }), redirect: "manual" }));
}

/** Lee el cuerpo por partes y corta al pasar de `max` bytes: sin Content-Length no se carga entero. */
async function boundedBody(request, max) {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.byteLength;
  }
  return bytes;
}

/** El cuerpo exacto de una escritura de correos, o null: solo sus campos, todos de texto acotado. */
async function emailBody(request, fields) {
  if (!(request.headers.get("Content-Type") ?? "").toLowerCase().startsWith("application/json")) return null;
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (declared > MAX_BODY) return null;
  const bytes = await boundedBody(request, MAX_BODY);
  if (!bytes) return null;
  let body;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  if (keys.length !== fields.length || !fields.every((f) => keys.includes(f))) return null;
  if (typeof body.email !== "string" || body.email.length > 254 || /[\x00-\x1f\x7f]/.test(body.email)) return null;
  if (fields.includes("code") && (typeof body.code !== "string" || !/^\d{6}$/.test(body.code))) return null;
  return Object.fromEntries(fields.map((f) => [f, body[f]]));
}

function queryFor(url, kind) {
  const fields = kind === "profile" || kind === "channels" || kind === "emails" || kind === "service" ? {} : kind === "support" ? { account_id: [1, Number.MAX_SAFE_INTEGER] } : {
    account_id: [1, Number.MAX_SAFE_INTEGER],
    limit: [1, 100],
    ...(kind === "list" ? { offset: [0, 100_000] } : { before_id: [1, Number.MAX_SAFE_INTEGER] }),
  };
  const query = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    const bounds = Object.hasOwn(fields, key) && fields[key];
    const number = Number(value);
    if (!bounds || query.has(key) || !/^\d+$/.test(value) ||
        !Number.isSafeInteger(number) || number < bounds[0] || number > bounds[1]) return null;
    query.set(key, String(number));
  }
  if (kind !== "profile" && kind !== "channels" && kind !== "emails" && kind !== "service" && !query.has("account_id")) return null;
  return query;
}

/** Al BFF; solo vuelve JSON, sin redirecciones, cookies ni caché. */
async function forward(env, upstream) {
  if (env.workspaceKey) {
    upstream = new Request(upstream);
    upstream.headers.set("X-Danil-Workspace", env.workspaceKey);
  }
  let response;
  try {
    response = await env.APPV2_BFF.fetch(upstream);
  } catch {
    return json("bff_unavailable", 502);
  }
  if (response.status >= 300 && response.status < 400) return json("unexpected_redirect", 502);
  if (response.status === 204) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) return json("unexpected_response", 502);
  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "Pragma": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Una escritura de correos: desde esta página, con sesión y el cuerpo exacto de su ruta. */
/** Entrar a un workspace en esta sesión. Solo la clave llega al BFF, que decide con el Bearer de la persona. */
async function enterWrite(request, env, url) {
  if (request.headers.get("Origin") !== url.origin) return json("forbidden_origin", 403);
  if ((request.headers.get("X-Danil-Actor") ?? "").trim().toLowerCase() === "ai") return json("identity_requires_person", 403);
  const authorization = request.headers.get("Authorization");
  if (!authorization || !/^Bearer \S+$/i.test(authorization)) return json("unauthorized", 401);
  if (url.search) return json("invalid_query", 400);
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("Content-Type") ?? "")) return json("invalid_body", 400);
  const bytes = await boundedBody(request, MAX_BODY);
  let body;
  try { body = bytes && JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return json("invalid_body", 400); }
  if (!exact(body, ["key"]) || typeof body.key !== "string" || !WORKSPACE_KEY.test(body.key)) return json("invalid_body", 400);
  if (!env.APPV2_BFF) return json("bff_unavailable", 503);
  url.pathname = "/api/workspace/enter";
  const headers = { Authorization: authorization, Accept: "application/json", "Content-Type": "application/json", Origin: url.origin };
  return forward(env, new Request(url, { method: "POST", headers, body: JSON.stringify({ key: body.key }), redirect: "manual" }));
}

async function emailWrite(request, env, url, path) {
  if (request.headers.get("Origin") !== url.origin) return json("forbidden_origin", 403);
  // Quitar la marca convertiría en persona a un turno de IA: se rechaza aquí, como en el BFF.
  if ((request.headers.get("X-Danil-Actor") ?? "").trim().toLowerCase() === "ai") return json("identity_requires_person", 403);
  const authorization = request.headers.get("Authorization");
  if (!authorization || !/^Bearer \S+$/i.test(authorization)) return json("unauthorized", 401);
  if (url.search) return json("invalid_query", 400);
  const body = await emailBody(request, EMAIL_WRITES[path]);
  if (!body) return json("invalid_body", 400);
  if (!env.APPV2_BFF) return json("bff_unavailable", 503);
  const headers = new Headers({ Authorization: authorization, Accept: "application/json", "Content-Type": "application/json", Origin: url.origin });
  const referer = request.headers.get("Referer");
  if (referer !== null) headers.set("Referer", referer);
  url.pathname = path;
  url.search = "";
  return forward(env, new Request(url, { method: "POST", headers, body: JSON.stringify(body), redirect: "manual" }));
}

/** Una escritura de Difusiones: las mismas barreras que los correos, más el interruptor. */
async function writeBroadcast(request, env, url, path, route) {
  if (request.headers.get("Origin") !== url.origin) return json("forbidden_origin", 403);
  if ((request.headers.get("X-Danil-Actor") ?? "").trim().toLowerCase() === "ai") return json("identity_requires_person", 403);
  const authorization = request.headers.get("Authorization");
  if (!authorization || !/^Bearer \S+$/i.test(authorization)) return json("unauthorized", 401);
  if (!route.delivery && env.BROADCAST_WRITES !== "on") return json("broadcast_writes_disabled", 403);
  const account = bearerAccount(authorization);
  if (account === null) return json("missing_active_account", 403);
  if (route.delivery) {
    const claimed = url.searchParams.get("account_id");
    if ([...url.searchParams.keys()].length !== 1 || !/^\d+$/.test(claimed ?? "") || Number(claimed) !== account) return json("account_mismatch", 403);
    url.search = "";
  }
  if (url.search) return json("invalid_query", 400);
  const contentType = request.headers.get("Content-Type") ?? "";
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (declared > route.max) return json("invalid_body", 400);
  const bytes = route.parse === null ? new Uint8Array() : await boundedBody(request, route.max);
  if (!bytes) return json("invalid_body", 400);
  const body = route.parse === null ? undefined : await route.parse(bytes, contentType, { env, account });
  if (body === null) return json("invalid_body", 400);
  if (!env.APPV2_BFF) return json("bff_unavailable", 503);
  const headers = new Headers({ Authorization: authorization, Accept: "application/json", Origin: url.origin });
  if (!route.anyMember) {
    const denied = await requireCampaignsManage(env, url, headers, account);
    if (denied) return denied;
  }
  if (route.parse !== null && !route.multipart) headers.set("Content-Type", "application/json");
  const referer = request.headers.get("Referer");
  if (referer !== null) headers.set("Referer", referer);
  url.pathname = path;
  return forward(env, new Request(url, { method: request.method, headers, body, redirect: "manual" }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname !== (env.ENTRY_HOST?.trim() || HOST) || url.protocol !== "https:") return json("not_found", 404);
    if (url.pathname === LEGACY || url.pathname.startsWith(`${LEGACY}/`)) {
      if (request.method !== "GET" && request.method !== "HEAD") return json("method_not_allowed", 405);
      url.pathname = url.pathname.slice(LEGACY.length) || "/";
      return new Response(null, { status: 308, headers: { Location: url.href, "Cache-Control": "no-store" } });
    }
    if (url.pathname === PREFIX || url.pathname.startsWith(`${PREFIX}/`)) {
      const path = url.pathname.slice(PREFIX.length);
      // Cerrada también: el BFF compara la clave con el claim verificado. Nunca elige workspace.
      const workspaceKey = request.headers.get("X-Danil-Workspace");
      if (workspaceKey !== null && !WORKSPACE_KEY.test(workspaceKey)) return json("invalid_workspace_key", 400);
      if (workspaceKey !== null) env = { ...env, workspaceKey };
      if (request.method === "POST" && path === "/api/workspace/enter") return enterWrite(request, env, url);
      const write = broadcastWrite(request.method, path);
      if (write && (!write.delivery || env.BROADCAST_DELIVERY === "on")) return writeBroadcast(request, env, url, path, write);
      const marketing = marketingRoute(path);
      if (marketing) return marketingProxy(request, env, url, path, marketing);
      if (request.method === "POST" && path === "/api/messaging/reply") return replyWrite(request, env, url);
      if (request.method === "POST" && Object.hasOwn(EMAIL_WRITES, path)) return emailWrite(request, env, url, path);
      if (request.method !== "GET") return json("method_not_allowed", 405);
      const read = broadcastRead(path);
      const kind = read ? "broadcast" : path === "/auth/profile" ? "profile" :
        path === "/auth/emails" ? "emails" :
        path === "/api/inbox/conversations" ? "list" :
        path === "/api/channels" ? "channels" :
        path === "/auth/account/support-access" ? "support" :
        path === "/auth/organization/workspaces" ? "support" :
        SERVICE_READS.includes(path) || SERVICE_AGENT.test(path) ? "service" :
        path === "/auth/account/my-permissions" ? "support" :
        /^\/api\/inbox\/conversations\/[1-9]\d*\/messages$/.test(path) ? "messages" : null;
      if (!kind) return json("not_found", 404);
      if (kind === "messages" && !Number.isSafeInteger(Number(path.split("/")[4]))) return json("invalid_query", 400);
      if (kind === "service" && path.startsWith("/api/agents/") && !Number.isSafeInteger(Number(path.split("/")[3]))) return json("invalid_query", 400);
      const query = read ? read(url.searchParams) : queryFor(url, kind);
      if (!query) return json("invalid_query", 400);
      const authorization = request.headers.get("Authorization");
      if (!authorization || !/^Bearer \S+$/i.test(authorization)) return json("unauthorized", 401);
      if (!env.APPV2_BFF) return json("bff_unavailable", 503);
      const headers = new Headers({ Authorization: authorization, Accept: "application/json" });
      for (const name of ["Origin", "Referer"]) {
        const value = request.headers.get(name);
        if (value !== null) headers.set(name, value);
      }
      url.pathname = path;
      url.search = query.toString();
      return forward(env, new Request(url, { headers, redirect: "manual" }));
    }
    const signIn = await handleAuth(request, env, url);
    if (signIn) return signIn;
    if (request.method !== "GET" && request.method !== "HEAD") return json("method_not_allowed", 405);
    // Sin pantalla previa: la entrada es la de WorkOS. Con cualquier otro parámetro
    // (`error`, `signed_out`) se pinta `/auth`; si no, un fallo volvería a entrar en bucle.
    if (request.method === "GET" && sessionConfig(env) && !hasSignedOutMarker(request) && ENTRY_PATHS.includes(url.pathname) && [...url.searchParams.keys()].every((key) => key === "next")) {
      return new Response(null, { status: 302, headers: { Location: `/auth/workos/start${url.search}`, "Cache-Control": "no-store" } });
    }
    if (!env.TERMINUS_WEB) return json("assets_unavailable", 503);
    if (PHONE_ROUTES.includes(url.pathname)) {
      url.pathname = "/m/";
      return env.TERMINUS_WEB.fetch(new Request(url, request));
    }
    return env.TERMINUS_WEB.fetch(request);
  },
};
