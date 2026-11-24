import { edgeIdentity, edgeTransport } from "../../platform-client/src/edge.ts";
import { z } from "zod";
import { availableDanilCredits, scopedCreditsRead } from "../../platform-client/src/treasury.ts";
import { webGroupAccount } from "./group-account.ts";
import { webRedeemPromo } from "./group-promo.ts";
import { listWorkspaces, workspaceId } from "./platform-workspaces.ts";
import { platformFetch } from "../../platform-client/src/client.ts";

const profile = z.object({ id: z.string().startsWith("user_"), name: z.string(), email: z.unknown().optional(), workspace: workspaceId.nullable(), organizations: z.array(z.object({ id: z.string(), name: z.string(), type: z.string().nullish() })), active_organization_id: z.string().min(1).nullish() });
export type PlatformProfile = z.infer<typeof profile>;

/** The edge's cookie transport and its error are shared with the phone on the web (`@terminus/computers`). */
export { EdgeError as PlatformSessionError } from "../../platform-client/src/edge.ts";
export type { PlatformWorkspace } from "./platform-workspaces.ts";
export const platformTransport = edgeTransport;

export function platformSession(options: { origin: string; timeoutMs: number }, request: typeof fetch = platformFetch, orgOf?: (context: string) => string | null) {
  const transport = platformTransport(options, request);
  const { call } = transport;
  const identity = edgeIdentity(transport, options.origin);
  const credits = scopedCreditsRead(transport, Date.now, orgOf);
  return {
    loginUrl: identity.loginUrl,
    groupAccount: webGroupAccount(transport, credits, orgOf),
    async me() { return profile.parse(await (await call("identity/me")).json()); },
    async active() { return profile.parse(await (await call("identity/me")).json()).workspace; },
    async creditsBalance(organizationId: string | null | undefined, signal: AbortSignal, context?: string) {
      if (!organizationId || signal.aborted) return null;
      const body = context ? (await credits.read(context)).body : await (await call("credits/balance", { signal })).json();
      return signal.aborted ? null : availableDanilCredits(body, organizationId);
    },
    clearCreditsCache: () => credits.clear(),
    workspaces: () => listWorkspaces(call),
    redeemPromo: async (code: string, key: string) => { const result = await webRedeemPromo(transport)(code, key); credits.clear(); return result; },
    logout: async () => { credits.clear(); return identity.logout(); },
  };
}

export { contextMachines } from "./context-machines.ts";
