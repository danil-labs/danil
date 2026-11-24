import assert from "node:assert/strict";
import { test } from "node:test";
import { flattenTasks, folderCounts } from "../../../../packages/shell/src/shell/sidebarTasks.ts";

const fila = (id: string, created_at: number, extra: Record<string, unknown> = {}) => ({ id, created_at, ...extra });

test("las tareas de todas las carpetas salen en una lista, de la más nueva a la más vieja", () => {
  const plana = flattenTasks({
    a: [fila("a1", 1), fila("a2", 5)],
    b: [fila("b1", 3)],
    "": [fila("suelta", 4)],
  });
  assert.deepEqual(plana.map((t) => [t.project, t.row.id]), [["a", "a2"], ["", "suelta"], ["b", "b1"], ["a", "a1"]]);
});

test("ni archivadas ni repetidas: si una fila llega dos veces, gana la carpeta", () => {
  const plana = flattenTasks({
    "": [fila("x", 2)],
    a: [fila("x", 2), fila("vieja", 1, { archived: true })],
  });
  assert.deepEqual(plana.map((t) => [t.project, t.row.id]), [["a", "x"]]);
});

test("lo que su lanzador ya enseña no se repite, salvo fijado o buscando", () => {
  const filas = { a: [fila("padre", 3), fila("hija", 2, { launched_by: "padre" }), fila("fijada", 1, { launched_by: "padre", pinned: true })] };
  assert.deepEqual(flattenTasks(filas).map((t) => t.row.id), ["padre", "fijada"]);
  assert.deepEqual(flattenTasks(filas, true).map((t) => t.row.id), ["padre", "hija", "fijada"]);
});

test("las cuentas por carpeta son de lo que se ve, antes de filtrar", () => {
  const counts = folderCounts(flattenTasks({ a: [fila("a1", 1), fila("a2", 2)], b: [], "": [fila("s", 3)] }));
  assert.deepEqual([...counts], [["", 1], ["a", 2]]);
});
