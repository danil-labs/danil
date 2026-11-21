/**
 * Dominio identity: llamadas a `/v1/identity/*` (me, organizations, selección
 * de organización, sessions, contexts, login) y sus tipos.
 */
import {
  cancelEdgeWrites,
  edgeFetch,
  edgeUntil,
  type EdgeMethod,
  type EdgeReply,
  type Patience,
} from "./client.ts";
import { CAPABILITIES_PATH } from "./machines.ts";

export type Me = {
  id: string;
  name: string;
  state?: string;
  workspace: string | null;
  organizations: { id: string; name: string; type?: string; role?: string }[];
  active_organization_id?: string | null;
};

export type Organization = {
  id: string;
  name: string;
  plan: string;
  role: string;
};

export type OrganizationList = {
  items: Organization[];
  next_cursor: string | null;
  active_organization_id?: string | null;
};

const bodyOf = <T>(method: EdgeMethod, path: string, body?: unknown, p?: Patience) =>
  edgeUntil<T>(method, path, body, p).then((r) => r.body);

export const me = (p?: Patience) => bodyOf<Me>("GET", "/v1/identity/me", undefined, p);

export const organizations = (p?: Patience) =>
  bodyOf<OrganizationList>("GET", "/v1/identity/organizations", undefined, p);

export const selectOrganization = (organizationId: string, p?: Patience) => {
  cancelEdgeWrites();
  return bodyOf<{ organization: Organization; workspace: string | null }>(
    "POST",
    "/v1/identity/organizations/select",
    { organization_id: organizationId },
    p,
  );
};

/** Llamada directa a `/v1/identity/me` usando el transporte de borde. */
export function fetchIdentityMe<T = { id?: unknown }>(
  transport = edgeFetch,
): Promise<EdgeReply<T>> {
  return transport<T>("GET", "/v1/identity/me");
}

/** Consulta `/v1/identity/me` dentro de un contexto de sesión. */
export function sendIdentityMe<R>(
  send: (context: string, method: string, path: string, ...rest: never[]) => Promise<R>,
  context: string,
): Promise<R> {
  return send(context, "GET", "/v1/identity/me");
}

/** Selecciona organización dentro de un contexto de sesión. */
export function selectOrganizationWithContext<R>(
  send: (context: string, method: string, path: string, body?: { organization_id: string }) => Promise<R>,
  context: string,
  organizationId: string,
): Promise<R> {
  return send(context, "POST", "/v1/identity/organizations/select", {
    organization_id: organizationId,
  });
}

/** Comprueba soporte llamando a `/v1/identity/me` vía Tauri invoke. */
export function probeIdentityMe(
  invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>,
  context: string,
): Promise<unknown> {
  return invoke("danil_edge_fetch", { method: "GET", path: "/v1/identity/me", context });
}

type Reply = { status: number; body: unknown; retry_after_ms?: number };
type EdgeFetchFn = (
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  idempotencyKey?: string,
) => Promise<Reply>;

/** Obtiene la lista de organizaciones sobre edgeFetch. */
export function fetchEdgeOrganizations(fetchFn: EdgeFetchFn): Promise<Reply> {
  return fetchFn("GET", "/v1/identity/organizations");
}

/** Selecciona organización sobre edgeFetch. */
export function selectEdgeOrganization(
  fetchFn: EdgeFetchFn,
  id: string,
  key?: string,
): Promise<Reply> {
  return fetchFn("POST", "/v1/identity/organizations/select", { organization_id: id }, key);
}

/** Consulta `/v1/identity/sessions/catalog` en el gestor de sesiones web. */
export function fetchSessionsCatalog(
  sessions: { handle: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> },
): Promise<{ status: number; body?: unknown }> {
  return sessions.handle("danil_edge_fetch", {
    method: "GET",
    path: "/v1/identity/sessions/catalog",
  }) as Promise<{ status: number; body?: unknown }>;
}

/** Consulta `/v1/identity/me` para una sesión web específica. */
export function handleIdentityMe(
  sessions: { handle: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> },
  context: string,
): Promise<{ status: number; body?: { name?: unknown; email?: unknown } } | null> {
  return sessions
    .handle("danil_edge_fetch", { method: "GET", path: "/v1/identity/me", context })
    .catch(() => null) as Promise<{ status: number; body?: { name?: unknown; email?: unknown } } | null>;
}

/** Rutas de sesión que no pertenecen a una organización específica. */
export const SESSION_ROUTES = new Set([
  "/v1/identity/sessions",
  "/v1/identity/sessions/catalog",
  "/v1/identity/contexts",
  CAPABILITIES_PATH,
]);

/** URL base de inicio de sesión de identity. */
export const IDENTITY_LOGIN_PATH = "/v1/identity/login";

export function getIdentityLoginUrl(
  origin: string,
  organization?: string,
  returnTo?: string,
): string {
  const url = new URL(IDENTITY_LOGIN_PATH, origin);
  if (returnTo) url.searchParams.set("return_to", returnTo);
  if (organization) url.searchParams.set("organization_id", organization);
  return url.toString();
}

/** Llama a `identity/organizations` sobre el transporte de la web. */
export function fetchWebOrganizations(transport: {
  call: (path: string, options?: unknown) => Promise<Response>;
}) {
  return transport.call("identity/organizations");
}

/** Selecciona organización sobre el transporte de la web. */
export function selectWebOrganization(
  transport: { mutation: (path: string, init?: RequestInit) => Promise<Response> },
  organizationId: string,
  idempotencyKey?: string,
) {
  return transport.mutation("identity/organizations/select", {
    headers: {
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({ organization_id: organizationId }),
  });
}

/** Admite contexto de organización sobre el transporte de la web. */
export function admitWebContext(
  transport: { mutation: (path: string, init?: RequestInit) => Promise<Response> },
  organization: string,
  sessionId: string,
) {
  return transport.mutation("identity/contexts", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ organization, session_id: sessionId }),
  });
}

/** Consulta `identity/sessions` sobre el transporte de la web. */
export function fetchWebSessions(transport: {
  call: (path: string, options?: unknown) => Promise<Response>;
}) {
  return transport.call("identity/sessions");
}

/** Consulta `identity/me` sobre el transporte de la web. */
export function fetchWebIdentityMe(call: (path: string, options?: unknown) => Promise<Response>) {
  return call("identity/me");
}
