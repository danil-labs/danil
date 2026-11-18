import assert from "node:assert/strict";
import test from "node:test";

import type { HistoryRef } from "@terminus/protocol";
import { transcripcion as transcript } from "../../src/features/chat/transcript.ts";

const ref = (pointer: string): HistoryRef => ({ version: 1, turn: 0, pointer, revision: "r", bytes: 35000 });

test("los resultados de herramientas no ofrecen enlace en el chat", () => {
  const [msg] = transcript([{ role: "assistant", text: "Listo", history_refs: [ref("/tools")] }]);
  assert.equal(msg?.text, "Listo");
  assert.deepEqual(msg?.historyRefs, []);
});

test("un turno que solo traía resultados de herramientas no deja un mensaje vacío", () => {
  assert.deepEqual(transcript([{ role: "assistant", text: "", history_refs: [ref("/tools")] }]), []);
});

test("el texto recortado de un mensaje sigue disponible", () => {
  const [msg] = transcript([{ role: "assistant", text: "", history_refs: [ref("/tools"), ref("/text")] }]);
  assert.deepEqual(msg?.historyRefs?.map((item) => item.pointer), ["/text"]);
});

test("el registro crudo de piezas no ofrece enlace bajo la respuesta", () => {
  const [msg] = transcript([{ role: "assistant", text: "Listo", history_refs: [ref("/pieces")] }]);
  assert.equal(msg?.text, "Listo");
  assert.deepEqual(msg?.historyRefs, []);
});

test("otros campos recortados no ofrecen enlace a JSON crudo", () => {
  const [msg] = transcript([{ role: "assistant", text: "Listo", history_refs: [ref("/reasoning"), ref("/shell")] }]);
  assert.deepEqual(msg?.historyRefs, []);
});
