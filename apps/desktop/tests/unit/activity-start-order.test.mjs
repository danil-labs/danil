import assert from "node:assert/strict";
import test from "node:test";
import { HOME, open, openTask, row, until } from "../helpers/desktop-account.mjs";

test("output arriving before started joins a single activity and thinking resumes after tool completion", async () => {
  let active = false;
  const fixture = await open("activity-output-before-start", { computers: [HOME], extra: {
    list_active_turns: () => active ? ["t1"] : [],
    list_live_sessions: () => [{ ...row("t1", "Late start"), turns: 1 }],
    load_session: () => ({ id: "t1", provider: "codex", turns: [{ role: "user", id: "u1", text: "Question before stream" }] }),
  } });
  try {
    assert.ok(await until(() => fixture.doc.querySelector('[data-sesion="t1"]'))); await openTask(fixture.app, "t1");
    const emit = (kind, text = "", extra = {}) => fixture.app.emit("chat", { session: "t1", workspace: "w", kind, text, ...extra });
    emit("delta", "Output before lifecycle", { starts_message: true }); emit("tool", "Read", { id: "tool", target: "file.ts" });
    assert.ok(await until(() => fixture.doc.querySelector("[data-chat-thread]")?.textContent.includes("Output before lifecycle")));
    active = true; emit("started");
    assert.ok(await until(() => fixture.doc.querySelector("[data-turn-activity-anchor]")));
    assert.equal(fixture.doc.querySelectorAll("[data-chat-thread] .activity-caption-running").length, 1, "legacy output and the semantic turn must not animate as two turns");
    emit("tool_done", "Read", { id: "tool", ok: true });
    assert.ok(await until(() => /^(Pensando|Cavilando|Dándole vueltas|Atando cabos|Rumiando|Destilando|Puliendo la idea|Maquinando|Hilando fino|Tramando algo|Cocinando|Amasando)…$/.test(fixture.doc.querySelector("[data-chat-thread] .activity-caption-running")?.textContent ?? "")));
    assert.deepEqual(fixture.app.failures, []);
  } finally { fixture.app.w.close(); }
});


test("confirmed start without content or timestamp shows one thinking header and terminal clears busy", async () => {
  let active = false;
  const fixture = await open("activity-confirmed-empty", { computers: [HOME], extra: {
    list_active_turns: () => active ? ["t1"] : [],
    list_live_turns: () => [],
    list_live_sessions: () => [{ ...row("t1", "Confirmed empty start"), turns: 1 }],
    load_session: () => ({ id: "t1", provider: "codex", turns: [{ role: "user", id: "u1", text: "Hello" }] }),
  } });
  try {
    assert.ok(await until(() => fixture.doc.querySelector('[data-sesion="t1"]')));
    await openTask(fixture.app, "t1");
    active = true;
    fixture.app.emit("chat", { session: "t1", workspace: "w", kind: "started", text: "" });
    const label = () => fixture.doc.querySelector("[data-chat-thread] .activity-caption-running");
    assert.ok(await until(() => /^(Pensando|Cavilando|Dándole vueltas|Atando cabos|Rumiando|Destilando|Puliendo la idea|Maquinando|Hilando fino|Tramando algo|Cocinando|Amasando)…$/.test(label()?.textContent ?? "")));
    assert.equal(fixture.doc.querySelectorAll("[data-turn-activity-anchor]").length, 1);
    assert.equal(fixture.doc.querySelector("[data-turn-activity-anchor] .tabular-nums"), null, "unknown clock must stay unknown");
    active = false;
    fixture.app.emit("chat", { session: "t1", workspace: "w", kind: "done", text: "", ok: true });
    assert.ok(await until(() => !label()));
    assert.ok(await until(() => !fixture.doc.querySelector('button[aria-label="Detener turno"]')));
    assert.deepEqual(fixture.app.failures, []);
  } finally { fixture.app.w.close(); }
});
