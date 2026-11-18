import type { edgeTransport } from "@terminus/computers";
import type { GroupAccount, GroupSend } from "../lib/group-account.ts";

export function webGroupAccount(transport: ReturnType<typeof edgeTransport>) {
  let legacy = false;
  const send: GroupSend = async (context, method, path, body, key) => {
    if (!["/v1/credits/balance", "/v1/workspaces/promo/redeem"].includes(path)) throw { detail: "invalid_request" };
    const init = { headers: { "X-Danil-Session": context, ...(key ? { "Idempotency-Key": key } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) };
    const response = await (method === "GET" ? transport.call(path.slice(4), init) : transport.mutation(path.slice(4), init));
    if (response.ok && response.headers.get("X-Danil-Session-Applied") !== context) throw { detail: "session_echo_mismatch" };
    return { status: response.status, body: await response.json() };
  };
  return { send, legacy: () => legacy, async current(): Promise<GroupAccount | null> {
    try {
      const response = await transport.call("identity/sessions");
      legacy = false;
      const body = await response.json() as { items?: { contexts?: { context_id: string; org: string; org_name?: string; plan?: string }[] }[]; default_context?: string };
      const contexts = body.items?.flatMap((f) => f.contexts ?? []) ?? [];
      const context = contexts.find((c) => c.context_id === body.default_context) ?? (!body.default_context && contexts.length === 1 ? contexts[0] : undefined);
      return context ? { context: context.context_id, org: context.org, name: context.org_name ?? context.org, plan: context.plan ?? null } : null;
    } catch (error) { legacy = [404, 501].includes((error as { status?: number } | null)?.status ?? 0); return null; }
  } };
}
