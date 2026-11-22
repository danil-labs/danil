import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeAttention } from "../src/index.ts";

test("una entrada suelta de `attention` cambia solo su workspace", () => {
  const before = [{ workspace: "a", tasks: [1] }, { workspace: "b", tasks: [2] }];
  assert.deepEqual(mergeAttention(before, [{ workspace: "b", tasks: [] }]), [{ workspace: "a", tasks: [1] }, { workspace: "b", tasks: [] }]);
  assert.deepEqual(mergeAttention(before, [{ workspace: "c", tasks: [3] }]), [...before, { workspace: "c", tasks: [3] }]);
});

test("la lista entera reemplaza y se lleva los workspaces borrados", () => {
  const before = [{ workspace: "a", tasks: [1] }, { workspace: "b", tasks: [2] }, { workspace: "gone", tasks: [9] }];
  const whole = [{ workspace: "a", tasks: [] }, { workspace: "b", tasks: [2, 3] }];
  assert.deepEqual(mergeAttention(before, whole), whole);
  assert.deepEqual(mergeAttention([], whole), whole, "la primera lista también vale");
  assert.deepEqual(mergeAttention(before, []), [], "una máquina sin workspaces no deja nada");
});
