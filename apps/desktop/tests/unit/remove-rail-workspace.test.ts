import assert from "node:assert/strict";
import { test } from "node:test";
import { removeRailWorkspace } from "../../../../packages/shell/src/shell/remove-rail-workspace.ts";

test("removal forgets view preferences and revokes only the selected workspace, keeping the context for a hidden sibling", async () => {
  const added = new Set(["visible", "hidden"]);
  const views = new Set(added);
  const revoked: string[] = [];
  const closed: string[] = [];
  const work = new Map([["visible", { tasks: ["task"], files: ["report.txt"], worktrees: ["branch"] }]]);
  const remove = (workspace: string) => removeRailWorkspace({
    workspace, context: "context-a", added,
    revoke: async (context, id) => { assert.equal(context, "context-a"); revoked.push(id); return "revoked"; },
    removeAdded: async (id) => { added.delete(id); },
    forgetView: async () => { views.delete(workspace); },
    closeContext: async (context) => { closed.push(context); },
  });
  await remove("visible");
  assert.deepEqual([...added], ["hidden"]);
  assert.deepEqual([...views], ["hidden"]);
  assert.deepEqual(revoked, ["visible"]);
  assert.deepEqual(closed, []);
  assert.deepEqual(work.get("visible"), { tasks: ["task"], files: ["report.txt"], worktrees: ["branch"] });
  await remove("hidden");
  assert.deepEqual([...added], []);
  assert.deepEqual(revoked, ["visible", "hidden"]);
  assert.deepEqual(closed, ["context-a"]);
});

test("an unavailable revocation port reports the limitation and still clears the rail", async () => {
  const added = new Set(["one"]);
  const result = await removeRailWorkspace({
    context: "context-a", workspace: "one", added,
    removeAdded: async (id) => { added.delete(id); },
    forgetView: async () => {}, closeContext: async () => {},
  });
  assert.equal(result, "unavailable");
  assert.deepEqual([...added], []);
});
