/**
 * End-to-end UI test for folderless tasks (`project === ""`) with zero registered projects:
 * 1. A folderless task is shown in the rail without any project/folder.
 * 2. Opening it queries `session_usage` with `project: ""` (so context usage works for folderless tasks).
 * 3. Deleting it via `task_lifecycle_apply` immediately removes it from the rail even before
 *    the follow-up `list_live_sessions` returns, without creating phantom projects.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { alCerrar, cerrarTodo } from "../helpers/ai-providers-fixture.mjs";
import { boot, sleep } from "../helpers/jsdom-app.mjs";
import { responses } from "../helpers/push-fixture.mjs";

test.afterEach(cerrarTodo);

const waitFor = async (fn, label, ms = 4000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const v = fn();
    if (v) return v;
    await sleep(25);
  }
  throw new Error(`Timed out waiting for: ${label}`);
};

test("folderless task opens with session_usage and disappears immediately on delete with zero projects", async () => {
  const usageCalls = [];
  const projectCreates = [];
  let deleted = false;
  let releaseRefresh;
  const refreshBlocked = new Promise((resolve) => {
    releaseRefresh = resolve;
  });

  const row = (id) => ({
    id,
    title: `Folderless ${id}`,
    last_message: "Hola",
    provider: "codex",
    model: "gpt-5.6",
    refs: [],
    updated_at: 100,
    turns: 2,
    parent: null,
    esperando: false,
  });

  const app = await boot("listo", "cloud-folderless-ui", responses({
    list_projects: () => [],
    add_project: (args) => {
      projectCreates.push(args);
      return null;
    },
    list_live_sessions: async ({ project }) => {
      if (project !== "") return [];
      if (deleted) {
        await refreshBlocked;
        return [row("t2")];
      }
      return [row("t1"), row("t2")];
    },
    get_session: ({ project, id }) => ({
      id,
      project,
      provider: "codex",
      model: "gpt-5.6",
      messages: [
        { role: "user", text: "Hola", at: 1 },
        { role: "assistant", text: "Listo", at: 2 },
      ],
    }),
    session_usage: (args) => {
      usageCalls.push(args);
      return { input: 120, output: 45, limit: 200000 };
    },
    machine_list: [{ id: "local", local: true, active: true, on: true, hosts: true, features: ["task_lifecycle_v1"] }],
    task_lifecycle_preview: ({ project, id }) => ({
      members: [{
        workspace: "w",
        project,
        id,
        title: `Folderless ${id}`,
        working: false,
        files: [],
        inspection: { status: "complete" },
        integration: "none",
      }],
      consent: "snap-1",
    }),
    task_lifecycle_apply: ({ project, id }) => {
      deleted = true;
      return { status: "complete", applied: [{ project, id }], failures: [] };
    },
  }));

  const cerrar = alCerrar(() => {
    releaseRefresh();
    app.w.close();
  });

  try {
    const doc = app.w.document;
    const item = await waitFor(() => doc.querySelector('[data-sesion="t1"]'), "folderless task t1 in rail");
    assert.ok(doc.querySelector('[data-sesion="t2"]'), "second folderless task t2 in rail");

    // Open folderless task and verify session_usage is called with project === "".
    item.click();
    await waitFor(
      () => usageCalls.some((c) => c.session === "t1" && c.project === ""),
      "session_usage called for folderless task",
    );

    // Delete t1 while follow-up list_live_sessions is deliberately stalled.
    item.querySelector('[aria-haspopup="menu"]').click();
    const deleteItem = await waitFor(
      () => [...doc.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent.trim() === "Borrar la tarea"),
      "delete menu item",
    );
    deleteItem.click();
    const confirmBtn = await waitFor(
      () => [...(doc.querySelector("[data-session-confirm]")?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === "Borrar la tarea"),
      "confirm delete button",
    );
    confirmBtn.click();

    // Must disappear immediately from the rail BEFORE refreshBlocked resolves.
    await waitFor(() => !doc.querySelector('[data-sesion="t1"]'), "t1 removed optimistically from rail");
    assert.ok(doc.querySelector('[data-sesion="t2"]'), "t2 remains in rail");
    assert.deepEqual(projectCreates, [], "no phantom projects created");

    releaseRefresh();
    await sleep(60);
    assert.equal(doc.querySelector('[data-sesion="t1"]'), null, "t1 stays gone after refresh");
    assert.ok(doc.querySelector('[data-sesion="t2"]'), "t2 still present after refresh");
    assert.deepEqual(app.failures, []);
  } finally {
    cerrar();
  }
});
