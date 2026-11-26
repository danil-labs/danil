/**
 * La tarea nueva nace en el primer envío. Lo que se ve tiene que ser eso: la
 * conversación nueva delante, su pestaña marcada y la tarea anterior atrás.
 *
 * Con el fallo, el envío creaba la tarea en el motor pero la tira y la vista
 * volvían a la tarea que estaba abierta antes: parecía que no se había creado.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { HOME, newTask, open, openTask, row, until, write } from "../helpers/desktop-account.mjs";
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
    assert.equal(doc.querySelector("[data-project-picker]"), null, "the folder picker stays hidden while the failed thread is shown");
    assert.equal(doc.querySelector("[data-composer-layer]")?.getAttribute("data-composer-layer"), "bottom", "the composer stays anchored at the bottom");

    [...doc.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith("Nueva tarea"))?.click();
    assert.ok(await until(() => doc.querySelector("[data-project-picker]")), "opening a fresh blank task cleanly restores the folder picker");
    assert.equal(doc.querySelector("[data-composer-layer]")?.getAttribute("data-composer-layer"), "centered", "the fresh blank task centers the composer again");
    assert.deepEqual(app.failures, []);
  } finally { app.w.close(); }
});

test("sending from new task hides the folder picker immediately and anchors the composer without remounting it during round-trip or adoption", async () => {
  let resolveSend;
  let markSendStarted;
  const waitSendStarted = new Promise((resolve) => { markSendStarted = resolve; });
  const sendResult = new Promise((resolve) => { resolveSend = resolve; });

  const fixture = await open("new-task-first-send-immediate-layout", { computers: [HOME], extra: {
    list_live_sessions: () => [{ ...row("t1", "Primera"), turns: 1 }, { ...row("t2", "Nueva"), turns: 1 }],
    load_session: ({ id }) => id === "t2"
      ? { id: "t2", provider: "codex", turns: [{ role: "user", id: "u2", text: "primer mensaje" }] }
      : { id: "t1", provider: "codex", turns: [{ role: "user", id: "u1", text: "hola" }, { role: "agent", id: "a1", text: "respuesta vieja", duration_ms: 10 }] },
    send_message: () => {
      markSendStarted();
      return sendResult;
    },
  } });
  const { app, doc } = fixture;
  try {
    assert.ok(await until(() => doc.querySelector('[data-sesion="t1"]')));
    await openTask(app, "t1");
    assert.ok(await until(() => doc.querySelector("[data-chat-thread]")?.textContent.includes("respuesta vieja")));

    await newTask(app);
    assert.ok(await until(() => doc.querySelector("[data-borrador]")), "the blank task is shown");
    assert.ok(doc.querySelector("[data-project-picker]"), "the folder picker is visible before sending");
    assert.equal(doc.querySelector("[data-composer-layer]")?.getAttribute("data-composer-layer"), "centered", "the composer starts centered");

    const field = doc.querySelector("textarea");
    field.value = "primer mensaje";
    field.dispatchEvent(new app.w.Event("input", { bubbles: true }));
    field.closest("form").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));

    // Immediately after submit — before `send_message` even resolves — the folder
    // picker must already be gone and the composer anchored at the bottom.
    assert.equal(doc.querySelector("[data-project-picker]"), null, "the folder picker disappears synchronously on send");
    assert.equal(doc.querySelector("[data-composer-layer]")?.getAttribute("data-composer-layer"), "bottom", "the composer anchors at the bottom immediately on send");
    assert.ok(doc.querySelector("[data-chat-thread]")?.textContent.includes("primer mensaje"), "the optimistic message is already rendered");

    await waitSendStarted;
    assert.equal(doc.querySelector("[data-project-picker]"), null, "the folder picker stays hidden while send_message is in flight");
    assert.equal(doc.querySelector("[data-composer-layer]")?.getAttribute("data-composer-layer"), "bottom", "the composer stays anchored while send_message is in flight");

    // Watch every DOM mutation during resolution and provisional -> real adoption
    // to confirm the folder picker never flashes back and the composer never re-centers.
    let pickerReappeared = false;
    let composerRecentered = false;
    const observer = new app.w.MutationObserver(() => {
      if (doc.querySelector("[data-project-picker]")) pickerReappeared = true;
      if (doc.querySelector('[data-composer-layer="centered"]')) composerRecentered = true;
    });
    observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-composer-layer"] });

    resolveSend("t2");
    assert.ok(await until(() => selected(doc)?.textContent?.includes("Nueva")), "the new task is adopted as active tab");
    await sleep(300);
    observer.disconnect();

    assert.equal(pickerReappeared, false, "the folder picker never reappears during round-trip or adoption");
    assert.equal(composerRecentered, false, "the composer never jumps back to centered during round-trip or adoption");
    assert.equal(doc.querySelector("[data-project-picker]"), null, "the folder picker remains hidden after adoption");
    assert.equal(doc.querySelector("[data-composer-layer]")?.getAttribute("data-composer-layer"), "bottom", "the composer remains anchored at the bottom after adoption");
    assert.deepEqual(app.failures, []);
  } finally { app.w.close(); }
});

test("slow first send with delayed started and empty initial load_session keeps the message and running turn visible", async () => {
  let resolveSend;
  let flushed = false;
  let active = false;
  const sendResult = new Promise((resolve) => { resolveSend = resolve; });

  const fixture = await open("new-task-first-send-delayed-start", { computers: [HOME], extra: {
    list_active_turns: () => active ? ["t2"] : [],
    list_live_sessions: () => [
      { ...row("t1", "Primera"), turns: 1 },
      ...(flushed ? [{ ...row("t2", "Hola mundo"), turns: 1 }] : []),
    ],
    load_session: ({ id }) => id === "t2"
      ? { id: "t2", provider: "codex", turns: flushed ? [{ role: "user", id: "u2", text: "Hola mundo" }] : [] }
      : { id: "t1", provider: "codex", turns: [{ role: "user", id: "u1", text: "hola" }, { role: "agent", id: "a1", text: "respuesta vieja", duration_ms: 10 }] },
    send_message: () => sendResult,
  } });
  const { app, doc } = fixture;
  try {
    assert.ok(await until(() => doc.querySelector('[data-sesion="t1"]')));
    await newTask(app);
    assert.ok(await until(() => doc.querySelector("[data-borrador]")));

    const field = doc.querySelector("textarea");
    field.value = "Hola mundo";
    field.dispatchEvent(new app.w.Event("input", { bubbles: true }));
    field.closest("form").dispatchEvent(new app.w.Event("submit", { bubbles: true, cancelable: true }));

    // While send_message is in flight, the provisional task is active in the rail and shows the message.
    assert.ok(doc.querySelector("[data-chat-thread]")?.textContent.includes("Hola mundo"), "user message is visible immediately");
    const provisionalRail = doc.querySelector('[data-sesion^="naciendo:"]');
    assert.ok(provisionalRail && (provisionalRail.getAttribute("aria-current") === "true" || provisionalRail.getAttribute("data-active") === "true"), "provisional row is highlighted in the rail");
    assert.equal(doc.querySelector("[data-project-picker]"), null, "folder picker is gone while sending");

    // send_message resolves BEFORE `started`, BEFORE `list_active_turns` includes t2,
    // and BEFORE `load_session` has flushed turns to disk.
    resolveSend("t2");
    await sleep(200);

    // Must NEVER snap back to blank "Nueva tarea" or drop the message/activity.
    assert.equal(doc.querySelector("[data-project-picker]"), null, "does not snap back to folder picker before started");
    assert.equal(doc.querySelector("[data-composer-layer]")?.getAttribute("data-composer-layer"), "bottom", "composer stays anchored at bottom");
    assert.ok(doc.querySelector("[data-chat-thread]")?.textContent.includes("Hola mundo"), "user message stays visible even when initial load_session is empty");
    assert.ok(doc.querySelector('button[aria-label="Detener turno"]'), "turn stays live until started/done instead of settling prematurely");

    // Later the engine finishes flushing and emits `started` + `done`.
    flushed = true;
    active = true;
    app.emit("chat", { session: "t2", workspace: "w", kind: "started", text: "" });
    assert.ok(await until(() => doc.querySelector("[data-chat-thread]")?.textContent.includes("Hola mundo")));
    active = false;
    app.emit("chat", { session: "t2", workspace: "w", kind: "done", text: "", ok: true });
    assert.ok(await until(() => !doc.querySelector('button[aria-label="Detener turno"]')));
    assert.deepEqual(app.failures, []);
  } finally { app.w.close(); }
});
