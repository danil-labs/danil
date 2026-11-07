import assert from "node:assert/strict";
import test from "node:test";
import { modelPresentation } from "../src/model-presentation.ts";
import { modelName } from "../src/preview.ts";

test("Beam has its creator tag and concise label without changing its exact id", () => {
  for (const id of ["danil-free/reflection/beam-free", "reflection/beam-free"]) {
    for (const label of ["Beam Free", "Reflection Beam Free", "Router IA gratis", undefined]) {
      assert.deepEqual(modelPresentation(id, label), { label: "Beam", creator: "Reflection" });
      assert.equal(modelName(id), "Beam");
    }
  }
});

test("unknown and paid models retain their names without invented creators", () => {
  for (const id of ["kilo-auto/free", "opencode-go/beam", "cohere/north-mini-code:free"]) {
    assert.deepEqual(modelPresentation(id, "Original Free"), { label: "Original Free", creator: null });
  }
  assert.deepEqual(modelPresentation("unknown"), { label: "unknown", creator: null });
});
