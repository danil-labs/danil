import { z } from "zod";
import { edgeIdentity, edgeTransport } from "@terminus/computers";

const workspaceId = z.string().regex(/^[1-9]\d*$/);
const profile = z.object({ id: z.string().startsWith("user_"), name: z.string(), workspace: workspaceId.nullable(), organizations: z.array(z.object({ id: z.string(), name: z.string() })) });
const workspace = z.object({ id: workspaceId, org: z.string(), name: z.string(), role: z.string() });
const page = z.object({ items: z.array(workspace), next_cursor: z.string().min(1).nullable() });
/** `POST /v1/workspaces/select` → `{workspace: Workspace}` (mvp-v1 `WorkspaceSelection`); campos nuevos se ignoran. */
const selection = z.object({ workspace });
export type PlatformProfile = z.infer<typeof profile>;
export type PlatformWorkspace = z.infer<typeof workspace>;

/** The edge's cookie transport and its error are shared with the phone on the web (`@terminus/computers`). */
export { EdgeError as PlatformSessionError } from "@terminus/computers";
export const platformTransport = edgeTransport;

export function platformSession(options: { origin: string; timeoutMs: number }, request: typeof fetch = fetch) {
  const transport = platformTransport(options, request);
  const { call, mutation } = transport;
  const identity = edgeIdentity(transport, options.origin);
  return {
    loginUrl: identity.loginUrl,
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
    async redeemPromo(code: string, idempotencyKey: string) {
      const response = await mutation("workspaces/promo/redeem", {
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ code }),
      });
      return z.object({ machine: z.object({ state: z.string().optional() }).optional() }).parse(await response.json());
    },
    logout: identity.logout,
  };
}
