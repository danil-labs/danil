import test from "node:test";
import assert from "node:assert/strict";
import { createAccountReturn } from "../../src/lib/account-add-return.ts";
const group = (id: string, ids: string[]) => ({ context_id: id, org: id, org_name: id.toUpperCase(), available: ids.map((id) => ({ id })), added: new Set(ids) });
test("return waits for attributed added rows and counts once", () => {
  const flow = createAccountReturn(() => {});
  const attempt = flow.begin(["old"]); flow.returned(attempt);
  assert.equal(flow.take([group("old", ["a"]), { ...group("new", ["b", "c"]), available: null }]), null);
  assert.deepEqual(flow.take([group("old", ["a"]), group("new", ["b", "c"])]), { ids: ["b", "c"], organizations: ["NEW"] });
  assert.equal(flow.take([group("new", ["b", "c"])]), null);
});
test("cancellation is silent and a new add replaces the pending result", () => {
  const flow = createAccountReturn(() => {});
  for (const detail of ["cancelled", "access_denied", "expired", "timeout"]) { const attempt = flow.begin([]); flow.failed(attempt, { detail }); assert.equal(flow.state(), null); }
  const old = flow.begin([]); const current = flow.begin(["old"]);
  flow.failed(old, { detail: "network" }); assert.equal(flow.state()?.phase, "pending");
  flow.returned(old); assert.equal(flow.state()?.phase, "pending");
  flow.failed(current, { detail: "network" }); assert.equal(flow.state()?.phase, "error");
});
test("web return restores the public snapshot from this tab", () => {
  const values = new Map<string, string>();
  const store = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  createAccountReturn(() => {}, store).begin(["old"]);
  const flow = createAccountReturn(() => {}, store);
  assert.deepEqual(flow.take([group("new", ["w"])]), { ids: ["w"], organizations: ["NEW"] });
  assert.equal(values.size, 0);
});

test("wrapped cancellation causes stay silent and specific error codes resolve to their message", async () => {
  const flow = createAccountReturn(() => {});
  for (const cause of [
    { code: "cancelled" },
    { error: "cancelled" },
    { what: { clave: "danil.error.cancelled" } },
    "cancelled",
  ]) {
    const attempt = flow.begin([]);
    flow.failed(attempt, cause);
    assert.equal(flow.state(), null);
  }

  const { accountAddErrorBody, canRetryAccountAddError, shouldShowAccountAddError } = await import(
    "../../../../packages/shell/src/shell/account-return-error.ts"
  );
  const catalog: Record<string, string> = {
    "danil.error.too_many_contexts": "Max 20 orgs",
    "danil.error.browser": "Could not open browser",
    "danil.error.unavailable": "Service unavailable",
    "danil.error.timeout": "Timed out",
    "shell.workspaces.add_failed_body": "Check connection",
  };
  const translate = (key: string) => catalog[key] ?? key;

  assert.equal(shouldShowAccountAddError("cancelled"), false);
  assert.equal(shouldShowAccountAddError("browser"), true);
  assert.equal(shouldShowAccountAddError("unavailable"), true);
  assert.equal(shouldShowAccountAddError(undefined), true);

  assert.equal(accountAddErrorBody("browser", translate), "Could not open browser");
  assert.equal(accountAddErrorBody("unavailable", translate), "Service unavailable");
  assert.equal(accountAddErrorBody("timeout", translate), "Timed out");
  assert.equal(accountAddErrorBody("too_many_contexts", translate), "Max 20 orgs");
  assert.equal(accountAddErrorBody("network", translate), "Check connection");
  assert.equal(accountAddErrorBody(undefined, translate), "Check connection");

  assert.equal(canRetryAccountAddError("too_many_contexts"), false);
  assert.equal(canRetryAccountAddError("browser"), true);
  assert.equal(canRetryAccountAddError("unavailable"), true);
});

