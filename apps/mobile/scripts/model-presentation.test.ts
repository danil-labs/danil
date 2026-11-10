import assert from "node:assert/strict";
import test from "node:test";
import { selectedModelMark, surfacePresentation } from "../src/lib/model-presentation.ts";

for (const labels of [{ free: "Router IA gratis", local: "Modelos locales" }, { free: "Free AI Router", local: "Local models" }]) {
  test(`surface identity is translated without changing ids: ${labels.free}`, () => {
    const paid = { provider: "opencode-zen", catalogo: "de_pago", label: "Go" };
    const free = { ...paid, catalogo: "gratuitos", label: "Router IA gratis" };
    const local = { provider: "opencode-local", catalogo: "todo", label: "Locales" };
    assert.deepEqual(surfacePresentation(paid, labels), { label: "OpenCode", mark: "opencode-zen" });
    assert.deepEqual(surfacePresentation(free, labels), { label: labels.free, mark: "danil" });
    assert.deepEqual(surfacePresentation(local, labels), { label: labels.local, mark: null });
    assert.equal(free.provider, "opencode-zen");
    assert.equal(paid.label, "Go");
  });
}

test("selected Free belongs to Danil while paid Go keeps OpenCode and local has no service logo", () => {
  assert.equal(selectedModelMark("opencode-zen", "danil-free/reflection/beam-free"), "danil");
  assert.equal(selectedModelMark("opencode-zen", "opencode-go/kimi"), "opencode-zen");
  assert.equal(selectedModelMark("opencode-local", "llama/local"), null);
  assert.equal(selectedModelMark("opencode-zen", null, { provider: "opencode-zen", catalogo: "gratuitos", label: "Free" }), "danil");
  assert.equal(selectedModelMark("claude", "opus"), "claude");
});
