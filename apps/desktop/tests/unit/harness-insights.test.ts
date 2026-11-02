import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type ActivityEvent,
  actionOf,
  aggregateTools,
  clientOf,
  failureKey,
  filterActivity,
  isForbidden,
  isMcp,
  tokens,
} from "../../src/features/settings/harness-insights.ts";

const event = (over: Partial<ActivityEvent>): ActivityEvent => ({
  id: "1",
  at: "2026-11-02T06:00:00.000Z",
  actor: "1",
  workspace: "ws1",
  machine: { id: "cmp_aaaaaaaaaaaaaaaaaaaaaaaaaa", name: "Machine", origin: "vm" },
  origin: "vm",
  kind: "tool",
  action: "tool.summary",
  result: "ok",
  client: null,
  service: "engine",
  target: null,
  detail: null,
  ...over,
});

test("MCP is what the server marked, not what the action name looks like", () => {
  const mcp = event({ kind: "mcp", action: "task_create", client: "Claude" });
  const tool = event({ action: "task_create" });
  assert.equal(isMcp(mcp), true);
  assert.equal(isMcp(tool), false);
  assert.equal(actionOf(mcp), "task_create");
  assert.equal(clientOf(mcp), "Claude");
  assert.equal(clientOf(tool), "");
});

test("the activity filter keeps only what it promises", () => {
  const rows = [
    event({ id: "1", kind: "mcp", client: "Claude" }),
    event({ id: "2", result: "denied" }),
    event({ id: "3", result: "error" }),
  ];
  assert.deepEqual(filterActivity(rows, "all").map((row) => row.id), ["1", "2", "3"]);
  assert.deepEqual(filterActivity(rows, "mcp").map((row) => row.id), ["1"]);
  assert.deepEqual(filterActivity(rows, "denied").map((row) => row.id), ["2"]);
});

test("tools add up across people without losing the errors", () => {
  const rows = aggregateTools([
    { user_id: "a", name: "Bash", calls: 3, failed: 1, unknown: 0 },
    { user_id: "b", name: "Bash", calls: 2, failed: 0, unknown: 1 },
    { user_id: "a", name: "Edit", calls: 1, failed: 0, unknown: 0 },
  ]);
  assert.deepEqual(rows, [
    { name: "Bash", calls: 5, failed: 1, unknown: 1 },
    { name: "Edit", calls: 1, failed: 0, unknown: 0 },
  ]);
});

test("tokens are the sum of the five counters", () => {
  assert.equal(tokens({ input_uncached: 1, cache_read: 2, cache_write: 3, output: 4, reasoning: 5 }), 15);
  assert.equal(tokens(null), 0);
});

test("a role that cannot read is told apart from a server that is unavailable", () => {
  assert.equal(failureKey({ what: { clave: "harness.admin.forbidden" }, detail: "HTTP 403" }), "harness.admin.forbidden");
  assert.equal(isForbidden({ what: { clave: "harness.admin.forbidden" } }), true);
  assert.equal(isForbidden({ what: { clave: "harness.admin.unavailable" } }), false);
  assert.equal(isForbidden("HTTP 403"), false);
});
