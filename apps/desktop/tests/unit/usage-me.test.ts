import assert from "node:assert/strict";
import { test } from "node:test";
import {
  costCoverage,
  isEmptyUsage,
  originKind,
  peakOf,
  planKind,
  readUsageMe,
  tokensTotal,
  type UsageMe,
  type UsageTotals,
} from "../../src/features/settings/usage-me.ts";

const tokens = (over: Partial<UsageTotals["tokens"]> = {}): UsageTotals["tokens"] => ({
  input_uncached: 1,
  cache_read: 2,
  cache_write: 3,
  output: 4,
  reasoning: 5,
  ...over,
});

const totals = (over: Partial<UsageTotals> = {}): UsageTotals => ({
  turns: 10,
  sessions: 3,
  duration_ms: 1_000,
  measured_turns: 8,
  turns_without_cost: 2,
  tokens: tokens(),
  cost_usd: 1.5,
  ...over,
});

const payload = (over: Record<string, unknown> = {}) => ({
  account_id: 7,
  plan: { key: "teams", source: "subscription", paid: true },
  window: { days: 30, since: "2026-10-06", until: "2026-11-04" },
  totals: totals(),
  daily: [{ ...totals(), date: "2026-11-04" }],
  models: [{ ...totals(), agent: "claude", model: null }],
  machines: [{ ...totals(), machine_id: "cmp_x", origin: "vm" }],
  truncated: false,
  ...over,
});

test("the server's nulls and measured zeros survive the read", () => {
  const report = readUsageMe(payload({
    plan: { key: null, source: "none", paid: false },
    totals: totals({ cost_usd: null, tokens: tokens({ output: 0 }) }),
  }));
  assert.equal(report.plan.key, null);
  assert.equal(report.plan.paid, false);
  assert.equal(report.totals.cost_usd, null);
  assert.equal(report.totals.tokens.output, 0);
  assert.equal(report.models[0].model, null);
  assert.equal(report.daily.length, 1);
  assert.equal(report.truncated, false);
  assert.equal(readUsageMe(payload({ truncated: true })).truncated, true);
});

test("a missing field is an error, not a zero", () => {
  const missing = payload({
    totals: { ...totals(), tokens: { input_uncached: 1, cache_read: 2, cache_write: 3, output: 4 } },
  });
  assert.throws(() => readUsageMe(missing), /invalid_response/);
  assert.throws(() => readUsageMe(payload({ daily: {} })), /invalid_response/);
  assert.throws(() => readUsageMe(payload({ truncated: "no" })), /invalid_response/);
});

test("tokens are the sum of the five counters", () => {
  assert.equal(tokensTotal(tokens()), 15);
  assert.equal(tokensTotal(tokens({ input_uncached: 0, cache_read: 0, cache_write: 0, output: 0, reasoning: 0 })), 0);
});

test("a period with only measured zeros is empty", () => {
  const zero = totals({
    turns: 0,
    sessions: 0,
    measured_turns: 0,
    turns_without_cost: 0,
    cost_usd: null,
    tokens: tokens({ input_uncached: 0, cache_read: 0, cache_write: 0, output: 0, reasoning: 0 }),
  });
  const empty: UsageMe = readUsageMe(payload({
    totals: zero,
    daily: Array.from({ length: 30 }, (_, i) => ({ ...zero, date: `2026-10-${String(i + 1).padStart(2, "0")}` })),
    models: [],
    machines: [],
  }));
  assert.equal(isEmptyUsage(empty), true);
  assert.equal(isEmptyUsage(readUsageMe(payload())), false);
});

test("cost coverage says how many turns it measured and how many it did not", () => {
  assert.deepEqual(costCoverage(totals()), { measured: 8, turns: 10, withoutCost: 2, complete: false });
  assert.deepEqual(costCoverage(totals({ measured_turns: 10, turns_without_cost: 0 })), { measured: 10, turns: 10, withoutCost: 0, complete: true });
  assert.equal(costCoverage(totals({ turns: 0, measured_turns: 0, turns_without_cost: 0 })).complete, false);
});

test("the plan is named only when the server names it", () => {
  assert.equal(planKind({ key: "personal", source: "none", paid: false }), "personal");
  assert.equal(planKind({ key: "Teams", source: "manual", paid: false }), "teams");
  assert.equal(planKind({ key: "enterprise-annual", source: "subscription", paid: true }), "enterprise");
  assert.equal(planKind({ key: null, source: "none", paid: false }), "none");
  assert.equal(planKind({ key: "free", source: "none", paid: false }), "other");
});

test("an origin the contract does not name is not guessed", () => {
  assert.equal(originKind("local"), "local");
  assert.equal(originKind("vm"), "vm");
  assert.equal(originKind("shared"), "shared");
  assert.equal(originKind("relay"), "other");
});

test("the peak is the day with the most tokens, or the first when everything is zero", () => {
  const day = (date: string, output: number) => ({ ...totals({ tokens: tokens({ output, input_uncached: 0, cache_read: 0, cache_write: 0, reasoning: 0 }) }), date });
  assert.deepEqual(peakOf([day("2026-11-01", 0), day("2026-11-02", 9), day("2026-11-03", 2)]), { date: "2026-11-02", tokens: 9 });
  assert.deepEqual(peakOf([day("2026-11-01", 0), day("2026-11-02", 0)]), { date: "2026-11-01", tokens: 0 });
  assert.deepEqual(peakOf([]), { date: "", tokens: 0 });
});
