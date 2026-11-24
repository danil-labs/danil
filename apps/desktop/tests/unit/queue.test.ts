import assert from "node:assert/strict";
import test from "node:test";

import { deOtraTarea as fromAnotherTask, contestaALaTerminal as answersTerminal, esDeLaTerminal as isTerminalMessage, guardable as isSaveable, inyectable as isInjectable, seMandaSinSuperficie as sendsWithoutSurface } from "../../../../packages/ui/src/lib/queue.ts";

const delivery = {
  id: "d1",
  text: "Revisa el acceso",
  provider: "codex",
  model: null,
  effort: null,
  permission_mode: null,
  attachments: [],
  agent: "arquitecto",
  reply_to: { folder: "p", task: "t9" },
  hops: 2,
};

const written = { provider: "claude", model: null, effort: null, permission_mode: null, attachments: [] };

test("no se guarda en la carpeta de una tarea que no es la suya", () => {
  assert.equal(isSaveable("A", "A"), true);
  // Lo que dejaba `.cola.json` vacíos en la tarea que se acababa de dejar.
  assert.equal(isSaveable("A", "B"), false);
  assert.equal(isSaveable("A", null), false);
  // Sin dueño no hay carpeta donde escribir: el primer turno la crea.
  assert.equal(isSaveable(null, null), false);
});

test("al turno vivo solo entra lo que es un mensaje, nunca un comando", () => {
  assert.equal(isInjectable({ ...written, id: "a", text: "y revisa esto" }), true);
  assert.equal(isInjectable({ ...written, id: "a", text: "!pnpm test" }), false);
  assert.equal(isInjectable({ ...written, id: "a", text: "/compact" }), false);
  assert.equal(isInjectable({ ...written, id: "a", text: "  !ls" }), false);
  // Un signo en medio no es un comando.
  assert.equal(isInjectable({ ...written, id: "a", text: "¿por qué falla /tmp!?" }), true);
});

// Lo que mandó otra tarea no entra en el turno vivo desde la ventana:
// `inject_message` no lleva sobre y saldría firmado por la persona. Se ve con
// su remitente y no se edita ni se quita como si fuera suyo.
test("una entrega de otra tarea no se inyecta ni se toma por de la persona", () => {
  const reply = {
    ...written,
    id: "r1",
    text: "Ya subí el arreglo",
    from_task: { folder: "p", task: "2jcp4typ", title: "Arreglo", provider: "claude" },
    hops: 0,
  };
  assert.equal(isInjectable(reply), false);
  assert.equal(fromAnotherTask(reply), true);
  assert.equal(isInjectable(delivery), false);
  assert.equal(fromAnotherTask(delivery), true);
  const telegram = { ...written, id: "c1", text: "hola", channel: "telegram", hops: 1 };
  assert.equal(isInjectable(telegram), false);
  assert.equal(fromAnotherTask(telegram), false, "lo de un canal lo escribió la persona");
  assert.equal(fromAnotherTask({ ...written, id: "a", text: "y revisa esto" }), false);
});

// Un `!` que llegó de otra tarea, de un encargado o de un canal no es de la
// persona: sale como texto para el agente y no se ejecuta.
test("solo se ejecuta el `!` que escribió la persona en su caja", () => {
  assert.equal(isTerminalMessage({ ...written, id: "a", text: "!ls" }), true);
  assert.equal(isTerminalMessage({ ...written, id: "a", text: "ls" }), false);
  assert.equal(isTerminalMessage({ ...delivery, text: "!rm -rf build" }), false);
  assert.equal(isTerminalMessage({ ...written, id: "a", text: "!ls", channel: "Telegram" }), false);
  assert.equal(isTerminalMessage({ ...written, id: "a", text: "!ls", hops: 0 }), false);
});

test("la respuesta automática espera al último comando y a que no venga un mensaje", () => {
  const command = { ...written, id: "s1", text: "!pnpm test" };
  const message = { ...written, id: "m1", text: "¿qué falla?" };
  assert.equal(answersTerminal([], false, true), true);
  assert.equal(answersTerminal([command], false, true), false);
  assert.equal(answersTerminal([message], false, true), false);
  assert.equal(answersTerminal([{ ...written, id: "b1", text: "/compact" }], false, true), false);
  assert.equal(answersTerminal([], true, true), false);
});

// Sin cuenta conectada nadie puede contestar: pedir el turno pintaría un fallo
// bajo un comando que corrió bien. La salida espera al primer mensaje.
test("sin superficie utilizable la salida de un `!` queda pendiente y no se pide respuesta", () => {
  assert.equal(answersTerminal([], false, true), true);
  assert.equal(answersTerminal([], false, false), false);
});

// Un `!` no llama a ningún modelo: exigirle superficie lo deja sin correr en
// una app recién instalada, que es donde se escribe primero.
test("un `!` se manda sin superficie utilizable y un mensaje no", () => {
  assert.equal(sendsWithoutSurface("!git status"), true);
  assert.equal(sendsWithoutSurface("revisa esto"), false);
  assert.equal(sendsWithoutSurface("/compact"), false);
  // La caja entra en modo terminal con el `!` en la primera columna.
  assert.equal(sendsWithoutSurface(" !ls"), false);
});
