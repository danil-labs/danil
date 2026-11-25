import assert from "node:assert/strict";
import test from "node:test";
import { agentId } from "../../../../packages/features/projects/src/model/agentId.ts";

test("a display name becomes a kebab-case id", () => {
  assert.equal(agentId("Giskard"), "giskard");
  assert.equal(agentId("Product Owner"), "product-owner");
  assert.equal(agentId("  Líder de Producto  "), "lider-de-producto");
  assert.equal(agentId("R. Daneel Olivaw"), "r-daneel-olivaw");
});

test("the id never starts, ends or doubles a hyphen", () => {
  assert.equal(agentId("--hola--mundo--"), "hola-mundo");
  assert.equal(agentId("a  &  b"), "a-b");
  assert.equal(agentId("x".repeat(59) + " y"), "x".repeat(59), "cut at 60 without a trailing hyphen");
});
