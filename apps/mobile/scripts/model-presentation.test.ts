import assert from "node:assert/strict";
import test from "node:test";
import { selectedModelMark, surfacePresentation } from "../src/lib/model-presentation.ts";

for (const labels of [{ free: "Router IA gratis" }, { free: "Free AI Router" }]) {
  test(`surface identity is translated without changing ids: ${labels.free}`, () => {
    const paid = { provider: "opencode", catalogo: "todo", label: "Go" };
    const router = { provider: "free-router-opencode", catalogo: "gratuitos", label: "Free Router · OpenCode" };
    // Un motor anterior todavía publica `opencode-zen`, partido en dos superficies.
    const legacyPaid = { provider: "opencode-zen", catalogo: "de_pago", label: "Go" };
    const legacyFree = { ...legacyPaid, catalogo: "gratuitos", label: "Router IA gratis" };
    assert.deepEqual(surfacePresentation(paid, labels), { label: "OpenCode", mark: "opencode" });
    assert.deepEqual(surfacePresentation(router, labels), { label: labels.free, mark: "danil" });
    assert.deepEqual(surfacePresentation(legacyPaid, labels), { label: "OpenCode", mark: "opencode" });
    assert.deepEqual(surfacePresentation(legacyFree, labels), { label: labels.free, mark: "danil" });
    assert.equal(router.provider, "free-router-opencode");
    assert.equal(paid.label, "Go");
  });
}

test("selected Free belongs to Danil while paid Go keeps OpenCode and retired local has no service logo", () => {
  assert.equal(selectedModelMark("free-router-opencode", "danil-free/reflection/beam-free"), "danil");
  assert.equal(selectedModelMark("free-router-opencode", null), "danil");
  assert.equal(selectedModelMark("opencode", "opencode-go/kimi"), "opencode");
  assert.equal(selectedModelMark("opencode-zen", "danil-free/reflection/beam-free"), "danil");
  assert.equal(selectedModelMark("opencode-zen", "opencode-go/kimi"), "opencode");
  assert.equal(selectedModelMark("opencode-local", "llama/local"), null);
  assert.equal(selectedModelMark("opencode-zen", null, { provider: "opencode-zen", catalogo: "gratuitos", label: "Free" }), "danil");
  assert.equal(selectedModelMark("claude", "opus"), "claude");
});
