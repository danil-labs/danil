import { z } from "zod";

const workspaceId = z.string().regex(/^[1-9]\d*$/);
const profile = z.object({ id: z.string().startsWith("user_"), name: z.string(), organizations: z.array(z.object({ id: z.string(), name: z.string() })) });
const workspace = z.object({ id: workspaceId, org: z.string(), name: z.string(), role: z.string() });
const page = z.object({ items: z.array(workspace), next_cursor: z.string().min(1).nullable() });
const selection = z.object({ workspace: workspaceId, ctx: z.string().min(1), authz_ver: z.number().int().nonnegative() });
const csrf = z.object({ csrf_token: z.string().min(1).max(128) });
export type PlatformProfile = z.infer<typeof profile>;
export type PlatformWorkspace = z.infer<typeof workspace>;

export class PlatformSessionError extends Error {
  readonly status: number;
  readonly retryAfter: string | null;
  constructor(status: number, retryAfter: string | null) {
    super(`Platform session HTTP ${status}`);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** Cookie-only transport. No token getter or arbitrary URL can cross from the legacy client. */
export function platformSession(options: { origin: string; timeoutMs: number }, request: typeof fetch = fetch) {
  async function call(path: string, init: RequestInit = {}) {
    const response = await request(`${options.origin}/v1/${path}`, {
      ...init, credentials: "include", cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(options.timeoutMs),
      headers: { Accept: "application/json", ...init.headers },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new PlatformSessionError(response.status, response.headers.get("retry-after"));
    }
    return response;
  }
  async function mutation(path: string, init: RequestInit = {}) {
    const token = csrf.parse(await (await call("identity/csrf")).json());
    return call(path, { ...init, method: "POST", headers: { ...init.headers, "X-CSRF-Token": token.csrf_token } });
  }
  return {
    loginUrl(returnTo: string) {
      const url = new URL(`${options.origin}/v1/identity/login`);
      url.searchParams.set("return_to", returnTo);
      return url.href;
    },
    async me() { return profile.parse(await (await call("identity/me")).json()); },
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
    async logout() { await mutation("identity/logout"); },
  };
}
