import assert from "node:assert/strict";
import test from "node:test";

import { canHandOver, PROVIDER_HANDOFF_FEATURE } from "../src/index.ts";

test("un motor anterior no manda can_hand_over y la tarea no puede cambiar", () => {
  assert.equal(canHandOver({}), false);
  assert.equal(canHandOver(null), false);
  assert.equal(canHandOver({ can_hand_over: false }), false);
  assert.equal(canHandOver({ can_hand_over: true }), true);
  assert.equal(PROVIDER_HANDOFF_FEATURE, "provider_handoff_v1");
});
