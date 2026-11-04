import assert from "node:assert/strict";
import test from "node:test";

import { segmentosAnsi } from "../../src/lib/ansi.ts";
import { clasificar, comando } from "../../src/lib/steps.ts";

/**
 * **La fila enseña lo que el agente decidió hacer, no cómo se lanzó.**
 *
 * Medido sobre 14 sesiones de un proyecto —1.259 llamadas a herramientas en 65
 * turnos—: el **85 %** son `Bash`, y de esos el **52 %** empieza por
 * `cd "<ruta absoluta>" && `. Ese prefijo mide 137 caracteres de mediana, es
 * idéntico en todas las filas de la misma tarea —así que no distingue ninguna—
 * y desplaza a la derecha lo único que sí.
 *
 * Se quita **al pintar y no al guardar**: el rastro es lo que el gate aprueba y
 * ahí el comando tiene que ser el que se ejecutó de verdad.
 */

test("el intérprete sale del comando y la carpeta de trabajo se queda", () => {
  // Es el caso real de Codex dentro de una carpeta de trabajo: el cuerpo
  // desplegado es la transcripción, y el `cd` es parte de lo que corrió. La
  // fila, en cambio, se nombra con `commandSummary` («cargo test»).
  assert.equal(
    comando(`/bin/zsh -lc "cd \\"/Users/x/work\\" && cargo test"`),
    'cd "/Users/x/work" && cargo test',
  );
});

test("un cd suelto es lo que el agente hizo, y se enseña", () => {
  // **Sin `&&` no hay nada detrás que enseñar en su lugar.** Tragárselo dejaría
  // la fila sin sujeto, que es peor que enseñar el `cd`.
  assert.equal(comando("cd /tmp/lab"), "cd /tmp/lab");
});

test("la salida ANSI conserva color y descarta controles de terminal", () => {
  assert.deepEqual(segmentosAnsi("\x1b[31mfalló\x1b[0m\x1b[2J listo"), [
    { text: "falló", color: "red", bold: false, dim: false },
    { text: " listo", color: "default", bold: false, dim: false },
  ]);
});

test("la salida ANSI descarta una secuencia de control incompleta", () => {
  assert.deepEqual(segmentosAnsi("antes\x1b[31"), [
    { text: "antes", color: "default", bold: false, dim: false },
  ]);
});

test("un color extendido se lee como un grupo y no como instrucciones sueltas", () => {
  assert.deepEqual(segmentosAnsi("\x1b[38;2;34;139;34mverde\x1b[0m"), [
    { text: "verde", color: "default", bold: false, dim: false },
  ]);
  assert.deepEqual(segmentosAnsi("\x1b[38;5;2mverde\x1b[0m"), [
    { text: "verde", color: "green", bold: false, dim: false },
  ]);
  assert.deepEqual(segmentosAnsi("\x1b[48;2;1;2;3mfondo\x1b[0m"), [
    { text: "fondo", color: "default", bold: false, dim: false },
  ]);
  assert.deepEqual(segmentosAnsi("\x1b[38;2;1;2;3;1mnegrita\x1b[0m"), [
    { text: "negrita", color: "default", bold: true, dim: false },
  ]);
});

test("MultiEdit es una edición en todos los clientes", () => {
  assert.equal(clasificar("MultiEdit"), "editar");
  assert.equal(clasificar("algo_nuevo"), "otro");
});
