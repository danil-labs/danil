import type { edgeTransport } from "@terminus/computers";
import type { GroupAccount, GroupReply, GroupSend } from "../lib/group-account.ts";
import { settledContextIds } from "../lib/settled-contexts.ts";
import { CREDITS_BALANCE_PATH } from "../platform/treasury.ts";

export function webGroupAccount(transport: ReturnType<typeof edgeTransport>, credits?: { read: (context: string) => Promise<GroupReply>; clear: () => void }, orgOf?: (context: string) => string | null) {
  let legacy = false;
  let settled: readonly string[] | null = null;
  const send: GroupSend = async (context, method, path, body, key) => {
    if (![CREDITS_BALANCE_PATH, "/v1/workspaces/promo/redeem"].includes(path)) throw { detail: "invalid_request" };
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
