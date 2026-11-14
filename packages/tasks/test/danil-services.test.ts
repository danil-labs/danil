import assert from "node:assert/strict";
import test from "node:test";
import { DANIL_CREDITS_MODEL, FREE_ROUTER_MODEL, creditsBalanceState, danilServiceOf } from "../src/index.ts";

test("only the two Danil service ids are presented as services", () => {
  assert.equal(DANIL_CREDITS_MODEL, "danil-credits/deepseek/deepseek-v4.1-flash");
  assert.equal(danilServiceOf(DANIL_CREDITS_MODEL), "credits");
  assert.equal(danilServiceOf(FREE_ROUTER_MODEL), "router");
  assert.equal(danilServiceOf("reflection/beam-free"), null, "a bare upstream id is not the router route");
  assert.equal(danilServiceOf("opencode-go/kimi"), null);
  assert.equal(danilServiceOf(null), null);
  assert.equal(danilServiceOf(undefined), null);
});

test("an unknown balance is unavailable, never zero", () => {
  assert.deepEqual(creditsBalanceState(undefined), { kind: "loading" });
  assert.deepEqual(creditsBalanceState(null), { kind: "unavailable" });
  assert.deepEqual(creditsBalanceState(Number.NaN), { kind: "unavailable" });
  assert.deepEqual(creditsBalanceState(0), { kind: "amount", count: 0 });
  assert.deepEqual(creditsBalanceState(42), { kind: "amount", count: 42 });
});
