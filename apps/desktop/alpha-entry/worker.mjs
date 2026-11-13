export { DesktopCodeStore } from "./desktop-code-store.mjs";
// La SPA consume los dominios de mensajería por el borde de plataforma.
import { upstreamSignal } from "./transport.mjs";
import { dependencyProblem, logDependency } from "./dependency-error.mjs";

const HOST = "alfa-app.danil.ai";
// Pasada la puerta de `fetch`, `url.origin` es `https://<host>`: las escrituras comparan contra él.
// La web vive en la raíz del dominio (build con `TERMINUS_WEB_BASE=/`).
const PREFIX = "/alpha-api";
// Donde vivía antes; sus enlaces y PWA instaladas se mandan a la raíz.
const LEGACY = "/terminus";
const json = (error, status) => status >= 500 ? dependencyProblem(error, status) : Response.json({ error }, {
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
      await reader.cancel().catch(error => logDependency("body_cancel", error));
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
  const query = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    const number = Number(value);
    if (kind !== "support" || key !== "account_id" || query.has(key) || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(number)) return null;
    query.set(key, String(number));
  }
  if (kind === "support" && !query.has("account_id")) return null;
  return query;
}

/** Al BFF; JSON y problemas con cabeceras cerradas, sin redirecciones ni cookies. */
async function forward(env, upstream) {
  if (env.workspaceKey) {
    upstream = new Request(upstream);
    upstream.headers.set("X-Danil-Workspace", env.workspaceKey);
  }
  let response;
  try {
    response = await env.APPV2_BFF.fetch(new Request(upstream, { signal: upstreamSignal(env, upstream.signal) }));
  } catch (error) {
    logDependency("bff_fetch", error);
    return json("bff_unavailable", 502);
  }
  if (response.status >= 300 && response.status < 400) return json("unexpected_redirect", 502);
  const contentType = response.headers.get("Content-Type") ?? "";
  const mediaType = contentType.split(";")[0].trim().toLowerCase();
  if (response.status !== 204 && !["application/json", "application/problem+json"].includes(mediaType)) return json("unexpected_response", 502);
  const headers = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  for (const name of ["Content-Type", "Retry-After", "X-Request-Id", "ETag", "Cache-Control"]) {
    const value = response.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

/** Correos aún pendientes del servicio de identidad; solo cuerpos cerrados del origen propio. */
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
      if (path.startsWith("/auth/account/business/") || path === "/auth/organization/workspaces" || path === "/auth/profile" || path === "/api/workspace/enter" || path === "/api/messaging/reply" || path === "/auth/account/features" ||
          /^\/api\/(inbox|agents|credits|http_tools|account_variables|marketing|contacts|channels|media)(\/|$)/.test(path)) return json("not_found", 404);
      // Cerrada también: el BFF compara la clave con el claim verificado. Nunca elige workspace.
      const workspaceKey = request.headers.get("X-Danil-Workspace");
      if (workspaceKey !== null && !WORKSPACE_KEY.test(workspaceKey)) return json("invalid_workspace_key", 400);
      if (workspaceKey !== null) env = { ...env, workspaceKey };
      if (request.method === "POST" && Object.hasOwn(EMAIL_WRITES, path)) return emailWrite(request, env, url, path);
      if (request.method !== "GET") return json("method_not_allowed", 405);
      const kind = path === "/auth/emails" ? "emails" :
        ["/auth/account/support-access", "/auth/account/my-permissions"].includes(path) ? "support" : null;
      if (!kind) return json("not_found", 404);
      const query = queryFor(url, kind);
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
    if (url.pathname.startsWith("/auth/desktop") || url.pathname.startsWith("/auth/workos/")) {
      if (!env.DESKTOP_AUTH) return dependencyProblem("desktop_auth_unavailable");
      try { return await env.DESKTOP_AUTH.fetch(new Request(request, { signal: upstreamSignal(env, request.signal) })); }
      catch (error) { logDependency("desktop_auth", error); return dependencyProblem("desktop_auth_unavailable"); }
    }
    if (["/auth/session", "/auth/logout"].includes(url.pathname)) return json("not_found", 404);
    if (request.method !== "GET" && request.method !== "HEAD") return json("method_not_allowed", 405);
    if (!env.TERMINUS_WEB) return json("assets_unavailable", 503);
    try {
      return await env.TERMINUS_WEB.fetch(new Request(request, { signal: upstreamSignal(env, request.signal) }));
    } catch (error) {
      logDependency("assets_fetch", error);
      return dependencyProblem("assets_unavailable");
    }
  },
};
