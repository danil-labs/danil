import assert from "node:assert/strict";
import { test } from "node:test";
import { columnWidths } from "../src/lib/tableColumns.ts";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

test("una tabla corta toma lo que mide y no llena la pantalla", () => {
  const w = columnWidths([{ header: "A", cells: ["1", "2"] }, { header: "B", cells: ["x"] }], 360, 14, 14);
  assert.deepEqual(w, [56, 56]);
});

test("una tabla larga de dos columnas cabe en la pantalla y la columna con más texto se lleva más", () => {
  const w = columnWidths(
    [
      { header: "Elemento", cells: ["**Negociaciones** (menú superior)", "**Pipeline general**"] },
      { header: "Qué es", cells: ["Las oportunidades de venta de Vertere, cada negociación es una persona interesada en un lote."] },
    ],
    360,
    14,
    14,
  );
  assert.ok(sum(w) <= 360, `${w}`);
  assert.ok(w[1] > w[0], `${w}`);
  assert.ok(w[0] >= 56);
});

test("si ni las palabras más largas caben, cada columna queda en su mínimo y la tabla se desplaza", () => {
  const cols = Array.from({ length: 8 }, (_, i) => ({ header: `Columna${i}`, cells: ["extraordinariamente largo"] }));
  const w = columnWidths(cols, 360, 14, 14);
  assert.ok(sum(w) > 360);
  assert.equal(new Set(w).size, 1);
});
