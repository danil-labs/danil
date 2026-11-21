/**
 * La web con los mismos tres comandos de sesión que Desk (`danil_session_status`,
 * `danil_edge_fetch`, `danil_sign_out`), sobre la cookie del borde en vez del motor.
 * Así el riel, el «+» y la ventana montan `createSessionContexts` igual que Desk.
 *
 * - El conjunto de la cookie trae una sesión por correo y un contexto por organización
 *   (`GET /v1/identity/sessions`). Cada llamada lleva su `X-Danil-Session` y solo vale con
 *   el eco del mismo contexto y la misma organización.
 * - Ninguna llamada de la ventana cae en el contexto por omisión: sin contexto solo pasan
 *   las rutas de la sesión misma.
 * - Un 401 de un contexto se queda en ese contexto (W4). Solo la lectura del conjunto sin
 *   cookie viva cierra la página.
 */
import { EdgeError, type EdgeTransport } from "@terminus/computers";
import { CAPABILITIES_PATH } from "../platform/machines.ts";

type Args = Record<string, unknown>;
type Context = { context_id: string; org: string; org_name: string | null; plan: string | null; role?: string | null; personal?: boolean };
type Family = { family: string; sub: string; email: string | null; contexts: Context[] };
export type WebSessionStatus = { state: "connected" | "disconnected"; sessions: Family[]; default_context?: string | null };

const COMMANDS = new Set(["danil_session_status", "danil_edge_fetch", "danil_sign_out"]);
const OPAQUE = /^[A-Za-z0-9_-]{1,128}$/;
const PATH = /^\/v1\/[A-Za-z0-9_\-./]+(\?[A-Za-z0-9_\-.=&%]*)?$/;
const METHODS = new Set(["GET", "POST", "PUT", "DELETE"]);
/** Las rutas de la sesión misma: no son de una organización y no llevan contexto. */
const SESSION_ROUTES = new Set(["/v1/identity/sessions", "/v1/identity/sessions/catalog", "/v1/identity/contexts", CAPABILITIES_PATH]);

const text = (value: unknown) => (typeof value === "string" && value ? value : null);
const refused = (detail: string, extra: Args = {}) => ({ detail, ...extra });

function parseStatus(body: unknown): WebSessionStatus {
  const raw = (body && typeof body === "object" ? body : {}) as { items?: unknown; default_context?: unknown };
  const items = Array.isArray(raw.items) ? raw.items : [];
  const sessions = items.flatMap((item): Family[] => {
    const f = (item ?? {}) as { session_id?: unknown; sub?: unknown; email?: unknown; contexts?: unknown };
    const family = text(f.session_id), sub = text(f.sub);
    if (!family || !OPAQUE.test(family) || !sub) return [];
    const contexts = (Array.isArray(f.contexts) ? f.contexts : []).flatMap((entry): Context[] => {
      const c = (entry ?? {}) as Record<string, unknown>;
      const id = text(c.context_id), org = text(c.org);
      if (!id || !OPAQUE.test(id) || !org) return [];
      return [{ context_id: id, org, org_name: text(c.org_name), plan: text(c.plan), ...(text(c.role) ? { role: text(c.role) } : {}), ...(c.personal === true ? { personal: true } : {}) }];
    });
    return [{ family, sub, email: text(f.email), contexts }];
  });
  // La web no depende del contexto por omisión del servidor: su preferencia es la personal del primer correo.
  const first = sessions[0]?.contexts;
  return { state: "connected", sessions, default_context: (first?.find((c) => c.personal) ?? first?.[0])?.context_id ?? null };
}

export function webSessionCommands(transport: EdgeTransport, options: { expired: () => void; changed?: (status: WebSessionStatus) => void }) {
  let last: WebSessionStatus | null = null;
  const known = new Map<string, { org: string; sub: string; family: string }>();

  async function status(): Promise<WebSessionStatus> {
    try {
      last = parseStatus(await (await transport.call("identity/sessions")).json());
    } catch (error) {
      if (error instanceof EdgeError && error.status === 401) {
        last = { state: "disconnected", sessions: [] };
        known.clear();
        options.expired();
        return last;
      }
      throw refused("unavailable");
    }
    known.clear();
    for (const f of last.sessions) for (const c of f.contexts) known.set(c.context_id, { org: c.org, sub: f.sub, family: f.family });
    options.changed?.(last);
    return last;
  }

  async function fetch(args: Args) {
    const method = String(args.method ?? "GET").toUpperCase();
    const path = text(args.path);
    const context = text(args.context);
    if (!METHODS.has(method) || !path || !PATH.test(path) || path.includes("..")) throw refused("invalid_request");
    if (!context && !SESSION_ROUTES.has(path.split("?")[0])) throw refused("session_selection_required");
    const scope = context ? known.get(context) : undefined;
    if (context && !scope) throw refused("session_not_in_set");
    const headers = new Headers({ ...(context ? { "X-Danil-Session": context } : {}) });
    const key = text(args.idempotencyKey);
    if (method !== "GET") {
      headers.set("Content-Type", "application/json");
      headers.set("Idempotency-Key", key && /^[\x21-\x7e]{1,128}$/.test(key) ? key : crypto.randomUUID());
    }
    let response: Response;
    try {
      response = method === "GET" ? await transport.call(path.slice(4), { headers }) : await transport.mutation(path.slice(4), { method, headers, body: JSON.stringify(args.body ?? {}) });
    } catch (error) {
      if (!(error instanceof EdgeError)) throw refused("unavailable");
      if (error.status === 401) throw refused(error.code ?? "session_expired", { status: 401, ...(context ? { context } : {}) });
      const wait = Number(error.retryAfter);
      return { status: error.status, body: error.code ? { code: error.code } : null, ...(Number.isFinite(wait) && wait >= 0 && error.retryAfter ? { retry_after_ms: wait * 1000 } : {}) };
    }
    if (context && (response.headers.get("X-Danil-Session-Applied") !== context || response.headers.get("X-Danil-Session-Applied-Org") !== scope!.org)) {
      await response.body?.cancel();
      throw refused("session_echo_mismatch");
    }
    const body = response.status === 204 ? undefined : await response.json().catch(() => null);
    const empty = response.headers.get("X-Danil-Empty-Reason");
    const location = response.headers.get("Location");
    return { status: response.status, body, ...(empty ? { empty_reason: empty } : {}), ...(location ? { location } : {}) };
  }

  async function signOut(args: Args) {
    const context = args.context === undefined ? null : text(args.context);
    const family = args.family === undefined ? null : text(args.family);
    if ((args.context !== undefined && (!context || !OPAQUE.test(context))) || (args.family !== undefined && (!family || !OPAQUE.test(family)))) throw refused("invalid_request");
    const path = context ? `identity/contexts/${context}/logout` : family ? `identity/sessions/${family}/logout` : "identity/logout";
    await transport.mutation(path, { headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: "{}" });
    if (!context && !family) { options.expired(); return { state: "disconnected", sessions: [] }; }
    return status();
  }

  return {
    answers: (command: string) => COMMANDS.has(command),
    handle(command: string, args: Args = {}): Promise<unknown> {
      if (command === "danil_session_status") return status();
      if (command === "danil_edge_fetch") return fetch(args);
      if (command === "danil_sign_out") return signOut(args);
      return Promise.reject(refused("command"));
    },
    /** El contexto vigente de un (correo, organización): no se guarda, porque vence. */
    contextOf: (sub: string, org: string) => [...known].find(([, v]) => v.sub === sub && v.org === org)?.[0] ?? null,
    scopeOf: (context: string) => known.get(context) ?? null,
    last: () => last,
  };
}

export type WebSessionCommands = ReturnType<typeof webSessionCommands>;
