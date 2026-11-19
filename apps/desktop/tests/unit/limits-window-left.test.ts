import assert from "node:assert/strict";
import test from "node:test";
import "../helpers/catalog.ts";
import { left, type Window } from "../../src/lib/limits.ts";

const ventana = (used_pct: number, resets_at: number | null): Window => ({ label: "5h", used_pct, resets_at });

test("una ventana cuyo reset ya pasó se ve entera, no con el uso viejo", () => {
  assert.equal(left(ventana(100, Date.now() - 60_000)), 100);
  assert.equal(left(ventana(100, Date.now() + 3_600_000)), 0);
  assert.equal(left(ventana(37.6, null)), 62);
});

test("left sirve en map: el índice no se toma como hora", () => {
  const ventanas = [ventana(90, Date.now() + 3_600_000), ventana(40, Date.now() + 3_600_000)];
  assert.deepEqual(ventanas.map(left), [10, 60]);
});
