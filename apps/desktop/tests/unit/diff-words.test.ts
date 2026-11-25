import assert from "node:assert/strict";
import test from "node:test";

import {
  filasDosPaneles,
  marcarLineas,
  parsearDiff,
  tramosCambiados,
  type Linea,
  type Tramo,
} from "../../../../packages/features/code/src/model/diff.ts";

const trozos = (texto: string, tramos: Tramo[]) => tramos.map(([a, b]) => texto.slice(a, b));

test("una palabra añadida solo se marca del lado que la tiene", () => {
  const antes = "return a;";
  const despues = "return a + b;";
  const t = tramosCambiados(antes, despues);
  assert.ok(t);
  assert.deepEqual(t.antes, []);
  assert.deepEqual(trozos(despues, t.despues), [" + b"]);
});

test("dos cambios separados por un espacio se pintan como un tramo", () => {
  const antes = "if (uno dos) listo();";
  const despues = "if (tres cuatro) listo();";
  const t = tramosCambiados(antes, despues);
  assert.ok(t);
  assert.deepEqual(trozos(despues, t.despues), ["tres cuatro"]);
});

test("un par casi sin nada en común no se marca", () => {
  assert.equal(tramosCambiados("import x from 'y';", "}"), null);
  assert.equal(tramosCambiados("", "algo"), null);
});

test("una línea demasiado larga para compararla no se marca", () => {
  const larga = (sufijo: string) => Array.from({ length: 400 }, (_, i) => `p${i}${sufijo}`).join(" ");
  assert.equal(tramosCambiados(larga("a"), larga("b")), null);
});

const PATCH = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,6 +1,6 @@
 uno
-const a = 1;
-const b = 2;
-const c = 3;
+const a = 10;
+const b = 20;
 dos
+nueva
 tres
`;

test("empareja cada borrada con la añadida de su misma posición en el bloque", () => {
  const [archivo] = parsearDiff(PATCH);
  const lineas = archivo.hunks[0].lineas;
  const tramos = marcarLineas(lineas);
  const marcados = lineas.map((l, i) => trozos(l.texto, tramos[i]));
  assert.deepEqual(marcados, [[], ["1"], ["2"], [], ["10"], ["20"], [], [], []]);
});

test("en dos paneles el lado corto lleva huecos y las filas no se descuadran", () => {
  const [archivo] = parsearDiff(PATCH);
  const lineas = archivo.hunks[0].lineas;
  const filas = filasDosPaneles(lineas).map((f) => [
    f.antes === null ? null : lineas[f.antes].texto,
    f.despues === null ? null : lineas[f.despues].texto,
  ]);
  assert.deepEqual(filas, [
    ["uno", "uno"],
    ["const a = 1;", "const a = 10;"],
    ["const b = 2;", "const b = 20;"],
    ["const c = 3;", null],
    ["dos", "dos"],
    [null, "nueva"],
    ["tres", "tres"],
  ]);
});

test("mil pares de líneas se marcan sin congelar la ventana", () => {
  const lineas = Array.from({ length: 1000 }, (_, i) => `  const valor${i} = calcular(${i}, "texto de relleno", opciones);`);
  const patch = [
    "diff --git a/g.ts b/g.ts",
    "--- a/g.ts",
    "+++ b/g.ts",
    "@@ -1,1000 +1,1000 @@",
    ...lineas.map((l) => `-${l}`),
    ...lineas.map((l) => `+${l.replace("relleno", "sustituto")}`),
  ].join("\n");
  const [archivo] = parsearDiff(patch);
  const inicio = performance.now();
  const tramos = marcarLineas(archivo.hunks[0].lineas);
  const ms = performance.now() - inicio;
  assert.equal(tramos.filter((t) => t.length > 0).length, 2000);
  assert.ok(ms < 500, `marcar 1000 pares tardó ${ms.toFixed(0)} ms`);
});

test("una añadida delante no desplaza a la línea que de verdad sustituye a la borrada", () => {
  const lineas: Linea[] = [
    { tipo: "del", texto: "export default function Home(): React.ReactElement {", vieja: 9, nueva: null },
    { tipo: "add", texto: "// cambio dumb sin sentido", vieja: null, nueva: 9 },
    { tipo: "add", texto: "export default function Home(): React.ReactElement  {", vieja: null, nueva: 10 },
  ];
  const tramos = marcarLineas(lineas);
  assert.ok(tramos[0].length > 0);
  assert.equal(tramos[1].length, 0);
  assert.ok(tramos[2].length > 0);
  assert.deepEqual(filasDosPaneles(lineas), [
    { antes: null, despues: 1 },
    { antes: 0, despues: 2 },
  ]);
});
