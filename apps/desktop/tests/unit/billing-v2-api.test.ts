import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { billingV2 } from "../../src/web/billing-v2-api.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/billing-v2/${name}.json`, import.meta.url), "utf8")).value;

test("reads catalog and balance using the edge and verifies the organization", async () => {
  const calls: string[] = [];
  const api = billingV2({
    call: async (path) => { calls.push(path); return Response.json(fixture(path.endsWith("catalog") ? "catalog.synthetic" : "balance.with-debt")); },
    mutation: async () => { throw new Error("unexpected mutation"); },
  }, "org_01SYNTHETICORGA");
  assert.equal((await api.catalog()).catalog_version, 3);
  assert.equal((await api.balance()).available.amount_micro, "100000000");
  assert.deepEqual(calls, ["billing/catalog", "credits/balance"]);
});

test("rejects a balance belonging to another organization", async () => {
  const api = billingV2({ call: async () => Response.json(fixture("balance.with-debt")), mutation: async () => { throw new Error("unexpected mutation"); } }, "org_other");
  await assert.rejects(api.balance());
});

test("checkout uses the contract body and caller's idempotency key", async () => {
  const calls: { path: string; init?: RequestInit }[] = [];
  const api = billingV2({ call: async () => { throw new Error("unexpected read"); }, mutation: async (path, init) => { calls.push({ path, init }); return Response.json(fixture("checkout.created")); } }, "org_01SYNTHETICORGA");
  assert.equal((await api.checkout("pro", 3, "attempt-1")).state, "open");
  assert.equal(calls[0].path, "billing/checkout-sessions");
  assert.equal((calls[0].init?.headers as Record<string, string>)["Idempotency-Key"], "attempt-1");
  assert.deepEqual(JSON.parse(calls[0].init?.body as string), { plan_key: "pro", catalog_version: 3 });
});
