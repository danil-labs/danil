/**
 * La tarea nueva nace en el primer envío. Lo que se ve tiene que ser eso: la
 * conversación nueva delante, su pestaña marcada y la tarea anterior atrás.
 *
 * Con el fallo, el envío creaba la tarea en el motor pero la tira y la vista
 * volvían a la tarea que estaba abierta antes: parecía que no se había creado.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { HOME, open, openTask, row, until, write } from "../helpers/desktop-account.mjs";
import { sleep } from "../helpers/jsdom-app.mjs";

const selected = (doc) => doc.querySelector("[data-tab-scroll] [aria-selected=true]");
const tabOf = (doc, text) => [...doc.querySelectorAll("[data-tab-scroll] [data-envoltorio]")]
  .find((n) => n.textContent?.includes(text));

test("the first send of a new task brings the new task to the front", async () => {
  const sent = [];
  const fixture = await open("new-task-first-send", { computers: [HOME], extra: {
    list_live_sessions: () => [{ ...row("t1", "Primera"), turns: 1 }, { ...row("t2", "Nueva"), turns: 1 }],
    load_session: ({ id }) => id === "t2"
      ? { id: "t2", provider: "codex", turns: [{ role: "user", id: "u2", text: "nueva" }] }
      : { id: "t1", provider: "codex", turns: [{ role: "user", id: "u1", text: "hola" }, { role: "agent", id: "a1", text: "respuesta vieja", duration_ms: 10 }] },
    send_message: (args) => { sent.push(args); return "t2"; },
  } });
  const { app, doc } = fixture;
  try {
    assert.ok(await until(() => doc.querySelector('[data-sesion="t1"]')));
    await openTask(app, "t1");
    assert.ok(await until(() => doc.querySelector("[data-chat-thread]")?.textContent.includes("respuesta vieja")));

    [...doc.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith("Nueva tarea"))?.click();
    assert.ok(await until(() => doc.querySelector("[data-borrador]")), "the blank task is shown");
    assert.equal(doc.querySelector("[data-chat-thread]")?.textContent?.includes("respuesta vieja"), false, "the previous task left the view");

    await write(app, "nueva");
    assert.ok(await until(() => sent.length === 1), "the first message is sent");
    assert.ok(sent[0].session === null || sent[0].session === undefined, "the first message is not routed to the previous task");
    assert.equal(sent[0].project, "p1");

    assert.ok(await until(() => doc.querySelector("[data-chat-thread]")?.textContent.includes("nueva") && !doc.querySelector("[data-chat-thread]")?.textContent.includes("respuesta vieja")),
      "the new task owns the conversation");
    assert.ok(await until(() => selected(doc)?.textContent?.includes("Nueva")), "the new task is the active tab");
    assert.equal(tabOf(doc, "Primera")?.querySelector("[aria-selected=true]") ?? null, null, "the previous task is not the active tab");
    const rail = doc.querySelector('[data-sesion="t2"]');
    assert.ok(rail && (rail.getAttribute("aria-current") === "true" || rail.getAttribute("data-active") === "true"), "the new task is the active row");
    await sleep(300);
    assert.deepEqual(app.failures, []);
  } finally { app.w.close(); }
});

test("a failed first send keeps the blank and returns the text instead of going back", async () => {
  const fixture = await open("new-task-first-send-fails", { computers: [HOME], extra: {
    list_live_sessions: () => [{ ...row("t1", "Primera"), turns: 1 }],
    load_session: () => ({ id: "t1", provider: "codex", turns: [{ role: "user", id: "u1", text: "hola" }, { role: "agent", id: "a1", text: "respuesta vieja", duration_ms: 10 }] }),
    send_message: () => { throw new Error("sin modelo"); },
  } });
  const { app, doc } = fixture;
  try {
    assert.ok(await until(() => doc.querySelector('[data-sesion="t1"]')));
    await openTask(app, "t1");
    assert.ok(await until(() => doc.querySelector("[data-chat-thread]")?.textContent.includes("respuesta vieja")));
    [...doc.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith("Nueva tarea"))?.click();
    assert.ok(await until(() => doc.querySelector("[data-borrador]")));
    await write(app, "nueva");
    assert.ok(await until(() => doc.querySelector("textarea")?.value === "nueva"), "the text returns to the composer");
    assert.ok(await until(() => doc.querySelector("[data-borrador]")), "the blank stays in front");
    assert.equal(doc.querySelector("[data-chat-thread]")?.textContent?.includes("respuesta vieja"), false, "the previous task stays out of the view");
    assert.ok(await until(() => doc.body.textContent.includes("sin modelo")), "the failure is visible");
    assert.deepEqual(app.failures, []);
  } finally { app.w.close(); }
});
