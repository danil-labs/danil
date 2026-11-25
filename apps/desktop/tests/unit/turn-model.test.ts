/**
 * Que la fila de acciones de una respuesta diga con qué modelo contestó.
 */

import assert from "node:assert/strict";
import test from "node:test";

import "../helpers/catalog.ts";
import { anexarDelta, transcripcion, type Turn } from "../../../../packages/features/chat/src/model/transcript.ts";

const pregunta = (extra: Partial<Turn> = {}): Turn => ({ role: "user", text: "hola", ...extra });
const respuesta = (extra: Partial<Turn> = {}): Turn => ({ role: "agent", text: "listo", ...extra });
const deLaRespuesta = (turns: Turn[]) => {
  const m = transcripcion(turns).filter((x) => x.role === "agent").at(-1);
  return [m?.reported_model, m?.model_vendor];
};

test("con el modelo por defecto la respuesta lleva el que reportó el CLI", () => {
  assert.deepEqual(
    deLaRespuesta([pregunta(), respuesta({ reported_model: "gpt-6.1-sol", model_vendor: "OpenAI" })]),
    ["gpt-6.1-sol", "OpenAI"],
  );
});

test("una respuesta guardada sin modelo lo toma del turno que la lanzó", () => {
  assert.deepEqual(
    deLaRespuesta([pregunta({ reported_model: "gpt-6.1-sol", model_vendor: "OpenAI" }), respuesta()]),
    ["gpt-6.1-sol", "OpenAI"],
  );
});

test("el modelo de un lanzamiento no pasa a la respuesta del siguiente", () => {
  assert.deepEqual(
    deLaRespuesta([
      pregunta({ reported_model: "gpt-6.1-sol" }),
      respuesta(),
      pregunta(),
      respuesta(),
    ]),
    [undefined, undefined],
  );
});

test("mientras el turno corre, su mensaje lleva el modelo con que se lanzó", () => {
  const primero = anexarDelta([], { text: "Voy", author: null, model: "gpt-6.1-sol" });
  const segundo = anexarDelta(primero, { text: " a leerlo.", author: null, model: "gpt-6.1-sol" });
  assert.deepEqual(
    segundo.map((m) => [m.text, m.reported_model]),
    [["Voy a leerlo.", "gpt-6.1-sol"]],
  );
});

test("el modelo observado gana al alias pedido, que no trae versión", () => {
  assert.deepEqual(
    deLaRespuesta([
      pregunta({ reported_model: "claude-opus-5-5", model_vendor: "Claude Code" }),
      respuesta({ model: "opus" }),
    ]),
    ["claude-opus-5-5", "Claude Code"],
  );
});
