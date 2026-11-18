export function normalizePromoCode(raw: string): string | null {
  const code = raw.trim();
  let count = 0;
  for (const _ of code) if (++count > 64) return null;
  return count ? code : null;
}
export function promoRejection(cause: unknown) {
  const error = cause as { status?: number; code?: unknown; retry_after_ms?: unknown; retryAfter?: unknown } | null;
  const code = typeof error?.code === "string" && /^[a-z_]{1,64}$/.test(error.code) ? error.code : undefined;
  const milliseconds = typeof error?.retry_after_ms === "number" ? error.retry_after_ms : typeof error?.retryAfter === "string" && /^\d+$/.test(error.retryAfter) ? Number(error.retryAfter) * 1000 : undefined;
  const delay = milliseconds !== undefined && Number.isFinite(milliseconds) && milliseconds >= 0 ? milliseconds : undefined;
  const known: Record<string, string> = { invalid_code: "web.promo.invalid", already_redeemed: "web.promo.already_redeemed", organization_has_machine: "web.promo.has_machine" };
  const key = error?.status === 429 ? delay === undefined ? "web.promo.rate_limited_unknown" : "web.promo.rate_limited" : code ? known[code] ?? "web.promo.rejected" : error?.status === 422 ? "web.promo.invalid" : error?.status === 403 ? "web.promo.denied" : error?.status === 409 ? "web.promo.used" : "web.promo.unavailable";
  return { key, code, delay, data: { code: code ?? "", count: delay === undefined ? 0 : Math.ceil(delay / 1000) } };
}
