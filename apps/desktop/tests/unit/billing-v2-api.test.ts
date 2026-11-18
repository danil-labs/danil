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
  assert.equal((await api.checkoutStatus("bchk_01SYNTHETICCHK0001")).organization_id, "org_ABC123");
  value = { ...value, state: "pending", terminal: false };
  await assert.rejects(api.checkoutStatus("bchk_01SYNTHETICCHK0001"));
  value = { ...value, kind: "credits", state: "active", terminal: true };
  await assert.rejects(api.checkoutStatus("bchk_01SYNTHETICCHK0001"));
});

test("history requests preserve the server cursor for both collections", async () => {
  const paths: string[] = [];
  const api = billingV2({ call: async path => { paths.push(path); return Response.json({ items: [], next_cursor: null }); }, mutation: async () => { throw new Error("unexpected mutation"); } }, "org_A");
  await api.transactions("next_page");
  await api.invoices("invoice_next");
  assert.deepEqual(paths, ["credits/transactions?cursor=next_page", "billing/invoices?cursor=invoice_next"]);
});
