import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const workspace = { workspaces: [{ id: "w", name: "W", context_root: "src_root" }], active: "w" };

function source(id, etiqueta, root) {
  return {
    id,
    kind: "git",
    identity: `git:${id}`,
    name: id,
    location: `https://example.com/${id}.git`,
    branch: "main",
    etiqueta,
    parent: null,
    skills: false,
    added_at: 1,
    path: `/lab/${id}`,
    missing: false,
    root,
    project_attachable: !root,
    projects: [],
    sessions: 0,
  };
}

function baseResponses(overrides = {}) {
  return {
    window_ready: null,
    window_vitals: null,
    setup_required: false,
    list_providers: [],
    list_projects: [],
    list_sources: [],
    list_live_sessions: [],
    list_live_turns: [],
    list_surfaces: [],
    service_poll: { cursor: 0, gap: false, replay: false, runtime: "fixture", reset: false },
    list_workspaces: workspace,
    workspaces_startup: workspace,
    ...overrides,
  };
}

test("MaterialNotice shows only secondary sources and invokes sync_workspace_context silently even on rejection", async () => {
  const syncCalls = [];
  const updated = [];
  const app = await boot("listo", "material-notice-mixed", baseResponses({
    sync_workspace_context: (args) => {
      syncCalls.push(args);
      return Promise.reject(new Error("unsupported"));
    },
    source_freshness: [
      { id: "src_root", estado: "atrasada", local: "aaa" },
      { id: "src_secondary", estado: "atrasada", local: "bbb" },
    ],
    list_sources: [
      source("src_root", "danil-workspace (main)", true),
      source("src_secondary", "secondary-repo (dev)", false),
    ],
    update_source: (args) => {
      updated.push(args);
      return null;
    },
  }));
  await sleep(400);
  app.w.window.dispatchEvent(new app.w.CustomEvent("harness:tarea-nueva"));
  await sleep(100);

  assert.deepEqual(syncCalls, [{ force: false }]);
  const status = [...app.w.document.querySelectorAll('[role="status"]')];
  assert.equal(status.length, 1, "only one material toast should mount");
  assert.ok(status[0].textContent.includes("secondary-repo (dev)"), "secondary source appears in toast");
  assert.ok(!status[0].textContent.includes("danil-workspace (main)"), "root source must not appear in toast");

  const fetchButton = [...status[0].querySelectorAll("button")].find((btn) => /traer|fetch/i.test(btn.textContent ?? ""));
  assert.ok(fetchButton, "fetch button should be present");
  fetchButton.click();
  await sleep(100);
  assert.deepEqual(updated, [{ id: "src_secondary" }], "fetching only updates secondary sources");
  assert.deepEqual(app.failures, []);
});

test("MaterialNotice never mounts Toast when only the root source is outdated", async () => {
  const syncCalls = [];
  const app = await boot("listo", "material-notice-root-only", baseResponses({
    sync_workspace_context: (args) => {
      syncCalls.push(args);
      return { updated: false };
    },
    source_freshness: [
      { id: "src_root", estado: "atrasada", local: "aaa" },
    ],
    list_sources: [
      source("src_root", "danil-workspace (main)", true),
    ],
  }));
  await sleep(400);
  app.w.window.dispatchEvent(new app.w.CustomEvent("harness:tarea-nueva"));
  await sleep(100);

  assert.deepEqual(syncCalls, [{ force: false }]);
  const status = [...app.w.document.querySelectorAll('[role="status"]')];
  assert.equal(status.length, 0, "toast must not mount when only root source is outdated");
  assert.deepEqual(app.failures, []);
});

test("service-listeners dispatches harness:sources on sources-updated only for the active workspace", async () => {
  const app = await boot("listo", "service-listeners-sources-updated", baseResponses());
  await sleep(400);

  let refreshes = 0;
  app.w.window.addEventListener("harness:sources", () => {
    refreshes += 1;
  });

  app.emit("sources-updated", { workspace: "other-workspace", source: "src_root", commit: "1111111" });
  await sleep(50);
  assert.equal(refreshes, 0, "other workspace events are ignored");

  app.emit("sources-updated", { workspace: "w", source: "src_root", commit: "2222222" });
  await sleep(50);
  assert.equal(refreshes, 1, "active workspace event triggers harness:sources");

  assert.deepEqual(app.failures, []);
});
