import assert from "node:assert/strict";
import test from "node:test";

import { parsearDiff, saltoEntre } from "../../../../packages/features/code/src/model/diff.ts";

/**
 * **Lo que se prueba aquí es la numeración, no el parseo.** Un diff mal parseado
 * se ve raro y alguien lo arregla; un diff con los números corridos se ve
 * perfecto y manda a leer la línea equivocada del archivo, que es una revisión
 * que dice lo contrario de lo que pasó.
 */
const PATCH = `diff --git a/src/uno.ts b/src/uno.ts
index 1111111..2222222 100644
--- a/src/uno.ts
+++ b/src/uno.ts
@@ -10,4 +10,5 @@ export function uno() {
   const a = 1;
-  const b = 2;
+  const b = 3;
+  const c = 4;
   return a;
@@ -40,3 +41,3 @@ export function dos() {
   const d = 5;
-  return d;
+  return d + 1;
diff --git a/assets/logo.png b/assets/logo.png
new file mode 100644
index 0000000..3333333
Binary files /dev/null and b/assets/logo.png differ
diff --git a/viejo.txt b/viejo.txt
deleted file mode 100644
index 4444444..0000000
--- a/viejo.txt
+++ /dev/null
@@ -1,2 +0,0 @@
-una
-dos
`;

test("cada línea lleva su número real en el archivo de ahora", () => {
  const [uno] = parsearDiff(PATCH);
  assert.equal(uno.ruta, "src/uno.ts");
  assert.equal(uno.estado, "cambiado");

  const primero = uno.hunks[0].lineas;
  // El trozo arranca en la 10, y el contexto la ocupa.
  assert.deepEqual(
    primero.map((l) => [l.tipo, l.nueva]),
    [
      ["ctx", 10],
      ["del", null],
      ["add", 11],
      ["add", 12],
      ["ctx", 13],
    ],
  );
  // Una borrada no avanza la numeración del archivo nuevo, y sí la del viejo.
  assert.equal(primero[1].vieja, 11);
  assert.equal(primero[4].vieja, 12);
});

test("el salto entre trozos es lo que git no mandó", () => {
  const [uno] = parsearDiff(PATCH);
  // El primero acaba en la 13 y el segundo empieza en la 41: 27 en medio.
  assert.equal(saltoEntre(uno.hunks[0], uno.hunks[1]), 27);
});

test("un binario se nombra y no finge tener líneas", () => {
  const binario = parsearDiff(PATCH).find((a) => a.ruta === "assets/logo.png");
  assert.ok(binario);
  assert.equal(binario.binario, true);
  assert.equal(binario.estado, "nuevo");
  assert.equal(binario.hunks.length, 0);
});

test("un borrado conserva su nombre, que solo está en la línea de menos", () => {
  const borrado = parsearDiff(PATCH).find((a) => a.estado === "borrado");
  assert.ok(borrado);
  assert.equal(borrado.ruta, "viejo.txt");
  assert.equal(borrado.removed, 2);
});

test("«\\ No newline at end of file» no cuenta como línea", () => {
  const [a] = parsearDiff(`diff --git a/x b/x
--- a/x
+++ b/x
@@ -1,2 +1,2 @@
 uno
-dos
\\ No newline at end of file
+tres
`);
  assert.deepEqual(
    a.hunks[0].lineas.map((l) => l.texto),
    ["uno", "dos", "tres"],
  );
  assert.equal(a.hunks[0].lineas[2].nueva, 2);
});

/**
 * Los cuatro casos que git produce y el patch no se parece a un diff normal.
 * Ninguno daba error: el archivo simplemente desaparecía de la revisión, o
 * llegaba con basura invisible dentro.
 */
test("un renombrado conserva de dónde venía y no finge tener cambios", () => {
  const [r] = parsearDiff(`diff --git a/viejo.ts b/nuevo.ts
similarity index 100%
rename from viejo.ts
rename to nuevo.ts
`);
  assert.equal(r.ruta, "nuevo.ts");
  assert.equal(r.desde, "viejo.ts");
  assert.equal(r.estado, "renombrado");
  assert.equal(r.hunks.length, 0);
});

test("una ruta con espacios no se parte", () => {
  const [e] = parsearDiff(`diff --git a/mi carpeta/archivo raro.md b/mi carpeta/archivo raro.md
--- a/mi carpeta/archivo raro.md
+++ b/mi carpeta/archivo raro.md
@@ -1 +1 @@
-uno
+dos
`);
  assert.equal(e.ruta, "mi carpeta/archivo raro.md");
});

test("un repositorio con finales CRLF no mete caracteres de control en el código", () => {
  const [c] = parsearDiff(
    "diff --git a/a.txt b/a.txt\r\n--- a/a.txt\r\n+++ b/a.txt\r\n@@ -1 +1 @@\r\n-uno\r\n+dos\r\n",
  );
  assert.equal(c.ruta, "a.txt");
  assert.deepEqual(
    c.hunks[0].lineas.map((l) => l.texto),
    ["uno", "dos"],
  );
});

test("un cambio de permisos sigue siendo un archivo de la lista", () => {
  const [m] = parsearDiff(`diff --git a/script.sh b/script.sh
old mode 100644
new mode 100755
`);
  assert.equal(m.ruta, "script.sh");
  assert.equal(m.hunks.length, 0);
});
