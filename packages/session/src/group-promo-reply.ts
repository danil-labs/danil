type PromoReply = { status: number; body?: unknown; retry_after_ms?: number };

export function groupPromoReply(reply: PromoReply) {
  if (reply.status >= 200 && reply.status < 300) {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("danil:organization-changed"));
    return (reply.body ?? {}) as { machine?: { state?: string } };
  }
  if (reply.status === 404 || reply.status === 501) return { unavailable: true as const };
  throw { status: reply.status, code: (reply.body as { code?: string } | null)?.code, ...(reply.retry_after_ms === undefined ? {} : { retry_after_ms: reply.retry_after_ms }) };
}
