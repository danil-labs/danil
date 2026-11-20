import { strict as assert } from "node:assert";
import { test } from "node:test";
import { checkoutReturn, followCheckout } from "../../src/web/billing-v2-return.ts";

const id = "bchk_01SYNTHETICCHK0001";
test("the return URL supplies the treasury id and removes both parameters", () => {
  assert.deepEqual(checkoutReturn(`https://beta.danil.ai/?settings=plan&checkout=${id}&result=success`), { id, cancelled: false, clean: "https://beta.danil.ai/?settings=plan" });
});
test("success waits for terminal active and forwards the organization", async () => {
  let reads = 0;
  const result = await followCheckout({ read: async () => ++reads === 1 ? { state: "paid", terminal: false } : { state: "active", terminal: true, organization_id: "org_new" }, wait: async () => {}, cancelled: false });
  assert.deepEqual(result, { kind: "active", organizationId: "org_new" });
  assert.equal(reads, 2);
});
test("cancel return continues polling and shows a paid checkout's true state", async () => {
  let reads = 0;
  const result = await followCheckout({ read: async () => ++reads === 1 ? { state: "pending", terminal: false } : { state: "active", terminal: true, organization_id: "org_new" }, wait: async () => {}, cancelled: true });
  assert.deepEqual(result, { kind: "active", organizationId: "org_new" });
  assert.equal(reads, 2);
});
test("foreign checkout errors remain errors", async () => {
  for (const status of [403, 404]) {
    const error = Object.assign(new Error("foreign"), { status });
    await assert.rejects(followCheckout({ read: async () => { throw error; }, wait: async () => {}, cancelled: false }), error);
  }
});
test("slow success and cancel returns stop at their respective budgets", async () => {
  for (const [cancelled, budget] of [[false, 60000], [true, 10000]] as const) {
    let elapsed = 0;
    const result = await followCheckout({ read: async () => ({ state: "pending", terminal: false }), wait: async ms => { elapsed += ms; }, cancelled });
    assert.deepEqual(result, { kind: "processing" });
    assert.equal(elapsed, budget);
  }
});
test("transient unavailability is retried within the budget", async () => {
  let reads = 0;
  const result = await followCheckout({ read: async () => { if (++reads === 1) throw Object.assign(new Error("unavailable"), { status: 503 }); return { state: "active", terminal: true }; }, wait: async () => {}, cancelled: false });
  assert.deepEqual(result, { kind: "active" });
  assert.equal(reads, 2);
});
test("terminal error and expiry never become successful payments", async () => {
  for (const state of ["error", "expired", "canceled"] as const) {
    const result = await followCheckout({ read: async () => ({ state, terminal: true }), wait: async () => {}, cancelled: false });
    assert.deepEqual(result, { kind: state === "canceled" ? "cancelled" : state });
  }
});
test("paid credits stop on the server's terminal flag", async () => {
  let reads = 0;
  const result = await followCheckout({ read: async () => { reads++; return { state: "paid", terminal: true }; }, wait: async () => {}, cancelled: false });
  assert.deepEqual(result, { kind: "paid" });
  assert.equal(reads, 1);
});
test("a non-terminal error keeps polling until the budget and ends as processing", async () => {
  let elapsed = 0;
  let reads = 0;
  const result = await followCheckout({ read: async () => { reads++; return { state: "error", terminal: false }; }, wait: async ms => { elapsed += ms; }, cancelled: false });
  assert.deepEqual(result, { kind: "processing" });
  assert.equal(elapsed, 60000);
  assert.ok(reads > 1);
});
test("a terminal state without an outcome stops as processing without throwing", async () => {
  let reads = 0;
  const result = await followCheckout({ read: async () => { reads++; return { state: "pending", terminal: true }; }, wait: async () => { throw new Error("unexpected wait"); }, cancelled: false });
  assert.deepEqual(result, { kind: "processing" });
  assert.equal(reads, 1);
});
test("pinned checkout status vectors stop polling exactly when the server says terminal", async () => {
  const { readFileSync } = await import("node:fs");
  const vectors = JSON.parse(readFileSync(new URL("../../../../contracts/billing-v2/vectors/checkout-return-v3.json", import.meta.url), "utf8"));
  for (const vector of vectors.statuses.filter((vector: { expected: { status: number } }) => vector.expected.status === 200)) {
    const body = vector.expected.body;
    let reads = 0;
    await followCheckout({ read: async () => { reads++; return body; }, wait: async () => {}, cancelled: vector.return_result === "cancel" });
    assert.equal(reads === 1, body.terminal, vector.name);
  }
});
test("payment preparation keeps polling a non-terminal error until the URL arrives", async () => {
  const { waitForPaymentUrl } = await import("../../src/web/billing-v2-return.ts");
  const url = "https://checkout.stripe.com/c/pay/example";
  let reads = 0;
  const result = await waitForPaymentUrl({ state: "creating", url: null }, async () => ++reads === 1 ? { state: "error", terminal: false, url: null } : { state: "error", terminal: false, url },
    AbortSignal.timeout(20000), () => {});
  assert.equal(result, url);
  assert.equal(reads, 2);
});
test("a terminal payment cannot open a previously available URL", async () => {
  const { waitForPaymentUrl } = await import("../../src/web/billing-v2-return.ts");
  const signal = new AbortController().signal;
  await assert.rejects(
    waitForPaymentUrl({ state: "creating", url: null },
      async () => ({ terminal: true, url: "https://checkout.stripe.com/c/pay/stale" }), signal, () => {}),
    /checkout_finished/,
  );
});

test("payment preparation honors expiry during a pending read", async () => {
  const { waitForPaymentUrl } = await import("../../src/web/billing-v2-return.ts");
  const controller = new AbortController();
  const expired = new DOMException("Payment preparation expired", "TimeoutError");
  const pending = waitForPaymentUrl({ state: "creating", url: null }, async () => {
    controller.abort(expired);
    return { terminal: false, url: "https://checkout.stripe.com/c/pay/too-late" };
  }, controller.signal, () => {});
  await assert.rejects(pending, error => error === expired);
});

test("Stripe checkout and the customer portal accept only their exact HTTPS origins", async () => {
  const { hostedCheckoutUrl } = await import("../../src/web/billing-v2-return.ts");
  const checkout = "https://checkout.stripe.com/c/pay/example";
  const portal = "https://billing.stripe.com/p/session/example";
  assert.equal(hostedCheckoutUrl(checkout), checkout);
  assert.equal(hostedCheckoutUrl(portal, "portal"), portal);
  for (const invalid of [
    "https://example.test/pay",
    "https://checkout.stripe.com.example.test/pay",
    "https://billing.stripe.com.example.test/pay",
    "https://checkout.stripe.com:444/pay",
    "http://checkout.stripe.com/pay",
    "blob:https://checkout.stripe.com/pay",
    "https://someone@checkout.stripe.com/pay",
    portal,
  ]) assert.throws(() => hostedCheckoutUrl(invalid), /invalid_checkout_url/);
  assert.throws(() => hostedCheckoutUrl(checkout, "portal"), /invalid_checkout_url/);
});

test("a timed-out read retries while the payment deadline is open", async () => {
  const { waitForPaymentUrl } = await import("../../src/web/billing-v2-return.ts");
  const signal = AbortSignal.timeout(5000);
  const url = "https://checkout.stripe.com/c/pay/example";
  let reads = 0;
  const result = await waitForPaymentUrl({ state: "creating", url: null }, async () => {
    if (++reads === 1) throw new DOMException("Edge read timed out", "TimeoutError");
    return { terminal: false, url };
  }, signal, () => {});
  assert.equal(result, url);
  assert.equal(reads, 2);
});
