type CheckoutState = "pending" | "paid" | "active" | "expired" | "canceled" | "error";
type CheckoutStatus = { state: CheckoutState; terminal: boolean; organization_id?: string };
export type CheckoutOutcome = { kind: "active"; organizationId?: string } | { kind: "paid" | "processing" | "cancelled" | "expired" | "error" };

export function checkoutReturn(href: string) {
  const url = new URL(href);
  const raw = url.searchParams.get("checkout");
  const cancelled = url.searchParams.get("result") === "cancel";
  url.searchParams.delete("checkout");
  url.searchParams.delete("result");
  return { id: raw && /^bchk_[0-9A-Za-z]{16,40}$/.test(raw) ? raw : null, cancelled, clean: url.href };
}

export async function followCheckout(options: {
  read: () => Promise<CheckoutStatus>;
  wait: (ms: number) => Promise<void>;
  cancelled: boolean;
  onState?: (state: CheckoutState) => void;
}): Promise<CheckoutOutcome> {
  let elapsed = 0;
  let delay = 1000;
  const start = Date.now();
  const budget = options.cancelled ? 10000 : 60000;
  while (true) {
    let retryAfter = 0;
    try {
      const status = await options.read();
      options.onState?.(status.state);
      if (status.terminal) {
        if (status.state === "active") return status.organization_id ? { kind: "active", organizationId: status.organization_id } : { kind: "active" };
        if (status.state === "canceled") return { kind: "cancelled" };
        if (status.state === "expired" || status.state === "error" || status.state === "paid") return { kind: status.state };
        throw new Error("invalid_checkout_status");
      }
    } catch (error) {
      const problem = error as { status?: unknown; retryAfter?: unknown };
      if (problem?.status !== 429 && problem?.status !== 501 && problem?.status !== 503) throw error;
      if (typeof problem.retryAfter === "string") retryAfter = Math.max(0, Number(problem.retryAfter) * 1000 || 0);
    }
    const remaining = budget - Math.max(elapsed, Date.now() - start);
    if (remaining <= 0) return { kind: "processing" };
    const step = Math.min(Math.max(delay * (0.75 + Math.random() * 0.5), retryAfter), remaining);
    await options.wait(step);
    elapsed += step;
    delay = Math.min(delay * 2, 8000);
    if (elapsed >= budget || Date.now() - start >= budget) return { kind: "processing" };
  }
}
