import { z } from "zod";
import { edgeIdentity, edgeTransport } from "@terminus/computers";
import { listWorkspaces, workspace, workspaceId } from "./platform-workspaces.ts";
import { availableDanilCredits } from "../lib/credits-balance.ts";

const profile = z.object({ id: z.string().startsWith("user_"), name: z.string(), email: z.unknown().optional(), workspace: workspaceId.nullable(), organizations: z.array(z.object({ id: z.string(), name: z.string() })), active_organization_id: z.string().min(1).nullish() });
/** `POST /v1/workspaces/select` → `{workspace: Workspace}` (mvp-v1 `WorkspaceSelection`); campos nuevos se ignoran. */
const selection = z.object({ workspace });
export type PlatformProfile = z.infer<typeof profile>;
export type { PlatformWorkspace } from "./platform-workspaces.ts";

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
    async creditsBalance(organizationId: string | null | undefined, signal: AbortSignal) {
      if (!organizationId || signal.aborted) return null;
      const body = await (await call("credits/balance", { signal })).json();
      return signal.aborted ? null : availableDanilCredits(body, organizationId);
    },
    workspaces: () => listWorkspaces(call),
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
