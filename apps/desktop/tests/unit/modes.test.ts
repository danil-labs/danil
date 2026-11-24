import assert from "node:assert/strict";
import test from "node:test";

import { modoInicial, siguienteModo } from "../../../../packages/features/chat/src/model/modes.ts";
import type { ModoDePermiso } from "../../src/lib/model.ts";

/** Los tres, en el orden en que los manda el backend. */
const tres = (falta: Record<string, string> = {}, omision = "auto"): ModoDePermiso[] =>
  // `label` y `falta` son `Frase` —clave, no palabra—, como los manda el
  // backend de verdad; el chequeo de tipos de scripts/ cazó que este arnés
  // los fabricaba como cadenas.
  [
    { id: "manual", label: { clave: "agents.mode.manual" } },
    { id: "ediciones", label: { clave: "agents.mode.edits" } },
    { id: "auto", label: { clave: "agents.mode.auto" } },
  ].map((m) => ({
    ...m,
    falta: falta[m.id] ? { clave: falta[m.id] } : null,
    por_omision: m.id === omision,
  }));

test("el ciclo recorre los tres y vuelve al principio", () => {
  const modos = tres();
  assert.equal(siguienteModo(modos, "manual"), "ediciones");
  assert.equal(siguienteModo(modos, "ediciones"), "auto");
  assert.equal(siguienteModo(modos, "auto"), "manual");
});

/**
 * **Lo que el agente no sostiene no entra en el ciclo.**
 *
 * Es la mitad del atajo que no se ve al probarlo con Claude delante: con Codex
 * o Antigravity, `shift+tab` pasaría por un estado que el desplegable enseña
 * apagado, y el turno fallaría al mandarse con el motivo de la fila. Un atajo
 * que lleva a un sitio del que no se puede salir enviando es peor que un atajo
 * que no hace nada.
 */
test("el ciclo se salta los modos que el agente no puede", () => {
  const modos = tres({
    manual: "Codex no devuelve aprobaciones",
    ediciones: "Codex no devuelve aprobaciones",
  });
  assert.equal(
    siguienteModo(modos, "auto"),
    null,
    "con un solo modo utilizable no hay a dónde ir",
  );
});

/**
 * **Y si el modo actual no está en la lista, el ciclo empieza por el
 * principio.**
 *
 * Pasa de verdad al cambiar de agente: el modo elegido puede quedarse sin
 * sostén un instante antes de que llegue la lista nueva. Sin esto, `findIndex`
 * devuelve `-1`, `(-1 + 1) % n` es `0` y **acierta por casualidad**; se fija
 * aquí para que siga siendo cierto si alguien cambia la aritmética.
 */
test("un modo que ya no está deja el ciclo en el primero utilizable", () => {
  const modos = tres({ manual: "no lo sostiene" });
  assert.equal(siguienteModo(modos, "manual"), "ediciones");
  assert.equal(siguienteModo(modos, "inventado"), "ediciones");
});

/**
 * Con qué arranca la tarea que no dice con qué.
 *
 * Lo que se ve al día siguiente es lo contrario: quien puso «automático» ayer
 * abre hoy y se encuentra aprobando cada acción, sin nada que lo explique.
 */
test("el arranque toma el modo preferido cuando el agente lo sostiene", () => {
  assert.equal(modoInicial(tres(), "auto"), "auto");
  assert.equal(modoInicial(tres(), "manual"), "manual");
  assert.equal(modoInicial(tres(), "ediciones"), "ediciones");
});

/**
 * Un recuerdo que este agente no sostiene no arrastra el arranque: con Codex
 * delante, «manual» dejaría el turno negado al mandarse.
 */
test("un recuerdo sin sostén cae al que el backend resolvió y a auto si ninguno viene marcado", () => {
  const modos = tres({ manual: "Codex no devuelve aprobaciones" });
  assert.equal(modoInicial(modos, "manual"), "auto");
  assert.equal(modoInicial(tres({}, ""), ""), "auto");
});
