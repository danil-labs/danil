import assert from "node:assert/strict";
import test from "node:test";
import { accountPresentation, type Account } from "../src/lib/accounts.ts";

const base = (overrides: Partial<Account> = {}): Account => ({
  id: "acc-1",
  label: "Cuenta 1",
  created_at: 1,
  identity: null,
  authenticated_at: 1,
  ...overrides,
});

test("accountPresentation uses identity over generic numbered label when not custom-labeled", () => {
  const result = accountPresentation(base({ identity: "alberto@danil.ai" }));
  assert.equal(result.name, "alberto@danil.ai");
  assert.equal(result.detail, null);
});

test("accountPresentation prefers custom_label over identity and keeps identity as secondary detail", () => {
  const result = accountPresentation(
    base({ label: "Personal", custom_label: true, identity: "alberto@danil.ai" }),
    { id: "acc-1", authenticated: true, detail: "alberto@danil.ai · Pro" },
  );
  assert.equal(result.name, "Personal");
  assert.equal(result.plan, "Pro");
  assert.equal(result.detail, "alberto@danil.ai");
});

test("accountPresentation omits duplicate detail when custom_label matches identity", () => {
  const result = accountPresentation(
    base({ label: "alberto@danil.ai", custom_label: true, identity: "alberto@danil.ai" }),
  );
  assert.equal(result.name, "alberto@danil.ai");
  assert.equal(result.detail, null);
});

test("accountPresentation keeps custom_label even without identity", () => {
  const result = accountPresentation(
    base({ label: "Trabajo", custom_label: true, identity: null }),
  );
  assert.equal(result.name, "Trabajo");
  assert.equal(result.detail, null);
});
