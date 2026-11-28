import assert from "node:assert/strict";
import test from "node:test";
import { HOME, open, openTask, row, until } from "../helpers/desktop-account.mjs";

test("late tools after terminal remain inspectable without restarting activity", async () => {
  let active = true, stopAck;
  const fixture = await open("late-events-after-done", { computers: [HOME], extra: {
    list_active_turns: () => active ? ["t1"] : [],
    stop_turn: () => new Promise(resolve => { stopAck = resolve; }),
    list_live_sessions: () => [{ ...row("t1", "Late events"), turns: 2 }],
    load_session: () => ({ id: "t1", provider: "codex", sources: [], model: "gpt-5.6", turns: [
      { role: "user", id: "u", text: "input" },
      { role: "agent", id: "a", text: "Final response", duration_ms: 1500 },
    ] }),
  } });
  try {
    assert.ok(await until(() => fixture.doc.querySelector('[data-sesion="t1"]')));
    await openTask(fixture.app, "t1");
    const emit = (kind, text = "", extra = {}) => fixture.app.emit("chat", { session: "t1", workspace: "w", kind, text, ...extra });
    active = false; emit("done", "", { ok: true });
    assert.ok(await until(() => ![...fixture.doc.querySelectorAll("button")].some(button => button.getAttribute("aria-label") === "Detener turno")));
    emit("tool", "Read", { id: "late-tool", target: "late.txt" });
    assert.ok(await until(() => fixture.doc.querySelector("[data-chat-thread]")?.textContent.includes("Trabajo")));
    const header = [...fixture.doc.querySelectorAll("[data-activity-label]")].at(-1)?.closest("button");
    assert.ok(header); header.click();
    assert.ok(await until(() => fixture.doc.querySelector("[data-turn-activity-content]")?.textContent.includes("late.txt")));
    assert.equal(fixture.doc.querySelectorAll("[data-turn-activity-content] .animate-spin").length, 0,
      "a late event animated a tool after authoritative closure");
    emit("tool_done", "Read", { id: "late-tool", target: "late.txt", ok: true, detail: { kind: "output", text: "Late output remains inspectable" } });
    assert.ok(await until(() => fixture.doc.querySelectorAll("[data-turn-activity-content] [data-fila]").length === 1));
    fixture.doc.querySelector("[data-turn-activity-content] [data-fila]").click();
    assert.ok(await until(() => fixture.doc.querySelector("[data-turn-activity-content]")?.textContent.includes("Late output remains inspectable")));
    active = true; emit("started"); emit("tool", "Read", { id: "next-tool", target: "next.txt" });
    assert.ok(await until(() => [...fixture.doc.querySelectorAll("[data-turn-activity-anchor]")].at(-1)));
    const next = [...fixture.doc.querySelectorAll("[data-turn-activity-anchor]")].at(-1);
    next.querySelector("button[aria-expanded]").click();
    assert.ok(await until(() => next.querySelector("[data-turn-activity-content] .animate-spin")),
      "an actually started successor can animate its tool");
    const stop = [...fixture.doc.querySelectorAll("button")].find(button => button.getAttribute("aria-label") === "Detener turno");
    assert.ok(stop); stop.click();
    assert.ok(await until(() => next.querySelectorAll("[data-turn-activity-content] .animate-spin").length === 0),
      "requesting stop pauses nested tools while cancellation remains pending");
    assert.equal(typeof stopAck, "function");
  } finally { stopAck?.(null); fixture.app.w.close(); }
});

test("expanded tool and reasoning rows stay open when new tools arrive during a live turn", async () => {
  const fixture = await open("keep-expanded-tools-open", { computers: [HOME], extra: {
    list_active_turns: () => ["t1"],
    list_live_sessions: () => [{ ...row("t1", "Live tools"), turns: 1 }],
    load_session: () => ({ id: "t1", provider: "codex", sources: [], model: "gpt-5.6", turns: [
      { role: "user", id: "u1", text: "Run rclone" },
    ] }),
  } });
  try {
    assert.ok(await until(() => fixture.doc.querySelector('[data-sesion="t1"]')));
    await openTask(fixture.app, "t1");
    const emit = (kind, text = "", extra = {}) => fixture.app.emit("chat", { session: "t1", workspace: "w", kind, text, ...extra });

    emit("started");
    emit("reasoning", "Checking rclone path before authorizing.");
    emit("tool", "Bash", { id: "tool-1", target: "rclone authorize --help" });
    emit("tool_done", "Bash", {
      id: "tool-1",
      target: "rclone authorize --help",
      ok: true,
      detail: { kind: "output", text: "FIRST_TOOL_VISIBLE_OUTPUT" },
    });

    assert.ok(await until(() => fixture.doc.querySelector("[data-turn-activity-anchor] button[aria-expanded]")));
    const anchor = fixture.doc.querySelector("[data-turn-activity-anchor]");
    const outerToggle = anchor.querySelector("button[aria-expanded]");
    if (outerToggle.getAttribute("aria-expanded") !== "true") outerToggle.click();

    assert.ok(await until(() => anchor.querySelectorAll("[data-turn-activity-content] [data-fila]").length >= 2));
    const [reasoningBtn, firstToolBtn] = [...anchor.querySelectorAll("[data-turn-activity-content] [data-fila]")];
    reasoningBtn.click();
    firstToolBtn.click();

    assert.ok(await until(() =>
      anchor.querySelector("[data-reasoning-body]")?.textContent?.includes("Checking rclone path before authorizing.") &&
      anchor.querySelector("[data-turn-activity-content]")?.textContent?.includes("FIRST_TOOL_VISIBLE_OUTPUT"),
    ));

    // A new reasoning chunk and a new tool arrive while the user is inspecting the earlier rows.
    emit("reasoning", "Retrying authorization with headless flag.");
    emit("tool", "Bash", { id: "tool-2", target: "rclone authorize drive --auth-no-open-browser" });

    assert.ok(await until(() =>
      anchor.querySelector("[data-turn-activity-content]")?.textContent?.includes("rclone authorize drive --auth-no-open-browser"),
    ));

    // Both previously expanded rows must remain open without collapsing.
    const rowsAfter = [...anchor.querySelectorAll("[data-turn-activity-content] [data-fila]")];
    assert.equal(rowsAfter[0]?.getAttribute("aria-expanded"), "true", "previously expanded reasoning row collapsed on new tool");
    assert.equal(rowsAfter[1]?.getAttribute("aria-expanded"), "true", "previously expanded tool row collapsed on new tool");
    assert.ok(
      anchor.querySelector("[data-reasoning-body]")?.textContent?.includes("Checking rclone path before authorizing."),
      "previously expanded reasoning body disappeared on new tool",
    );
    assert.ok(
      anchor.querySelector("[data-turn-activity-content]")?.textContent?.includes("FIRST_TOOL_VISIBLE_OUTPUT"),
      "previously expanded tool output disappeared on new tool",
    );
  } finally { fixture.app.w.close(); }
});
