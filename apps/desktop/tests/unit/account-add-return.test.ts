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
