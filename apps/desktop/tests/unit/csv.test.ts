import assert from "node:assert/strict";
import test from "node:test";

import { delimiterFor, parseTable } from "../../../../packages/ui/src/lib/csv.ts";

test("solo un archivo tabular tiene separador", () => {
  assert.equal(delimiterFor("datos.csv"), ",");
  assert.equal(delimiterFor("carpeta/hoja.tsv"), "\t");
  assert.equal(delimiterFor("notas.md"), null);
  assert.equal(delimiterFor("sin-extension"), null);
});

test("las comillas protegen el separador y el salto de línea", () => {
  const t = parseTable('a,b\n"uno, dos","linea\npartida"\n', ",");
  assert.deepEqual(t.rows, [
    ["a", "b"],
    ["uno, dos", "linea\npartida"],
  ]);
  assert.equal(t.truncated, false);
});

test("una comilla doble dentro de comillas es una comilla", () => {
  assert.deepEqual(parseTable('x\n"di ""hola"""', ",").rows, [
    ["x"],
    ['di "hola"'],
  ]);
});

test("el salto final no deja una fila vacía", () => {
  assert.deepEqual(parseTable("a,b\n", ",").rows, [["a", "b"]]);
});

test("al llegar al tope se dice que la tabla sigue", () => {
  const t = parseTable("1\n2\n3\n4\n", ",", 2);
  assert.equal(t.rows.length, 2);
  assert.equal(t.truncated, true);
  const exact = parseTable("1\n2\n", ",", 2);
  assert.equal(exact.rows.length, 2);
  assert.equal(exact.truncated, false);
});
