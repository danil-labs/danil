import assert from "node:assert/strict";
import test from "node:test";
import { ACTIVITY_MOTIONS, createActivityMotionCycle } from "../../../../packages/features/chat/src/model/activityMotion.ts";

test("each round includes all four and the displayed initial figure is consumed", () => {
  for (const random of [() => 0, () => 0.4, () => 0.999]) {
    const cycle = createActivityMotionCycle(random);
    const seen = [cycle.initial, ...Array.from({ length: 15 }, () => cycle.next())];
    for (let index = 0; index < seen.length; index += 4) assert.deepEqual([...new Set(seen.slice(index, index + 4))].sort(), [...ACTIVITY_MOTIONS].sort());
    for (let index = 1; index < seen.length; index++) assert.notEqual(seen[index], seen[index - 1]);
  }
});
