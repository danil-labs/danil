import assert from "node:assert/strict";
import test from "node:test";

import { esTypst, llevaVistaTypst } from "../../../../packages/features/code/src/model/typstScope.ts";

const principal = "taller-cicy-entre-el-orden-y-el-caos/main.typ";

test("la vista de Typst no se queda pegada al abrir otro archivo en la misma pestaña", () => {
  // Lado a lado con un .typ, luego una notebook y un JSON, y de vuelta al .typ.
  const recorrido = [
    [principal, true],
    ["kit-taller/notebooks/01_logistica_y_caos.ipynb", false],
    ["kit-taller/resultados/automatas_elementales_rapido.json", false],
    ["notas/README.md", false],
    ["figuras/atractor.png", false],
    ["entregable.pdf", false],
    ["taller-cicy-entre-el-orden-y-el-caos/secciones/intro.typ", true],
    [principal, true],
  ] as const;
  for (const [ruta, esperada] of recorrido) {
    assert.equal(llevaVistaTypst(ruta), esperada, ruta);
  }
});

test("sin principal elegido un .typ también lleva la vista de Typst", () => {
  // El motor compila el main.typ más cercano: abrir main.typ o una sección ya enseña el documento.
  assert.equal(llevaVistaTypst("articulo/main.typ"), true);
  assert.equal(llevaVistaTypst("articulo/secciones/01-introduccion.typ"), true);
  assert.equal(llevaVistaTypst("articulo/refs.bib"), false);
});

test("un .typ se reconoce sin importar mayúsculas", () => {
  assert.ok(esTypst("Capitulo.TYP"));
  assert.ok(!esTypst("datos.typ.json"));
});
