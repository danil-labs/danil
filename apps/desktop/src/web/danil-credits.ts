import { sessionFetch } from "../../../../packages/attention/src/request.ts";
import type { InboxSession } from "../../../../packages/attention/src/inbox.ts";
import type { DanilCreditsSource } from "../features/chat/danil-credits.ts";

/** GET de sesión serverbound; no recibe cuenta ni permite escoger un pagador. */
export function webDanilCredits(
  session: InboxSession,
  prefix: string,
  request: typeof fetch = fetch,
  subscribe?: (clear: () => void) => () => void,
): DanilCreditsSource {
  const authorized = sessionFetch(session, request);
  return {
    subscribe,
    async readBalance() {
      const response = await authorized(`${prefix}/api/credits/balance`, { method: "GET" });
      if (!response.ok) throw new Error("credits_balance_unavailable");
      return response.json();
    },
  };
}
