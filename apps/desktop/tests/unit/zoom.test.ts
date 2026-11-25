import assert from "node:assert/strict";
import test from "node:test";

import {
  clampZoom,
  offsetOnZoom,
  ZOOM_MAX,
  ZOOM_MIN,
} from "../../../../packages/ui/src/lib/zoom.ts";

test("el zoom no sale de sus topes", () => {
  assert.equal(clampZoom(0), ZOOM_MIN);
  assert.equal(clampZoom(1000), ZOOM_MAX);
  assert.equal(clampZoom(2), 2);
  assert.equal(clampZoom(Number.NaN), 1);
});

test("el punto bajo el cursor se queda quieto al acercar", () => {
  assert.deepEqual(offsetOnZoom({ x: 0, y: 0 }, { x: 10, y: -4 }, 1, 2), {
    x: -10,
    y: 4,
  });
});
