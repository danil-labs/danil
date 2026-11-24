import assert from "node:assert/strict";
import test from "node:test";

const { ANCHO_MINIMO, anchosDeColumnas } = await import("../../../../packages/ui/src/markdown-table.ts");

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

test("una columna corta no se parte aunque otra tenga mucho texto", () => {
  // #, issue, estado real, propuesta: la forma de una tabla de seguimiento.
  const minimos = [60, 90, 160, 96];
  const maximos = [60, 420, 1900, 230];
  const anchos = anchosDeColumnas(minimos, maximos, 820);
  assert.equal(anchos[0], 60);
  for (const [i, w] of anchos.entries()) assert.ok(w >= minimos[i], `columna ${i}: ${w}`);
  assert.ok(anchos[2] > anchos[1] && anchos[1] > anchos[0]);
  assert.ok(suma(anchos) <= 820 && suma(anchos) >= 816);
});

test("si todo cabe en una línea, el sobrante se reparte y la tabla llena el ancho", () => {
  const anchos = anchosDeColumnas([40, 60], [100, 200], 600);
  assert.ok(anchos[0] >= 100 && anchos[1] >= 200);
  assert.ok(suma(anchos) >= 598 && suma(anchos) <= 600);
});

test("si ni los mínimos caben, cada columna queda en su mínimo y la tabla se desplaza", () => {
  const anchos = anchosDeColumnas([200, 200, 200], [900, 900, 900], 400);
  assert.ok(suma(anchos) > 400);
  assert.ok(anchos.every((w) => w <= 200));
});

test("una palabra sin espacios más ancha que la tabla no obliga a desplazarla", () => {
  const anchos = anchosDeColumnas([700, 150], [700, 1500], 600);
  assert.ok(anchos[0] < 700, `ruta: ${anchos[0]}`);
  assert.ok(anchos[1] >= 150);
  assert.ok(suma(anchos) <= 600);
});

test("ninguna columna baja del ancho mínimo", () => {
  const anchos = anchosDeColumnas([4, 4, 4], [10, 10, 2000], 300);
  assert.ok(anchos.every((w) => w >= ANCHO_MINIMO));
  assert.deepEqual(anchosDeColumnas([], [], 500), []);
});
