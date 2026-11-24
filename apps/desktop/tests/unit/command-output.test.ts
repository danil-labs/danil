/**
 * Que la salida de un comando de barra se pinte como tarjeta suya: con el
 * comando que la pidió y sin deshacer una salida alineada con espacios.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { comandoDe, comandoEscrito, esMarkdown, esSalidaDeComando, soloEnSuTerminal } from "../../../../packages/features/chat/src/model/slashOutput.ts";
import { claseDelTramo, tramosDelMensaje } from "../../src/lib/taskMentions.ts";

const salida = { role: "system", meta: "command_output", text: "## Context Usage\n\n**Tokens:** 17.5k / 1m (2%)" };

test("solo los dos metas de salida de comando salen del registro de pasos", () => {
  assert.equal(esSalidaDeComando("command_output"), true);
  assert.equal(esSalidaDeComando("command_terminal_only"), true);
  assert.equal(esSalidaDeComando("fallo"), false);
  assert.equal(esSalidaDeComando(undefined), false);
  assert.equal(soloEnSuTerminal("command_terminal_only"), true);
  assert.equal(soloEnSuTerminal("command_output"), false);
});

test("la tarjeta nombra el comando que la pidió, no el último mensaje", () => {
  const msgs = [
    { role: "user", text: "hola" },
    { role: "agent", text: "hola" },
    { role: "user", text: "/mcp list\nsegunda línea" },
    { role: "system", meta: "usó", text: "Read" },
    salida,
  ];
  assert.equal(comandoDe(msgs, msgs.length - 1), "/mcp list");
  // Sin un mensaje con barra delante no se inventa uno.
  assert.equal(comandoDe(msgs.slice(0, 2), 2), "");
});

test("una salida alineada con espacios no se pinta como párrafo", () => {
  const costo =
    "Total cost:            $0.0000\nTotal duration (API):  0s\nTotal duration (wall): 1s";
  assert.equal(esMarkdown(costo), false);
  assert.equal(esMarkdown(salida.text), true);
  assert.equal(esMarkdown("| Categoría | Tokens |\n| --- | --- |\n| Mensajes | 41k |"), true);
});

// La negativa de un comando nombra lo que se escribió, sin sus argumentos.
test("la negativa nombra el comando y no lo que lo sigue", () => {
  assert.equal(comandoEscrito("/model opus\nsegunda línea"), "/model");
  assert.equal(comandoEscrito("/focus"), "/focus");
  assert.equal(comandoEscrito("hola /model"), "");
});

// La burbuja enviada reconoce el comando con la misma regla que la caja: la
// primera palabra, y solo si el menú del agente la conoce.
test("el mensaje enviado marca solo el comando que el menú conoce", () => {
  const menu = new Set(["compact", "review"]);
  assert.deepEqual(tramosDelMensaje("/compact", menu), [
    { text: "/compact", kind: "command" },
    { text: "", kind: null },
  ]);
  assert.deepEqual(tramosDelMensaje("/review solo src/app", menu), [
    { text: "/review", kind: "command" },
    { text: " solo src/app", kind: null },
  ]);
  assert.deepEqual(tramosDelMensaje("/ruta/archivo", menu), [{ text: "/ruta/archivo", kind: null }]);
  assert.deepEqual(tramosDelMensaje("/compact", new Set(["cost"])), [{ text: "/compact", kind: null }]);
  assert.deepEqual(tramosDelMensaje("mira /compact", menu), [{ text: "mira /compact", kind: null }]);
});

test("la burbuja y la caja pintan el comando con la misma clase", () => {
  assert.equal(claseDelTramo("command"), claseDelTramo("command", "enviado").replace(" font-mono", ""));
  assert.match(claseDelTramo("command", "enviado"), /font-mono/);
  assert.notEqual(claseDelTramo("command"), claseDelTramo("recipient"));
});

test("las salidas nuevas de un comando salen del registro de pasos", () => {
  for (const meta of ["command_compacted", "command_failed", "command_empty", "command_running"]) {
    assert.equal(esSalidaDeComando(meta), true, meta);
  }
});
