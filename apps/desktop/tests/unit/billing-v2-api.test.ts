import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { billingV2 } from "../../src/platform/treasury.ts";

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
  assert.deepEqual(JSON.parse(calls[0].init?.body as string), fixture("checkout.create.request"));
});

test("organization creation uses the person checkout and normalizes the name", async () => {
  let body = "";
  const api = billingV2({ call: async () => { throw new Error("unexpected read"); }, mutation: async (_path, init) => { body = String(init?.body); return Response.json(fixture("checkout.created")); } }, null);
  await api.createOrganization("pro", 3, "  Cafe\u0301 Danil  ", "attempt-2");
  assert.deepEqual(JSON.parse(body), fixture("checkout.create.new-organization.request"));
  await assert.rejects(api.createOrganization("pro", 3, "test\n", "attempt-3"));
  await assert.rejects(api.createOrganization("pro", 3, "   ", "attempt-4"));
  await assert.rejects(api.createOrganization("pro", 3, "<bad>", "attempt-5"));
});

test("checkout status uses the durable public shape", async () => {
  const api = billingV2({ call: async () => Response.json(fixture("checkout.status.paid")), mutation: async () => { throw new Error("unexpected mutation"); } }, null);
  const status = await api.checkoutStatus("bchk_01SYNTHETICCHK0001");
  assert.equal(status.state, "paid");
  assert.equal(status.terminal, false);
  await assert.rejects(api.checkoutStatus("bchk_OTHER000000000000"));
});

test("only an active plan exposes a valid organization, and active requires one", async () => {
  let value: Record<string, unknown> = { ...fixture("checkout.status.paid"), state: "active", terminal: true };
  const api = billingV2({ call: async () => Response.json(value), mutation: async () => { throw new Error("unexpected mutation"); } }, null);
  await assert.rejects(api.checkoutStatus("bchk_01SYNTHETICCHK0001"));
  value = { ...value, organization_id: "org_ABC123" };
  const active = await api.checkoutStatus("bchk_01SYNTHETICCHK0001");
  assert.equal(active.state === "active" ? active.organization_id : null, "org_ABC123");
  value = { ...value, state: "pending", terminal: false };
  await assert.rejects(api.checkoutStatus("bchk_01SYNTHETICCHK0001"));
  value = { ...value, state: "paid", terminal: true };
  await assert.rejects(api.checkoutStatus("bchk_01SYNTHETICCHK0001"));
  value = { ...value, kind: "credits", state: "active", terminal: true };
  await assert.rejects(api.checkoutStatus("bchk_01SYNTHETICCHK0001"));
  value = { ...value, kind: "plan", state: "active", terminal: false };
  await assert.rejects(api.checkoutStatus("bchk_01SYNTHETICCHK0001"));
});

test("checkout status ignores unknown fields in both variants", async () => {
  let value: Record<string, unknown> = {};
  const api = billingV2({ call: async () => Response.json(value), mutation: async () => { throw new Error("unexpected mutation"); } }, null);
  for (const known of [fixture("checkout.status.paid"), { ...fixture("checkout.status.paid"), state: "active", terminal: true, organization_id: "org_ABC123" }]) {
    value = { ...known, unexpected: true };
    const status = await api.checkoutStatus("bchk_01SYNTHETICCHK0001");
    assert.deepEqual(status, known);
    assert.equal("unexpected" in status, false);
  }
});

test("checkout status reads a Stripe url and an expiry as sent in both variants", async () => {
  let value: Record<string, unknown> = {};
  const api = billingV2({ call: async () => Response.json(value), mutation: async () => { throw new Error("unexpected mutation"); } }, null);
  const live = { url: "https://checkout.stripe.com/c/pay/cs_test_SYNTHETIC0001", expires_at: "2026-11-21T18:30:00Z" };
  for (const known of [{ ...fixture("checkout.status.paid"), state: "pending", ...live }, { ...fixture("checkout.status.paid"), state: "active", terminal: true, organization_id: "org_ABC123", ...live }]) {
    value = known;
    const status = await api.checkoutStatus("bchk_01SYNTHETICCHK0001");
    assert.deepEqual(status, known);
    assert.equal(status.url, live.url);
    assert.equal(status.expires_at, live.expires_at);
  }
});

test("checkout status keeps the server's terminal flag for every non-active state", async () => {
  let value: Record<string, unknown> = {};
  const api = billingV2({ call: async () => Response.json(value), mutation: async () => { throw new Error("unexpected mutation"); } }, null);
  for (const [state, terminal] of [["error", false], ["pending", true]] as const) {
    value = { ...fixture("checkout.status.paid"), state, terminal };
    assert.deepEqual(await api.checkoutStatus("bchk_01SYNTHETICCHK0001"), value);
  }
});

test("every pinned checkout status vector is accepted as the server sent it", async () => {
  const vectors = JSON.parse(readFileSync(new URL("../../../../contracts/billing-v2/vectors/checkout-return-v3.json", import.meta.url), "utf8"));
  const bodies = vectors.statuses.filter((vector: { expected: { status: number } }) => vector.expected.status === 200).map((vector: { expected: { body: unknown } }) => vector.expected.body);
  let value: unknown;
  const api = billingV2({ call: async () => Response.json(value), mutation: async () => { throw new Error("unexpected mutation"); } }, null);
  assert.ok(bodies.length > 0);
  for (const body of bodies) {
    value = body;
    assert.deepEqual(await api.checkoutStatus(vectors.checkout_id), body);
  }
});

test("credit transaction history preserves the server cursor", async () => {
  const paths: string[] = [];
  const api = billingV2({ call: async path => { paths.push(path); return Response.json({ items: [], next_cursor: null }); }, mutation: async () => { throw new Error("unexpected mutation"); } }, "org_A");
  await api.transactions("next_page");
  assert.deepEqual(paths, ["credits/transactions?cursor=next_page"]);
});

test("Plan cards omit advertised editions and Team requests an upgrade", async () => {
  const { checkoutPlans } = await import("../../src/web/billing-v2-plans.ts");
  const value = fixture("catalog.synthetic");
  const requests: unknown[] = [];
  const api = billingV2({
    call: async () => Response.json(value),
    mutation: async (_path, init) => { requests.push(JSON.parse(String(init?.body))); return Response.json(fixture("checkout.created")); },
  }, null);
  const legacy = checkoutPlans(await api.catalog());
  assert.ok(legacy.find(plan => plan.id === "pro")?.price?.amount_micro);
  assert.equal(legacy.find(plan => plan.id === "team")?.price, null);
  assert.equal(legacy.find(plan => plan.id === "enterprise")?.choice, null);
  assert.equal(legacy.some(plan => plan.id === "business"), false);
  assert.equal(legacy.find(plan => plan.id === "team")?.choice, null);
  value.plans = value.plans.map((plan: { plan_key: string }) => plan.plan_key === "team"
    ? { ...plan, sellable: true, price: { currency: "MXN", amount_micro: "1999000000" }, display_variants: [{ variant: "business", plan_key: "team", edition: "business", display_name: "Business" }] }
    : plan);
  const cards = checkoutPlans(await api.catalog());
  assert.deepEqual(cards.map(plan => plan.id), ["free", "pro", "team", "enterprise"]);
  assert.equal(cards.find(plan => plan.id === "free")?.choice, null);
  const team = cards.find(plan => plan.id === "team")?.choice;
  assert.deepEqual(team, { plan_key: "team" });
  await api.checkout(team!.plan_key, 3, "upgrade", team!.variant);
  assert.deepEqual(requests, [{ plan_key: "team", catalog_version: 3, intent: "upgrade" }]);
});

test("credits and customer portal carry idempotency keys on their edge routes", async () => {
  const calls: unknown[] = [];
  const api = billingV2({
    call: async () => { throw new Error("unexpected read"); },
    mutation: async (path, init) => {
      calls.push([path, new Headers(init?.headers).get("Idempotency-Key"), init?.body]);
      return Response.json({ purchase_id: "purchase", state: "open", url: "https://billing.stripe.com/" });
    },
  }, "org_A");
  const request = fixture("purchase.create.request");
  await api.purchase(request.pack_id, request.catalog_version, "credits-key");
  await api.portal("portal-key");
  assert.deepEqual(calls, [
    ["credits/purchases", "credits-key", JSON.stringify(request)],
    ["billing/portal-sessions", "portal-key", undefined],
  ]);
});


test("only explicit promotion codes are sent for both checkout intents", async () => {
  const bodies: Record<string, unknown>[] = [];
  const api = billingV2({
    call: async () => { throw new Error("unexpected read"); },
    mutation: async (_path, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json(fixture("checkout.created"));
    },
  }, null);
  await api.checkout("team", 3, "upgrade", "business", "DANIL1MES");
  await api.createOrganization("team", 3, "Org", "new", "business", "DANIL1MES");
  await api.checkout("team", 3, "no-code");
  assert.deepEqual(bodies.map(body => body.promotion_code), ["DANIL1MES", "DANIL1MES", undefined]);
  assert.deepEqual(bodies.map(body => body.intent), ["upgrade", "new_organization", "upgrade"]);
});

test("both checkout intents reject malformed promotion codes before contacting treasury", async () => {
  let writes = 0;
  const api = billingV2({
    call: async () => { throw new Error("unexpected read"); },
    mutation: async () => { writes++; return Response.json(fixture("checkout.created")); },
  }, null);
  for (const code of ["", "contains a space", "A".repeat(65), "DÁNIL", "DANIL\n"]) {
    await assert.rejects(api.checkout("pro", 3, "upgrade", undefined, code), /promotion_code_invalid/);
    await assert.rejects(api.createOrganization("team", 3, "Org", "new", undefined, code), /promotion_code_invalid/);
  }
  assert.equal(writes, 0);
  const valid = "Aa0_-".padEnd(64, "A");
  await api.checkout("pro", 3, "upgrade", undefined, valid);
  await api.createOrganization("team", 3, "Org", "new", undefined, valid);
  assert.equal(writes, 2);
});

test("a durable purchase is read by its purchase ID and shares the caller's deadline", async () => {
  const purchase = {
    purchase_id: "bpur_01SYNTHETICPURCHASE1", checkout_id: "bchk_01SYNTHETICCHK0001",
    state: "open", url: "https://checkout.stripe.com/c/pay/synthetic", expires_at: null,
    credits: { currency: "MXN", amount_micro: "1000000" },
  };
  const deadline = AbortSignal.timeout(5000);
  const api = billingV2({
    call: async (path, init) => {
      assert.equal(path, `credits/purchases/${purchase.purchase_id}`);
      assert.equal(init?.signal, deadline);
      return Response.json(purchase);
    },
    mutation: async () => { throw new Error("unexpected write"); },
  }, "org_A");
  assert.equal((await api.purchaseStatus(purchase.purchase_id, deadline)).url, purchase.url);
});
