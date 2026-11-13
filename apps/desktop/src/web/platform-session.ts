import { z } from "zod";

const workspaceId = z.string().min(1);
const organization = z.object({ id: z.string().min(1), name: z.string(), plan: z.string().optional(), type: z.string().optional(), role: z.string().optional() });
const profile = z.object({ id: z.string().startsWith("user_"), name: z.string(), workspace: workspaceId.nullable(), organizations: z.array(organization), active_organization_id: z.string().nullable().optional() });
const workspace = z.object({ id: workspaceId, org: z.string(), name: z.string(), role: z.string() });
const page = z.object({ items: z.array(workspace), next_cursor: z.string().min(1).nullable() });
const selection = z.object({ workspace: z.union([workspaceId, workspace]) });
const organizationPage = z.object({ items: z.array(organization), next_cursor: z.string().nullable(), active_organization_id: z.string().nullable().optional() });
const organizationSelection = z.object({ organization, workspace: workspaceId.nullable() });
const csrf = z.object({ csrf_token: z.string().min(1).max(128) });
export type PlatformOrganization = z.infer<typeof organization>;
export type PlatformProfile = z.infer<typeof profile>;
export type PlatformWorkspace = z.infer<typeof workspace>;

export class PlatformSessionError extends Error {
  readonly status: number;
  readonly retryAfter: string | null;
  readonly code: string | null;
  readonly requestId: string | null;
  constructor(status: number, retryAfter: string | null, code: string | null = null, requestId: string | null = null) {
    super(`Platform session HTTP ${status}`);
    this.status = status;
    this.retryAfter = retryAfter;
    this.code = code;
    this.requestId = requestId;
  }
}

/** Cookie-only transport. No token getter or arbitrary URL can cross from the legacy client. */
export function platformTransport(options: { origin: string; timeoutMs: number }, request: typeof fetch = fetch) {
  async function call(path: string, init: RequestInit = {}) {
    init.signal?.throwIfAborted();
    const deadline = AbortSignal.timeout(options.timeoutMs);
    const response = await request(`${options.origin}/v1/${path}`, {
      ...init, credentials: "include", cache: "no-store", redirect: "error",
      signal: init.signal ? AbortSignal.any([init.signal, deadline]) : deadline,
      headers: { Accept: "application/json", ...init.headers },
    });
    if (!response.ok) {
      const problem = response.headers.get("content-type")?.split(";")[0] === "application/problem+json"
        ? await response.json().catch(() => null) as { code?: unknown; request_id?: unknown } | null : null;
      if (!response.bodyUsed) await response.body?.cancel();
      throw new PlatformSessionError(response.status, response.headers.get("retry-after"),
        typeof problem?.code === "string" ? problem.code : null,
        response.headers.get("x-request-id") ?? (typeof problem?.request_id === "string" ? problem.request_id : null));
    }
    return response;
  }
  async function mutation(path: string, init: RequestInit = {}) {
    const token = csrf.parse(await (await call("identity/csrf", { signal: init.signal })).json());
    return call(path, { ...init, method: init.method ?? "POST", headers: { ...init.headers, "X-CSRF-Token": token.csrf_token } });
  }
  return { call, mutation };
}

export function platformSession(options: { origin: string; timeoutMs: number }, request: typeof fetch = fetch) {
  const { call, mutation } = platformTransport(options, request);
  return {
    loginUrl(returnTo: string) {
      const url = new URL(`${options.origin}/v1/identity/login`);
      url.searchParams.set("return_to", returnTo);
      return url.href;
    },
    async me() { return profile.parse(await (await call("identity/me")).json()); },
    async active() { return profile.parse(await (await call("identity/me")).json()).workspace; },
    async workspaces() {
      const items: PlatformWorkspace[] = [];
      const cursors = new Set<string>();
      let cursor: string | null = null;
      do {
        const result = page.parse(await (await call(`workspaces${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`)).json());
        items.push(...result.items);
        cursor = result.next_cursor;
        if (cursor && cursors.has(cursor)) throw new Error("Repeated workspace cursor");
        if (cursor) cursors.add(cursor);
      } while (cursor);
      return items;
    },
    async select(id: string, idempotencyKey: string) {
      workspaceId.parse(id);
      return selection.parse(await (await mutation("workspaces/select", {
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ workspace: id }),
      })).json());
    },
    async organizations() {
      const items: PlatformOrganization[] = [];
      const cursors = new Set<string>();
      let cursor: string | null = null;
      let active: string | null = null;
      do {
        const result = organizationPage.parse(await (await call(`identity/organizations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`)).json());
        items.push(...result.items);
        if (result.active_organization_id !== undefined) active = result.active_organization_id;
        cursor = result.next_cursor;
        if (cursor && cursors.has(cursor)) throw new Error("Repeated organization cursor");
        if (cursor) cursors.add(cursor);
      } while (cursor);
      return { items, active_organization_id: active };
    },
    async selectOrganization(id: string, idempotencyKey: string) {
      return organizationSelection.parse(await (await mutation("identity/organizations/select", {
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ organization_id: id }),
      })).json());
    },
    async logout() { await mutation("identity/logout", { headers: { "Idempotency-Key": crypto.randomUUID() } }); },
  };
}
