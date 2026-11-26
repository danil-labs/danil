import type { edgeTransport } from "../../platform-client/src/edge.ts";
import { availableDanilCredits, CREDITS_BALANCE_PATH } from "../../platform-client/src/treasury.ts";
import type { GroupReply } from "../../platform-client/src/treasury-config.ts";
import { WORKSPACES_PROMO_REDEEM_PATH } from "../../platform-client/src/workspaces.ts";
import { groupPromoReply } from "./group-promo-reply.ts";
import { normalizePromoCode } from "./promo-rejections.ts";
import { settledContextIds } from "./settled-contexts.ts";

export type GroupAccount = { context: string; org: string; name: string; plan: string | null; role?: string | null; personal?: boolean };
export type { GroupReply };
export type GroupSend = (context: string, method: "GET" | "POST", path: string, body?: unknown, key?: string) => Promise<GroupReply>;

/** No se reutiliza un saldo del workspace activo para representar otra organización. */
export async function readGroupBalance(send: GroupSend, group: GroupAccount): Promise<number | null> {
  try {
    const reply = await send(group.context, "GET", CREDITS_BALANCE_PATH);
    return reply.status === 200 ? availableCredits(reply.body, group.org) : null;
  } catch { return null; }
}

const availableCredits = availableDanilCredits;

export async function redeemGroupCode(send: GroupSend, group: GroupAccount, code: string, key: string) {
  const value = normalizePromoCode(code);
  if (!value) throw { status: 422, code: "invalid_code" };
  try {
    const reply = await send(group.context, "POST", WORKSPACES_PROMO_REDEEM_PATH, { code: value }, key);
    return groupPromoReply(reply);
  } catch (error) {
    const refusal = error as { detail?: string; status?: number } | null;
    if (["session_echo_mismatch", "not_available_yet", "command_not_allowed", "path_not_allowed", "not_allowed", "invalid_request"].includes(refusal?.detail ?? "") || refusal?.status === 404 || refusal?.status === 501) return { unavailable: true as const };
    throw error;
  }
}

export type GroupAccountCapabilities = { webRailCatalog?: { workspaces: (context: string) => readonly { id: string; name: string; logo?: string | null }[] | null; settled?: () => boolean; refresh: () => Promise<void> }; webPromoRole?: string | null; groupAccount?: { send: GroupSend; current: () => Promise<GroupAccount | null>; legacy?: () => boolean; contexts?: () => readonly string[] | null } };

export function webGroupAccount(transport: ReturnType<typeof edgeTransport>, credits?: { read: (context: string) => Promise<GroupReply>; clear: () => void }, orgOf?: (context: string) => string | null) {
  let legacy = false;
  let settled: readonly string[] | null = null;
  const send: GroupSend = async (context, method, path, body, key) => {
    if (![CREDITS_BALANCE_PATH, WORKSPACES_PROMO_REDEEM_PATH].includes(path)) throw { detail: "invalid_request" };
    if (method === "GET" && path === CREDITS_BALANCE_PATH && credits) return credits.read(context);
    const init = { headers: { "X-Danil-Session": context, ...(key ? { "Idempotency-Key": key } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) };
    const response = await (method === "GET" ? transport.call(path.slice(4), init) : transport.mutation(path.slice(4), init));
    if (response.ok && (response.headers.get("X-Danil-Session-Applied") !== context || (orgOf && (!orgOf(context) || response.headers.get("X-Danil-Session-Applied-Org") !== orgOf(context))))) throw { detail: "session_echo_mismatch" };
    if (response.ok && method === "POST") credits?.clear();
    return { status: response.status, body: await response.json() };
  };
  return { send, contexts: () => settled, legacy: () => legacy, async current(): Promise<GroupAccount | null> {
    settled = null;
    try {
      const response = await transport.call("identity/sessions");
      legacy = false;
      const body = await response.json() as { items?: { contexts?: { context_id: string; org: string; org_name?: string; plan?: string; role?: unknown }[] }[]; default_context?: string };
      if (!response.ok) { legacy = [404, 501].includes(response.status); return null; }
      settled = settledContextIds(body.items);
      if (settled === null) return null;
      const contexts = body.items?.flatMap((f) => f.contexts ?? []) ?? [];
      const context = contexts.find((c) => c.context_id === body.default_context) ?? (!body.default_context && contexts.length === 1 ? contexts[0] : undefined);
      return context ? { context: context.context_id, org: context.org, name: context.org_name ?? context.org, plan: context.plan ?? null, role: typeof context.role === "string" && [...context.role].length <= 128 ? context.role : undefined } : null;
    } catch (error) { legacy = [404, 501].includes((error as { status?: number } | null)?.status ?? 0); return null; }
  } };
}
