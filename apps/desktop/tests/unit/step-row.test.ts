import assert from "node:assert/strict";
import test from "node:test";

import "../helpers/catalog.ts";
import { type Fila, type Paso, pasoDe, resumen } from "../../src/lib/steps.ts";
import { desplegable, salidaDe, tituloDeFila, verboVisible } from "../../src/lib/stepRow.ts";

/**
 * La fila de un comando es marca + comando, sin verbo visible; se
 * despliega solo si trae salida o carpeta, y desplegada no repite el comando.
 */
const comando = (objetivo: string, extra: Partial<Paso> = {}): Fila => ({
  clase: "ejecutar",
  pasos: [pasoDe("Bash", objetivo, { ok: true, ...extra })],
});

const salida = (text: string, cwd?: string): Paso["detalle"] => ({
  kind: "output",
  text,
  exit_code: 0,
  truncated: false,
  ...(cwd ? { cwd } : {}),
});

test("un comando no pinta su verbo pero el lector de pantalla lo tiene", () => {
  const fila = comando("gh pr list");
  assert.equal(verboVisible(fila), false);
  // El verbo sigue en el rótulo: Timeline lo pone en `sr-only`.
  assert.equal(resumen(fila).verbo, "Ejecutó");
  assert.equal(resumen(fila).sujeto, "gh pr list");
  // Las demás clases conservan su verbo a la vista.
  assert.equal(verboVisible({ clase: "leer", pasos: [pasoDe("Read", "/a/b.ts")] }), true);
});

test("un comando sin salida no lleva flecha", () => {
  assert.equal(desplegable(comando("git status")), false);
  // Una salida de solo espacios tampoco es algo que ver.
  assert.equal(desplegable(comando("git status", { detalle: salida("  \n") })), false);
  // Al reabrir la tarea la salida no vuelve del disco: la fila queda sin flecha.
  assert.equal(desplegable(comando("cd /repo && git log --oneline -3")), false);
});

test("un comando con salida o carpeta se despliega", () => {
  assert.equal(desplegable(comando("npm -v", { detalle: salida("11.6.2\n") })), true);
  assert.equal(desplegable(comando("ls", { detalle: salida("", "/repo") })), true);
});

test("desplegado, un comando enseña su salida y no su texto", () => {
  // El cuerpo pinta `carpetaDe` y `salidaDe`; el comando ya está en el renglón.
  const paso = comando("npm -v", { detalle: salida("11.6.2\n") }).pasos[0];
  assert.equal(salidaDe(paso)?.text, "11.6.2\n");
  assert.equal(salidaDe(comando("npm -v", { detalle: salida(" \n") }).pasos[0]), null);
});

test("el comando real completo va en el title del renglón", () => {
  assert.equal(
    tituloDeFila(comando(`/bin/bash -lc 'cd /repo && git log --oneline -3'`)),
    "cd /repo && git log --oneline -3",
  );
  assert.equal(tituloDeFila(comando(`"$DANIL_CLI" task show --task x --json`)), `"$DANIL_CLI" task show --task x --json`);
  // Fuera de los comandos no hay title: el renglón ya dice todo.
  assert.equal(tituloDeFila({ clase: "leer", pasos: [pasoDe("Read", "/a/b.ts")] }), undefined);
});
