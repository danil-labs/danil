import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalAgentId, FREE_ROUTER_OPENCODE, isFreeRouterAgent, isFreeRouterModel, isRetiredAgent, OPENCODE } from "../src/index.ts";

test("opencode-zen pasa a opencode, o al Free Router si su modelo es gratuito", () => {
  assert.equal(canonicalAgentId("opencode-zen"), OPENCODE);
  assert.equal(canonicalAgentId("opencode-zen", "opencode-go/kimi"), OPENCODE);
  assert.equal(canonicalAgentId("opencode-zen", "danil-free/reflection/beam-free"), FREE_ROUTER_OPENCODE);
  assert.equal(canonicalAgentId("opencode-zen", "opencode/nemotron-free"), FREE_ROUTER_OPENCODE);
  assert.equal(canonicalAgentId("opencode"), OPENCODE);
  assert.equal(canonicalAgentId("claude", "danil-free/x"), "claude");
  assert.equal(canonicalAgentId(null), null);
});

test("opencode-local queda retirado salvo que guardara un modelo gratuito", () => {
  assert.equal(canonicalAgentId("opencode-local", "llamacpp/qwen"), "opencode-local");
  assert.equal(isRetiredAgent(canonicalAgentId("opencode-local", "llamacpp/qwen")), true);
  assert.equal(canonicalAgentId("opencode-local", "danil-free/reflection/beam-free"), FREE_ROUTER_OPENCODE);
  assert.equal(isRetiredAgent("opencode"), false);
});

test("el Free Router se reconoce por prefijo, no por motor", () => {
  assert.equal(isFreeRouterAgent("free-router-opencode"), true);
  assert.equal(isFreeRouterAgent("free-router-codex"), true);
  assert.equal(isFreeRouterAgent("opencode"), false);
  assert.equal(isFreeRouterModel("opencode/big-pickle"), false);
});
