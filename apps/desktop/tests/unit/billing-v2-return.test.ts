import { strict as assert } from "node:assert";
import { test } from "node:test";
import { checkoutReturn, followCheckout } from "../../src/web/billing-v2-return.ts";

const id = "bchk_01SYNTHETICCHK0001";
test("the return URL supplies the treasury id and removes both parameters", () => {
  assert.deepEqual(checkoutReturn(`https://beta.danil.ai/?settings=plan&checkout=${id}&result=success`), { id, cancelled: false, clean: "https://beta.danil.ai/?settings=plan" });
});
test("success is confirmed by checkout and active organization, not by the URL", async () => {
  let reads = 0;
  const value = await followCheckout({ read: async () => { reads++; return reads === 1 ? "open" : "completed"; }, active: async () => true, wait: async () => {}, cancelled: false });
  assert.equal(value, "active");
  assert.equal(reads, 2);
});
test("cancel return reads only once", async () => {
  let reads = 0;
  const value = await followCheckout({ read: async () => { reads++; return "open"; }, active: async () => false, wait: async () => {}, cancelled: true });
  assert.equal(value, "cancelled");
  assert.equal(reads, 1);
});
test("foreign checkout errors remain errors", async () => {
  for (const status of [403, 404]) {
    const error = Object.assign(new Error("foreign"), { status });
    await assert.rejects(followCheckout({ read: async () => { throw error; }, active: async () => false, wait: async () => {}, cancelled: false }), error);
  }
});
test("a slow checkout stops at its retry budget and reports processing", async () => {
  let elapsed = 0;
  const value = await followCheckout({ read: async () => "open", active: async () => false, wait: async ms => { elapsed += ms; }, cancelled: false });
  assert.equal(value, "processing");
  assert.equal(elapsed, 60000);
});
test("a completed checkout does not claim activation before organization is active", async () => {
  const value = await followCheckout({ read: async () => "completed", active: async () => false, wait: async () => {}, cancelled: false });
  assert.equal(value, "processing");
});
test("transient unavailability is retried within the budget", async () => {
  let reads = 0;
  const value = await followCheckout({ read: async () => { if (++reads === 1) throw Object.assign(new Error("unavailable"), { status: 503 }); return "completed"; }, active: async () => true, wait: async () => {}, cancelled: false });
  assert.equal(value, "active");
  assert.equal(reads, 2);
});
