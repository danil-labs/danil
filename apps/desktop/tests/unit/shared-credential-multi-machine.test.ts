/**
 * Multi-machine `shared_credential` rules in `mergeAccounts`:
 * a single-account limit on one machine must never block adding an account
 * on another machine that has 0 accounts or does not share credentials.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { merge, type MergeContext, type Slice } from "../../../../packages/features/machines/src/model/fleet/index.ts";

const REASON = "Antigravity guarda una sola sesión en esta computadora.";

const ctx: MergeContext = {
  self: "cmp_mac",
  on: () => true,
  order: ["cmp_mac", "cmp_vm"],
  registry: null,
  name: (m) => (m === "cmp_mac" ? "Mac" : "Nube"),
};

function slice(machine: string, shared_credential: string | null, accounts: { id: string; label: string; created_at: number; identity?: string | null; authenticated_at?: number | null }[]): Slice {
  return {
    machine,
    has: true,
    status: "ok",
    at: 1,
    value: {
      provider: "antigravity",
      env_var: "",
      shared_credential,
      secret_note: null,
      active: accounts[0]?.id ?? null,
      accounts: accounts.map((a) => ({ identity: null, authenticated_at: 1, ...a })),
    },
  };
}

test("mergeAccounts: 1 machine with shared_credential and 1 account preserves shared_credential as-is", () => {
  const out = merge(ctx, "list_accounts", [
    slice("cmp_mac", REASON, [{ id: "a1", label: "Cuenta 1", created_at: 1, identity: "ana@danil.ai" }]),
  ]) as { shared_credential: string | null; shared_credential_by_machine?: Record<string, string>; accounts: unknown[] };

  assert.equal(out.shared_credential, REASON);
  assert.equal(out.shared_credential_by_machine, undefined);
  assert.equal(out.accounts.length, 1);
});

test("mergeAccounts: local Mac shared_credential + 1 account, cloud VM shared_credential null + 0 accounts -> shared_credential is null", () => {
  const out = merge(ctx, "list_accounts", [
    slice("cmp_mac", REASON, [{ id: "a1", label: "Cuenta 1", created_at: 1, identity: "ana@danil.ai" }]),
    slice("cmp_vm", null, []),
  ]) as { shared_credential: string | null; shared_credential_by_machine?: Record<string, string>; accounts: unknown[] };

  assert.equal(out.shared_credential, null);
  assert.deepEqual(out.shared_credential_by_machine, { cmp_mac: REASON });
  assert.equal(out.accounts.length, 1);
});

test("mergeAccounts: both report shared_credential, local Mac has 1 account and cloud VM has 0 -> shared_credential is null", () => {
  const out = merge(ctx, "list_accounts", [
    slice("cmp_mac", REASON, [{ id: "a1", label: "Cuenta 1", created_at: 1, identity: "ana@danil.ai" }]),
    slice("cmp_vm", REASON, []),
  ]) as { shared_credential: string | null; shared_credential_by_machine?: Record<string, string>; accounts: unknown[] };

  assert.equal(out.shared_credential, null);
  assert.deepEqual(out.shared_credential_by_machine, { cmp_mac: REASON });
  assert.equal(out.accounts.length, 1);
});

test("mergeAccounts: both report shared_credential and both have 1 account -> preserves shared_credential", () => {
  const out = merge(ctx, "list_accounts", [
    slice("cmp_mac", REASON, [{ id: "a1", label: "Cuenta 1", created_at: 1, identity: "ana@danil.ai" }]),
    slice("cmp_vm", REASON, [{ id: "b1", label: "Cuenta 1", created_at: 2, identity: "ana@danil.ai" }]),
  ]) as { shared_credential: string | null; shared_credential_by_machine?: Record<string, string>; accounts: unknown[] };

  assert.equal(out.shared_credential, REASON);
  assert.deepEqual(out.shared_credential_by_machine, { cmp_mac: REASON, cmp_vm: REASON });
});
