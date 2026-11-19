import { availableDanilCredits } from "./credits-balance.ts";
import { groupPromoReply } from "./group-promo-reply.ts";
import { normalizePromoCode } from "./promo-rejections.ts";

export type GroupAccount = { context: string; org: string; name: string; plan: string | null; role?: string | null };
export type GroupReply = { status: number; body?: unknown; retry_after_ms?: number };
export type GroupSend = (context: string, method: "GET" | "POST", path: string, body?: unknown, key?: string) => Promise<GroupReply>;

/** No se reutiliza un saldo del workspace activo para representar otra organización. */
export async function readGroupBalance(send: GroupSend, group: GroupAccount): Promise<number | null> {
  try {
    const reply = await send(group.context, "GET", "/v1/credits/balance");
    return reply.status === 200 ? availableCredits(reply.body, group.org) : null;
  } catch { return null; }
}

export const availableCredits = availableDanilCredits;

export async function redeemGroupCode(send: GroupSend, group: GroupAccount, code: string, key: string) {
  const value = normalizePromoCode(code);
  if (!value) throw { status: 422, code: "invalid_code" };
  try {
    const reply = await send(group.context, "POST", "/v1/workspaces/promo/redeem", { code: value }, key);
    return groupPromoReply(reply);
  } catch (error) {
    const refusal = error as { detail?: string; status?: number } | null;
    if (["session_echo_mismatch", "not_available_yet", "command_not_allowed", "path_not_allowed", "not_allowed", "invalid_request"].includes(refusal?.detail ?? "") || refusal?.status === 404 || refusal?.status === 501) return { unavailable: true as const };
    throw error;
  }
}

export type GroupAccountCapabilities = { webRailSource?: { group: () => GroupAccount | null; workspaces: () => readonly { id: string; name: string; logo?: string | null }[] | null }; webPromoRole?: string | null; groupAccount?: { send: GroupSend; current: () => Promise<GroupAccount | null>; legacy?: () => boolean } };
