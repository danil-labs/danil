import assert from "node:assert/strict";
import test from "node:test";
import { createBlockKeys, estimateBlock, shouldAlignVirtualOffset } from "../../../../packages/features/chat/src/model/threadRows.ts";

test("el bloque vivo conserva su fila al guardarse", () => {
  const keys = createBlockKeys();
  const live = keys.assign(["t1:0", null]);
  const closed = keys.assign(["t1:0", "t2:0"]);
  assert.equal(closed[1], live[1]);
  assert.deepEqual(keys.assign(["t1:0", "t2:0", "t3:0"]), [...closed, "t3:0"]);
});

test("anteponer no cambia la clave de lo que ya estaba", () => {
  const keys = createBlockKeys();
  const first = keys.assign(["t5:0", "t6:0"]);
  assert.deepEqual(keys.assign(["t3:0", "t4:0", "t5:0", "t6:0"]).slice(2), first);
});

test("dos bloques nunca comparten clave", () => {
  const assigned = createBlockKeys().assign(["t1:0", "t1:0", null, null]);
  assert.equal(new Set(assigned).size, assigned.length);
});

test("otra conversación empieza sin herencias", () => {
  const keys = createBlockKeys();
  keys.assign([null]);
  keys.reset();
  assert.deepEqual(keys.assign(["t9:0"]), ["t9:0"]);
});

test("la estimación crece con el texto y tiene techo", () => {
  assert.ok(estimateBlock("msg", 2000, 0) > estimateBlock("msg", 10, 0));
  assert.equal(estimateBlock("trabajo", 10_000_000, 0), estimateBlock("trabajo", 20_000_000, 0));
});

test("solo alinea el offset virtual para filas completamente por encima del borde superior", () => {
  assert.equal(shouldAlignVirtualOffset(400, 500), true, "fila completamente arriba");
  assert.equal(shouldAlignVirtualOffset(500, 500), true, "fila que termina justo en el borde");
  assert.equal(shouldAlignVirtualOffset(650, 500), false, "fila que cruza el borde superior (ancla)");
  assert.equal(shouldAlignVirtualOffset(900, 500), false, "fila debajo del borde superior");
  assert.equal(shouldAlignVirtualOffset(400, null), false, "sin offset aún no ajusta");
});
