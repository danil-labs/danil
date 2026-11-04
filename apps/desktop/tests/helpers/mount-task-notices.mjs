import assert from "node:assert/strict";

export async function taskNoticeScenarios({ boot, sleep, responses }) {
  let delayed = null;
  let delayNext = false;
  const app = await boot("listo", "task-notices", {
    ...responses,
    list_workspace_attention: [],
    mark_task_seen: null,
    tray_notify: () => delayNext
      ? new Promise((resolve) => { delayed = resolve; delayNext = false; })
      : "focused",
    load_session: ({ id }) => ({ ...responses.load_session, id }),
    list_live_sessions: [responses.list_live_sessions[0], { ...responses.list_live_sessions[0], id: "s2", title: "Segunda tarea" }],
  });
  try {
    const doc = app.w.document;
    const toast = () => doc.querySelector('[data-task-notice="failed"]');
    const calls = () => app.commands.filter((c) => c === "tray_notify").length;
    const attention = (tasks) => app.emit("attention", [{ workspace: "w", tasks }]);
    const failure = { session: "s1", project: "", state: "failed" };
    const click = async (id) => {
      const row = doc.querySelector(`[data-sesion="${id}"]`);
      assert.ok(row, `task ${id} is available`);
      row.click();
      await sleep(120);
    };
    await sleep(200);
    attention([failure]);
    await sleep(50);
    assert.ok(toast(), "a new failure outside the task shows a toast");
    const announced = calls();
    attention([failure]);
    await sleep(30);
    assert.equal(calls(), announced, "identical attention does not repeat the toast");
    await click("s1");
    assert.equal(toast(), null, "opening the task from the rail dismisses its toast");
    const preview = doc.querySelector('[data-preview-header] [role="button"]');
    assert.ok(preview, "the opened task starts as a temporary view");
    const userAgent = app.w.navigator.userAgent;
    Object.defineProperty(app.w.navigator, "userAgent", { value: "Windows", configurable: true });
    const maximizes = () => app.commands.filter((c) => c === "plugin:window|toggle_maximize").length;
    const beforePin = maximizes();
    preview.dispatchEvent(new app.w.MouseEvent("dblclick", { bubbles: true }));
    await sleep(30);
    assert.equal(maximizes(), beforePin, "retaining a task does not maximize the Windows window");
    const header = doc.querySelector("[data-tauri-drag-region]");
    assert.ok(header, "the window header is available");
    header.dispatchEvent(new app.w.MouseEvent("dblclick", { bubbles: true }));
    await sleep(30);
    assert.equal(maximizes(), beforePin + 1, "double-clicking the Windows header still maximizes");
    Object.defineProperty(app.w.navigator, "userAgent", { value: userAgent, configurable: true });
    assert.ok(doc.querySelector('[role="tab"][data-pestana="0"]'), "the task is retained before opening a second view");
    await click("s2");
    attention([]);
    attention([failure]);
    await sleep(50);
    assert.equal(toast(), null, "the same failure returning in attention stays acknowledged");
    assert.equal(calls(), announced, "the same failure does not notify the OS again");

    app.emit("chat", { workspace: "w", session: "s1", kind: "started" });
    attention([failure]);
    await sleep(30);
    assert.equal(toast(), null, "the old failed snapshot during a retry is not a new error");
    attention([]);
    attention([failure]);
    await sleep(50);
    assert.ok(toast(), "a new attempt can notify a new failure");
    doc.querySelector('[role="tab"][data-pestana="0"]').click();
    await sleep(120);
    assert.equal(toast(), null, "switching to the task tab also dismisses its toast");
    await click("s2");
    app.emit("chat", { workspace: "w", session: "s1", kind: "started" });
    attention([]);
    attention([failure]);
    await sleep(50);
    assert.ok(toast());
    toast().querySelector('button[aria-label]').click();
    attention([]);
    attention([failure]);
    await sleep(50);
    assert.equal(toast(), null, "manual dismissal also survives repeated attention");

    app.emit("chat", { workspace: "w", session: "s1", kind: "started" });
    attention([]);
    delayNext = true;
    attention([failure]);
    await sleep(30);
    assert.ok(delayed, "the native notification is pending");
    await click("s1");
    await click("s2");
    delayed("focused");
    await sleep(50);
    assert.equal(toast(), null, "a late native answer cannot resurrect an acknowledged toast");

    app.emit("chat", { workspace: "w", session: "s1", kind: "started" });
    attention([]);
    delayNext = true;
    attention([failure]);
    await sleep(30);
    attention([]);
    delayed("focused");
    await sleep(50);
    assert.equal(toast(), null, "a resolved failure cannot appear after the native answer");

    await click("s1");
    app.emit("chat", { workspace: "w", session: "s1", kind: "started" });
    attention([]);
    attention([failure]);
    await sleep(50);
    assert.equal(toast(), null);
    assert.deepEqual(app.failures, []);
  } finally {
    app.w.close();
  }
}
