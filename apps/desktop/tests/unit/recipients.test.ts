import assert from "node:assert/strict";
import test from "node:test";

import "../helpers/catalog.ts";
import { transcripcion } from "../../../../packages/features/chat/src/model/transcript.ts";
import { aplicarLenguaDeWorkspace, t } from "../../src/lib/i18n.ts";

import {
  insertMention,
  insertRecipient,
  type Recipient,
  type RecipientDraft,
  recipientLabel,
  trimDraft,
} from "../../src/lib/recipients.ts";
import { highlightSpans, type TaskMention } from "../../src/lib/taskMentions.ts";

const SIN_COMANDOS = new Set<string>();

function tarea(start: number, text: string): TaskMention {
  return { target: { kind: "task", projectId: "p1", sessionId: "s1" }, start, end: start + text.length, text };
}

function encargado(name: string, start: number, text: string): Recipient {
  return { name, start, end: start + text.length, text };
}

test("un destinatario se pinta de otra clase que el material", () => {
  const text = "mira @arquitecto esto de @tarea-uno ya";
  const spans = highlightSpans(text, [tarea(25, "@tarea-uno")], SIN_COMANDOS, [encargado("arquitecto", 5, "@arquitecto")]);
  assert.deepEqual(spans, [
    { text: "mira ", kind: null },
    { text: "@arquitecto", kind: "recipient" },
    { text: " esto de ", kind: null },
    { text: "@tarea-uno", kind: "mention" },
    { text: " ya", kind: null },
  ]);
  assert.equal(spans.map(s => s.text).join(""), text);
});

test("dos clases sobre el mismo tramo no pintan dos veces", () => {
  const text = "@arquitecto vino";
  const spans = highlightSpans(text, [tarea(0, "@arquitecto")], SIN_COMANDOS, [encargado("arquitecto", 0, "@arquitecto")]);
  assert.equal(spans.filter(s => s.kind).length, 1);
  assert.equal(spans.map(s => s.text).join(""), text);
});

test("insertar un destinatario corre el material que quedaba detrás", () => {
  const before: RecipientDraft = {
    text: "@ @tarea-uno",
    task_mentions: [tarea(2, "@tarea-uno")],
    recipients: [],
  };
  const next = insertRecipient(before, { kind: "@", from: 0, to: 1, query: "" }, "arquitecto", recipientLabel("arquitecto"));
  assert.equal(next.text, "@arquitecto  @tarea-uno");
  assert.deepEqual(next.recipients, [encargado("arquitecto", 0, "@arquitecto")]);
  assert.deepEqual(next.task_mentions, [tarea(13, "@tarea-uno")]);
});

test("insertar material corre al destinatario que quedaba detrás", () => {
  const before: RecipientDraft = {
    text: "@ @arquitecto",
    task_mentions: [],
    recipients: [encargado("arquitecto", 2, "@arquitecto")],
  };
  const next = insertMention(
    before,
    { kind: "@", from: 0, to: 1, query: "" },
    { kind: "task", projectId: "p1", sessionId: "s1" },
    "@tarea-uno",
  );
  assert.equal(next.text, "@tarea-uno  @arquitecto");
  assert.deepEqual(next.task_mentions, [tarea(0, "@tarea-uno")]);
  assert.deepEqual(next.recipients, [encargado("arquitecto", 12, "@arquitecto")]);
});

test("recortar los extremos deja los dos tipos de intervalo donde están", () => {
  const before: RecipientDraft = {
    text: "  @arquitecto y @tarea-uno  ",
    task_mentions: [tarea(16, "@tarea-uno")],
    recipients: [encargado("arquitecto", 2, "@arquitecto")],
  };
  const next = trimDraft(before);
  assert.equal(next.text, "@arquitecto y @tarea-uno");
  assert.equal(next.text.slice(next.recipients?.[0].start, next.recipients?.[0].end), "@arquitecto");
  assert.equal(next.text.slice(next.task_mentions?.[0].start, next.task_mentions?.[0].end), "@tarea-uno");
});

/**
 * La fila de reenvío la compone la ventana, y tiene que decir el salto.
 *
 * Los saltos entre encargados sustituyen al tope: no se limitan, se ven
 * (`docs/specs/handler-mentions.md`). Las filas de entrega, recibo y
 * respuesta lo traen en la prosa que manda Rust; ésta no trae prosa ninguna.
 */
test("la fila de reenvío nombra a los dos y cuenta el salto, en las dos lenguas", () => {
  for (const lengua of ["es", "en"]) {
    aplicarLenguaDeWorkspace(lengua);
    const fila = t("chat.recipients.forwarded", { from: "arquitecto", to: "revisor", hops: 3 });
    assert.match(fila, /arquitecto/);
    assert.match(fila, /revisor/);
    assert.match(fila, /3/, `la fila de reenvío en ${lengua} no dice cuántos saltos lleva`);
    assert.doesNotMatch(fila, /[{}]/, `un placeholder sin dato se pinta a pelo en ${lengua}`);
  }
  aplicarLenguaDeWorkspace("es");
});

/**
 * El sobre se relee del disco con el turno. Rust lo guarda desde el primer
 * commit de esta rama; lo que faltaba era copiarlo aquí, y sin ello la fila de
 * reenvío se queda muda y el globo no dice a quién se entregó.
 */
test("la transcripción conserva a quién se entregó, dónde se contesta y el salto", () => {
  const [entregado] = transcripcion([
    {
      role: "user",
      id: "u1",
      text: "@arquitecto revisa",
      recipients: [{ name: "arquitecto", start: 0, end: 11, text: "@arquitecto" }],
      reply_to: { folder: "p1", task: "t9" },
      hops: 2,
    },
  ]);
  assert.deepEqual(entregado.recipients?.map((r) => r.name), ["arquitecto"]);
  assert.deepEqual(entregado.reply_to, { folder: "p1", task: "t9" });
  assert.equal(entregado.hops, 2);
  // Un turno de siempre no inventa sobre: ausente no es «sin destinatarios».
  const [suelto] = transcripcion([{ role: "user", id: "u2", text: "hola" }]);
  assert.equal(suelto.recipients, undefined);
  assert.equal(suelto.reply_to, undefined);
  assert.equal(suelto.hops, undefined);
});

// Un mensaje de otra tarea se relee con su remitente: sin él sale a la derecha
// como si lo hubiera escrito la persona.
test("the transcript keeps the task that sent a message", () => {
  const sender = { folder: "p1", task: "t3", title: "Revisa el PR", provider: "codex", model: "gpt-6-sol" };
  const [fromTask] = transcripcion([
    { role: "user", id: "u1", text: "¿terminaste?", from_task: sender },
  ]);
  assert.deepEqual(fromTask.fromTask, sender);
  const [person] = transcripcion([{ role: "user", id: "u2", text: "hola" }]);
  assert.equal(person.fromTask, undefined);
});

test("a message the person wrote through a channel carries no encargado", () => {
  const [byChannel] = transcripcion([
    { role: "user", id: "u1", text: "hola", channel: "Telegram" },
  ]);
  assert.equal(byChannel.channel, "Telegram");
  assert.equal(byChannel.encargado, undefined);
  const [fromEncargado] = transcripcion([
    { role: "user", id: "u2", text: "revisa", agent: "reviewer" },
  ]);
  assert.equal(fromEncargado.encargado, "reviewer");
  assert.equal(fromEncargado.channel, undefined);
});
