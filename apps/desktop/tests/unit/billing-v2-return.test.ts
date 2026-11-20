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
