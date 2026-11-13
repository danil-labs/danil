import assert from "node:assert/strict";
import test from "node:test";
import { workspaceSelection } from "../../src/web/workspace-selection.ts";
import { PlatformSessionError } from "../../src/web/platform-session.ts";

test("lost A response is reconciled before B; returning to A is a new intention", async () => {
  let actual = "11";
  let lost = true;
  let authorityDown = true;
  let sequence = 0;
  const receipts = new Map<string, string>();
  const writes: { id: string; key: string }[] = [];
  const selection = workspaceSelection({
    async active() { if (authorityDown) throw new Error("unavailable"); return actual; },
    async select(id: string, key: string) {
      writes.push({ id, key });
      if (!receipts.has(key)) { actual = id; receipts.set(key, id); }
      if (lost) { lost = false; throw new Error("response lost after commit"); }
      return { workspace: receipts.get(key) };
    },
  }, () => `intent-${++sequence}`);
  await assert.rejects(selection.choose("12"));
  assert.equal(selection.uncertain(), true);
  assert.equal(selection.active(), null);
  await assert.rejects(selection.choose("11"));
  assert.equal(writes.some(w => w.id === "11"), false, "B cannot run while A is unresolved");
  authorityDown = false;
  await selection.choose("11");
  assert.equal(actual, "11");
  await selection.choose("12");
  assert.equal(actual, "12");
  assert.equal(selection.active(), "12");
  const aKeys = writes.filter(w => w.id === "12").map(w => w.key);
  assert.equal(aKeys[0], aKeys[1], "retry resolves the old operation");
  assert.notEqual(aKeys[0], aKeys.at(-1), "the later A is a new operation");
});

test("receipt success never overrides the real active workspace", async () => {
  const selection = workspaceSelection({ active: async () => "99", select: async () => ({ workspace: "12" }) });
  await selection.choose("12");
  assert.equal(selection.active(), "99");
});

test("a rejected retry stays blocked until the real context can be read", async () => {
  let down = true;
  const selection = workspaceSelection({
    active: async () => { if (down) throw new Error("authority unavailable"); return "11"; },
    select: async () => { throw new PlatformSessionError(403, null); },
  });
  await assert.rejects(selection.choose("12"));
  assert.equal(selection.uncertain(), true);
  down = false;
  await assert.rejects(selection.reconcile());
  assert.equal(selection.active(), "11");
  assert.equal(selection.uncertain(), false);
});


test("startup reconciles the already authenticated profile without rereading me", async () => {
  let reads = 0;
  const selection = workspaceSelection({ active: async () => { reads++; return "99"; }, select: async () => ({}) });
  await selection.reconcile({ workspace: "11" });
  assert.equal(selection.active(), "11");
  assert.equal(reads, 0);
  await selection.choose("12");
  assert.equal(selection.active(), "99", "a mutation still rereads the authoritative context");
  assert.equal(reads, 1);
});

test("an initial profile cannot settle a selection whose response was lost", async () => {
  const selection = workspaceSelection({ active: async () => "12", select: async () => { throw new Error("offline"); } });
  await assert.rejects(selection.choose("12"));
  await assert.rejects(selection.reconcile({ workspace: "11" }));
  assert.equal(selection.uncertain(), true);
});
