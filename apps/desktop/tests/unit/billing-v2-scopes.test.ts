import { strict as assert } from "node:assert";
import { test } from "node:test";
import { billingScopes } from "../../src/web/billing-v2-scopes.ts";

test("owner can read and manage billing, cancel and use credits", () => {
  assert.deepEqual(billingScopes("owner"), ["billing.read", "billing.manage", "billing.subscription.cancel", "credits.read", "credits.purchase"]);
});

test("admin can manage billing and credits but cannot cancel", () => {
  assert.deepEqual(billingScopes("admin"), ["billing.read", "billing.manage", "credits.read", "credits.purchase"]);
});

test("member can only read credits", () => {
  assert.deepEqual(billingScopes("member"), ["credits.read"]);
});

test("unknown roles get no scopes", () => {
  assert.deepEqual(billingScopes("unknown"), []);
});
