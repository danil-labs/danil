import assert from "node:assert/strict";
import test from "node:test";
import { HOME, open, openTask, row, until } from "../helpers/desktop-account.mjs";

const FIRST = "Voy a revisar el archivo público.";
const SECOND = "Ya comprobé el resultado público.";
const FINAL = "La respuesta final está lista.";
const REASONING = "Razonamiento separado de los mensajes públicos.";
const human = { role: "user", id: "question", text: "Revisa el archivo." };
const saved = { role: "agent", id: "answer", text: FINAL, duration_ms: 1500,
  tools: [{ name: "Read", target: "src/first.ts", ok: true }, { name: "Read", target: "src/second.ts", ok: true }],
  pieces: [{ text: FIRST }, { tool: 0 }, { text: SECOND }, { tool: 1 }, { text: FINAL }],
  reasoning: [{ text: REASONING, before_piece: 0 }],
};

function publicMessages(doc) {
  const thread = doc.querySelector("[data-chat-thread]");
  for (const text of [FIRST, SECOND, FINAL]) {
    const paragraphs = [...thread.querySelectorAll("p")].filter(node => node.textContent === text);
    assert.equal(paragraphs.length, 1, `public message appears once with activity closed: ${text}`);
    assert.equal(paragraphs[0].closest("[data-turn-activity-content]"), null);
  }
  const text = thread.textContent;
  assert.ok(text.indexOf(FIRST) < text.indexOf(SECOND));
  assert.ok(text.indexOf(SECOND) < text.indexOf(FINAL));
}

for (const streaming of [false, true]) test(`public messages remain outside activity after ${streaming ? "live delivery and settlement" : "opening saved history"}`, async () => {
  let turns = streaming ? [human] : [human, saved];
  const fixture = await open(`public-progress-${streaming}`, { computers: [HOME], extra: {
    list_live_sessions: () => [{ ...row("t1", "Mensajes públicos"), turns: turns.length }],
    load_session: () => ({ id: "t1", provider: "codex", sources: [], model: "gpt-5.6", turns }),
  } });
  try {
    assert.ok(await until(() => fixture.doc.querySelector('[data-sesion="t1"]')));
    await openTask(fixture.app, "t1");
    if (streaming) {
      const emit = (kind, text = "", extra = {}) => fixture.app.emit("chat", { session: "t1", workspace: "w", kind, text, ...extra });
      emit("started"); emit("reasoning", REASONING, { message_id: "first" });
      emit("delta", FIRST, { starts_message: true, message_id: "first" });
      emit("tool", "Read", { id: "one", target: "src/first.ts" }); emit("tool_done", "Read", { id: "one", ok: true });
      emit("delta", SECOND, { starts_message: true, message_id: "second" });
      emit("tool", "Read", { id: "two", target: "src/second.ts" }); emit("tool_done", "Read", { id: "two", ok: true });
      emit("delta", FINAL, { starts_message: true, message_id: "final" });
      assert.ok(await until(() => fixture.doc.querySelector("[data-chat-thread]")?.textContent.includes(FINAL)));
      publicMessages(fixture.doc);
      turns = [human, saved]; emit("segment_saved", "", { id: "answer" }); emit("done", "", { ok: true });
    }
    assert.ok(await until(() => fixture.doc.querySelector("[data-chat-thread]")?.textContent.includes(FINAL)));
    publicMessages(fixture.doc);
    assert.ok(await until(() => fixture.doc.querySelector("[data-activity-label]")?.textContent === "Trabajó durante 1s"), "settled activity uses saved duration before reopening");
    const disclosure = fixture.doc.querySelector("[data-activity-label]")?.closest("button");
    assert.ok(disclosure, "tools and reasoning retain their activity disclosure");
    if (!streaming) assert.equal(disclosure.textContent, "Trabajó durante 1s");
    assert.equal(disclosure.getAttribute("aria-expanded"), "false"); disclosure.click();
    assert.ok(await until(() => fixture.doc.querySelector("[data-turn-activity-content] [data-reasoning-content]")));
    const panel = fixture.doc.querySelector("[data-turn-activity-content]");
    const reasoningToggle = panel.querySelector("[data-reasoning-content] button[data-fila]");
    assert.ok(reasoningToggle, "reasoning renders as a collapsible row like tools");
    assert.equal(reasoningToggle.textContent?.trim(), "Razonó");
    assert.equal(reasoningToggle.getAttribute("aria-expanded"), "false");
    assert.equal(panel.textContent.includes(REASONING), false, "reasoning body stays collapsed until clicked");
    reasoningToggle.click();
    assert.ok(await until(() => panel.querySelector("[data-reasoning-body]")?.textContent.includes(REASONING)));
    assert.equal(reasoningToggle.getAttribute("aria-expanded"), "true");
    assert.ok(panel.textContent.includes("first.ts")); assert.ok(panel.textContent.includes("second.ts"));
    for (const text of [FIRST, SECOND, FINAL]) assert.equal(panel.textContent.includes(text), false);
    publicMessages(fixture.doc);
    disclosure.click();
    assert.ok(await until(() => !fixture.doc.querySelector("[data-turn-activity-content]")), "completed activity closes");
    disclosure.click();
    assert.ok(await until(() => fixture.doc.querySelector("[data-turn-activity-content]")?.textContent.includes("first.ts")), "completed activity can reopen repeatedly");
    assert.deepEqual(fixture.app.failures, []);
  } finally { fixture.app.w.close(); }
});

test("filtered internal tools show plain duration without an empty disclosure", async () => {
  const filtered = { ...saved, reasoning: [], tools: [{ name: "Read", target: "/lab/.preguntas.json", ok: true }], pieces: [{ text: FIRST }, { tool: 0 }, { text: FINAL }] };
  const fixture = await open("public-progress-no-internal-content", { computers: [HOME], extra: {
    list_live_sessions: () => [{ ...row("t1", "Mensajes sin herramientas visibles"), turns: 2 }],
    load_session: () => ({ id: "t1", provider: "codex", sources: [], model: "gpt-5.6", turns: [human, filtered] }),
  } });
  try {
    assert.ok(await until(() => fixture.doc.querySelector('[data-sesion="t1"]'))); await openTask(fixture.app, "t1");
    assert.ok(await until(() => fixture.doc.querySelector("[data-chat-thread]")?.textContent.includes(FINAL)));
    const thread = fixture.doc.querySelector("[data-chat-thread]");
    assert.ok(thread.textContent.includes(FIRST));
    const label = thread.querySelector("[data-activity-label]");
    assert.equal(label?.textContent, "Trabajó durante 1s");
    assert.equal(label?.closest("button"), null, "no empty disclosure button when all tools were internal");
    assert.equal(thread.textContent.includes(".preguntas.json"), false);
    assert.deepEqual(fixture.app.failures, []);
  } finally { fixture.app.w.close(); }
});


test("a finished duration without tools or reasoning renders as plain text without a disclosure", async () => {
  const fixture = await open("finished-duration-only", { computers: [HOME], extra: {
    list_live_sessions: () => [{ ...row("t1", "Duración sin detalles"), turns: 2 }],
    load_session: () => ({ id: "t1", provider: "codex", sources: [], model: "gpt-5.6", turns: [human, { role: "agent", id: "answer", text: FINAL, duration_ms: 1500 }] }),
  } });
  try {
    assert.ok(await until(() => fixture.doc.querySelector('[data-sesion="t1"]'))); await openTask(fixture.app, "t1");
    assert.ok(await until(() => fixture.doc.querySelector("[data-chat-thread]")?.textContent.includes(FINAL)));
    const label = fixture.doc.querySelector("[data-activity-label]");
    assert.equal(label?.textContent, "Trabajó durante 1s");
    assert.equal(label?.closest("button"), null, "finished duration without tools or reasoning must not show an empty dropdown");
    assert.equal(fixture.doc.querySelector("[data-turn-activity-content]"), null);
    assert.deepEqual(fixture.app.failures, []);
  } finally { fixture.app.w.close(); }
});
