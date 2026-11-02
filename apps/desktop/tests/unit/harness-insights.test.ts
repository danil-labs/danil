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
  isUnsupported,
  tokens,
} from "../../src/features/settings/harness-insights.ts";

const event = (over: Partial<ActivityEvent>): ActivityEvent => ({
  id: 1,
  at: 1,
  actor: "alice",
  workspace: "one",
  action: "tools/call",
  decision: "allow",
  revision: "r1",
  target: "",
  detail: null,
  ...over,
});

test("MCP is what the server marked, not what the action name looks like", () => {
  const mcp = event({ detail: { channel: "mcp", tool: "github_read_file", client: "codex-cli/0.166.0" } });
  const read = event({ action: "github_read_file" });
  assert.equal(isMcp(mcp), true);
  assert.equal(isMcp(read), false);
  assert.equal(actionOf(mcp), "github_read_file");
  assert.equal(actionOf(read), "github_read_file");
  assert.equal(clientOf(mcp), "codex-cli/0.166.0");
  assert.equal(clientOf(read), "");
});

test("the activity filter keeps only what it promises", () => {
  const rows = [
    event({ id: 1, detail: { channel: "mcp" } }),
    event({ id: 2, decision: "deny" }),
    event({ id: 3 }),
  ];
  assert.deepEqual(filterActivity(rows, "all").map((row) => row.id), [1, 2, 3]);
  assert.deepEqual(filterActivity(rows, "mcp").map((row) => row.id), [1]);
  assert.deepEqual(filterActivity(rows, "denied").map((row) => row.id), [2]);
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

test("an engine that does not know the command is not the same as a server failure", () => {
  assert.equal(isUnsupported({ what: "service.error.command", detail: "command" }), true);
  assert.equal(isUnsupported({ what: { clave: "harness.admin.failed" }, detail: "command" }), true);
  assert.equal(isUnsupported({ what: { clave: "radiant.error.unreachable" }, detail: "connection_failed" }), false);
});
