export const BILLING_RETURN_KEY = "danil.billing.return";

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
        return { kind: "processing" };
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

export function hostedCheckoutUrl(url: string | null, kind: "checkout" | "portal" = "checkout") {
  if (!url) throw new Error("checkout_not_ready");
  const target = new URL(url);
  const origin = kind === "checkout" ? "https://checkout.stripe.com" : "https://billing.stripe.com";
  if (target.protocol !== "https:" || target.origin !== origin || target.username || target.password) throw new Error("invalid_checkout_url");
  return target.href;
}

export const PAYMENT_URL_DEADLINE_MS = 60_000;

export function paymentInProgress(state: string) {
  return state === "creating" || state === "open";
}

export async function waitForPaymentUrl(
  initial: { state: string; url: string | null },
  read: () => Promise<{ terminal: boolean; url: string | null }>,
  signal: AbortSignal,
  preparing: () => void,
): Promise<string> {
  signal.throwIfAborted();
  if (!paymentInProgress(initial.state)) throw new Error("checkout_finished");
  if (initial.url) return hostedCheckoutUrl(initial.url);
  preparing();

  let delay = 1000;
  for (;;) {
    signal.throwIfAborted();
    let retryAfter = 0;
    try {
      const status = await read();
      signal.throwIfAborted();
      if (status.terminal) throw new Error("checkout_finished");
      if (status.url) return hostedCheckoutUrl(status.url);
    } catch (error) {
      signal.throwIfAborted();
      const problem = error as { name?: string; status?: number; retryAfter?: string } | null;
      if (problem?.name !== "TimeoutError" && (!problem?.status || ![404, 429, 501, 503].includes(problem.status))) throw error;
      const header = problem.retryAfter;
      if (header) retryAfter = /^\d+$/.test(header) ? Number(header) * 1000 : Math.max(0, Date.parse(header) - Date.now()) || 0;
    }
    await waitWithSignal(Math.min(2_147_483_647, Math.max(retryAfter, delay * (0.75 + Math.random() * 0.5))), signal);
    delay = Math.min(delay * 2, 8000);
  }
}

export function waitWithSignal(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
