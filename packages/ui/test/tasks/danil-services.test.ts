import assert from "node:assert/strict";
import test from "node:test";
import { DANIL_CREDITS_MODEL, DANIL_CREDITS_TIERS, FREE_ROUTER_MODEL, creditsBalanceState, danilCreditsTierLabel, danilServiceOf, isDanilCreditsModel } from "../../src/lib/tasks/index.ts";

test("only the canonical Danil Credits tiers and Free Router are presented as services", () => {
  assert.equal(DANIL_CREDITS_MODEL, "danil-credits/danil/equilibrado");
  assert.deepEqual(DANIL_CREDITS_TIERS, [
    "danil-credits/danil/ligero",
    "danil-credits/danil/equilibrado",
    "danil-credits/danil/avanzado",
  ]);
  assert.equal(danilCreditsTierLabel("danil-credits/danil/ligero"), "Ligero");
  assert.equal(danilCreditsTierLabel("danil-credits/danil/equilibrado"), "Equilibrado");
  assert.equal(danilCreditsTierLabel("danil-credits/danil/avanzado"), "Avanzado");
  assert.equal(danilCreditsTierLabel("opencode-go/kimi"), null);
  for (const tier of DANIL_CREDITS_TIERS) {
    assert.equal(isDanilCreditsModel(tier), true);
    assert.equal(danilServiceOf(tier), "credits");
  }
  assert.equal(isDanilCreditsModel("danil-credits/deepseek/deepseek-v4.1-flash"), false, "retired pilot id is rejected");
  assert.equal(danilServiceOf("danil-credits/deepseek/deepseek-v4.1-flash"), null);
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
