import assert from "node:assert/strict";
import test from "node:test";

import { comandoDeTerminal as commandOf, sangrarTerminal as indent } from "../../../packages/features/chat/src/model/terminalIndent.ts";

test("teclear `!` deja el cursor después de la sangría", () => {
  assert.deepEqual(indent("", "!", 1, "insertText"), { text: "!\t", caret: 2 });
});

test("un salto de línea en modo terminal llega sangrado", () => {
  assert.deepEqual(indent("!\tcd a", "!\tcd a\n", 7, "insertLineBreak"), { text: "!\tcd a\n\t", caret: 8 });
});

test("pegar varios comandos los alinea detrás del `!`", () => {
  assert.deepEqual(indent("!\t", "!\tcd a\ncd b\ncd c", 16, "insertFromPaste"), {
    text: "!\tcd a\n\tcd b\n\tcd c",
    caret: 18,
  });
});

test("poner `!` delante de comandos ya pegados los sangra todos", () => {
  assert.deepEqual(indent("cd a\ncd b", "!cd a\ncd b", 1, "insertText"), { text: "!\tcd a\n\tcd b", caret: 2 });
});

test("borrar la sangría tras el `!` sale del modo terminal", () => {
  assert.deepEqual(indent("!\t", "!", 1, "deleteContentBackward"), { text: "", caret: 0 });
  assert.deepEqual(indent("!\tcd a\n\tcd b", "!cd a\n\tcd b", 1, "deleteContentBackward"), { text: "cd a\ncd b", caret: 0 });
});

test("borrar la sangría de una línea la une con la anterior", () => {
  assert.deepEqual(indent("!\tcd a\n\tcd b", "!\tcd a\ncd b", 7, "deleteContentBackward"), { text: "!\tcd acd b", caret: 6 });
});

test("fuera del modo terminal el texto no se toca", () => {
  assert.deepEqual(indent("hola", "hola\n", 5, "insertLineBreak"), { text: "hola\n", caret: 5 });
});

test("el comando se corre sin el `!` ni la sangría", () => {
  assert.equal(commandOf("!\tcd a\n\tcd b"), "cd a\ncd b");
  assert.equal(commandOf("!ls"), "ls");
});
