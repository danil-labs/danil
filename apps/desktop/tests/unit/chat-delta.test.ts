/**
 * Que un fragmento tardío de un mensaje del agente vuelva a su globo.
 *
 * ACP publica `messageId`, y su orden de entrega no es el de generación: una
 * herramienta del mensaje puede llegar entre dos fragmentos suyos. Sin esto el
 * mensaje sale partido en dos globos con la herramienta en medio.
 */

import assert from "node:assert/strict";
import test from "node:test";

import "../helpers/catalog.ts";
import type { Msg } from "../../src/features/chat/Chat.tsx";
import { anexarDelta, anexarImagen, anexarRazonamiento } from "../../src/features/chat/transcript.ts";

const texto = (msgs: Msg[]) => msgs.map((m) => `${m.role}:${m.text}`);

test("un fragmento del mismo mensaje vuelve a su globo aunque haya una herramienta en medio", () => {
  const primero = anexarDelta([], { text: "Compruebo tipos, linter y la", messageId: "m1", author: null });
  // La herramienta del mismo mensaje llega antes que el resto del texto.
  const conPaso: Msg[] = [...primero, { role: "system", text: "Read", meta: "usó" }];
  const fin = anexarDelta(conPaso, { text: " prueba nueva.", messageId: "m1", author: null });
  assert.deepEqual(texto(fin), ["agent:Compruebo tipos, linter y la prueba nueva.", "system:Read"]);
});

test("un mensaje nuevo abre su globo", () => {
  const primero = anexarDelta([], { text: "Uno.", messageId: "m1", author: null });
  const conPaso: Msg[] = [...primero, { role: "system", text: "Read", meta: "usó" }];
  const fin = anexarDelta(conPaso, { text: "Dos.", messageId: "m2", author: null });
  assert.deepEqual(texto(fin), ["agent:Uno.", "system:Read", "agent:Dos."]);
});

test("sin mensaje nativo se conserva lo de antes", () => {
  const uno = anexarDelta([], { text: "Uno", author: null });
  assert.deepEqual(texto(anexarDelta(uno, { text: " y dos", author: null })), ["agent:Uno y dos"]);
  const conPaso: Msg[] = [...uno, { role: "system", text: "Read", meta: "usó" }];
  assert.deepEqual(texto(anexarDelta(conPaso, { text: "Tres", author: null })), [
    "agent:Uno",
    "system:Read",
    "agent:Tres",
  ]);
});

test("la imagen se pega al globo que todavía se escribe", () => {
  const conTexto = anexarImagen(
    [{ role: "agent", text: "Aquí está.", nativeMessageId: "m1" }],
    ["data:image/png;base64,aGVsbG8="],
  );
  assert.deepEqual(conTexto[0]?.images, ["data:image/png;base64,aGVsbG8="]);
  assert.equal(conTexto[0]?.text, "Aquí está.");

  const antes = anexarImagen([], ["data:image/png;base64,aGVsbG8="]);
  const fin = anexarDelta(antes, { text: "Listo.", messageId: "m1", author: null });
  assert.equal(fin.length, 1);
  assert.equal(fin[0]?.text, "Listo.");
  assert.deepEqual(fin[0]?.images, ["data:image/png;base64,aGVsbG8="]);
  assert.equal(fin[0]?.nativeMessageId, "m1");
});

test("startsMessage abre otro globo aunque venga del mismo mensaje", () => {
  const uno = anexarDelta([], { text: "Uno", messageId: "m1", author: null });
  const fin = anexarDelta(uno, {
    text: "\n\nDos",
    messageId: "m1",
    startsMessage: true,
    author: null,
  });
  assert.deepEqual(texto(fin), ["agent:Uno", "agent:Dos"]);
});

const razonamientos = (msgs: Msg[]) =>
  msgs.flatMap((m) => (m.razonamiento ?? []).map((b) => b.text));

test("el razonamiento con id vuelve a su mensaje aunque haya una herramienta en medio", () => {
  const primero = anexarRazonamiento([], { text: "Pienso", messageId: "m1", author: null });
  const conPaso: Msg[] = [...primero, { role: "system", text: "Read", meta: "usó" }];
  const fin = anexarRazonamiento(conPaso, { text: " más", messageId: "m1", author: null });
  assert.equal(fin.length, 2);
  assert.deepEqual(razonamientos(fin), ["Pienso más"]);
});

test("sin id cada ráfaga es un bloque y el texto la cierra", () => {
  const primero = anexarRazonamiento([], { text: "Primera", author: null });
  const conTexto = anexarDelta(primero, { text: "Respuesta", author: null });
  const fin = anexarRazonamiento(conTexto, { text: "Segunda", author: null });
  assert.deepEqual(razonamientos(fin), ["Primera", "Segunda"]);
});

test("sin id una herramienta cierra la ráfaga", () => {
  const primero = anexarRazonamiento([], { text: "Uno", author: null });
  const conPaso: Msg[] = [...primero, { role: "system", text: "Read", meta: "usó" }];
  const fin = anexarRazonamiento(conPaso, { text: "Dos", author: null });
  assert.deepEqual(razonamientos(fin), ["Uno", "Dos"]);
});

test("startsMessage no fusiona dos ráfagas de razonamiento", () => {
  const primero = anexarRazonamiento([], { text: "Uno", author: null });
  const conTexto = anexarDelta(primero, { text: "Respuesta", startsMessage: true, author: null });
  const fin = anexarRazonamiento(conTexto, { text: "Dos", author: null });
  assert.deepEqual(razonamientos(fin), ["Uno", "Dos"]);
});
