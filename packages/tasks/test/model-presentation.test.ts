import assert from "node:assert/strict";
import test from "node:test";
import { modelPresentation, routerDiscovery, routerAvailable, routerOfferState } from "../src/model-presentation.ts";
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


test("router discovery is informational with no machine catalog and does not advertise unknown routes", () => {
  assert.deepEqual(routerDiscovery([]), { label: "Beam", creator: "Reflection" });
  assert.deepEqual(routerDiscovery(["opencode/old-free", "claude/model"]), { label: "Beam", creator: "Reflection" });
  assert.equal(routerDiscovery([], "Cohere"), null);
  assert.equal(routerDiscovery([], "Dots"), null);
  assert.deepEqual(routerDiscovery([], "reflection beam"), { label: "Beam", creator: "Reflection" });
  assert.deepEqual(routerDiscovery([], "Router IA gratis"), { label: "Beam", creator: "Reflection" });
  assert.deepEqual(routerDiscovery([], "Free AI Router"), { label: "Beam", creator: "Reflection" });
});

test("a machine-provided Beam replaces the discovery offer without mutating its catalog", () => {
  const ids = Object.freeze(["danil-free/reflection/beam-free"]);
  assert.equal(routerDiscovery(ids), null);
  assert.deepEqual(ids, ["danil-free/reflection/beam-free"]);
  assert.deepEqual(routerDiscovery(["reflection/beam-free"]), { label: "Beam", creator: "Reflection" });
});


test("consent cannot manufacture availability when the exact upstream model disappears", () => {
  assert.equal(routerAvailable([]), false);
  assert.equal(routerAvailable([{ id: "reflection/beam-1.0-501b-a23b", gratis: true }]), false);
  assert.equal(routerAvailable([{ id: "danil-free/reflection/beam-free", gratis: false }]), false);
  assert.equal(routerAvailable([{ id: "danil-free/reflection/beam-free" }]), false);
  assert.equal(routerAvailable([{ id: "danil-free/reflection/beam-free", gratis: true }]), true);
});

test("la fila del Router dice una sola cosa según política, sí y ruta", () => {
  assert.equal(routerOfferState(undefined, null), "loading");
  assert.equal(routerOfferState(null, null), "update_engine");
  assert.equal(routerOfferState({ enabled: false, accepted: false }, null), "unavailable");
  assert.equal(routerOfferState({ enabled: true, accepted: false }, null), "activate");
  assert.equal(routerOfferState({ enabled: true, accepted: true }, false), "unavailable");
  assert.equal(routerOfferState({ enabled: true, accepted: true }, null), "unavailable");
  assert.equal(routerOfferState({ enabled: true, accepted: true }, true), "ready");
});
