type CheckoutState = "creating" | "open" | "completed" | "expired" | "canceled";
export type CheckoutOutcome = "active" | "processing" | "cancelled" | "expired";

export function checkoutReturn(href: string) {
  const url = new URL(href);
  const raw = url.searchParams.get("checkout");
  const cancelled = url.searchParams.get("result") === "cancel";
  url.searchParams.delete("checkout");
  url.searchParams.delete("result");
  return { id: raw && /^bchk_[0-9A-Za-z]{16,40}$/.test(raw) ? raw : null, cancelled, clean: url.href };
}

export async function followCheckout(options: {
  read: () => Promise<CheckoutState>;
  active: () => Promise<boolean>;
  wait: (ms: number) => Promise<void>;
  cancelled: boolean;
}): Promise<CheckoutOutcome> {
  let elapsed = 0;
  let delay = 1000;
  const start = Date.now();
  while (true) {
    try {
      const state = await options.read();
      if (state === "expired") return "expired";
      if (state === "canceled") return "cancelled";
      if (state === "completed" && await options.active()) return "active";
      if (options.cancelled) return state === "completed" ? "processing" : "cancelled";
    } catch (error) {
      const status = (error as { status?: unknown })?.status;
      if (options.cancelled || (status !== 501 && status !== 503)) throw error;
    }
    const remaining = 60000 - Math.max(elapsed, Date.now() - start);
    if (remaining <= 0) return "processing";
    const step = Math.min(delay, remaining);
    await options.wait(step);
    elapsed += step;
    delay = Math.min(delay * 2, 8000);
    if (elapsed >= 60000 || Date.now() - start >= 60000) return "processing";
  }
}
