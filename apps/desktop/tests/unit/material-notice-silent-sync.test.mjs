import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

const workspace = { workspaces: [{ id: "w", name: "W", context_root: "src_root" }], active: "w" };

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

test("MaterialNotice invokes sync_workspace_context silently and never polls source_freshness or mounts a Toast", async () => {
  const syncCalls = [];
  let freshnessCalls = 0;
  const app = await boot("listo", "material-notice-silent", baseResponses({
    sync_workspace_context: (args) => {
      syncCalls.push(args);
      return Promise.reject(new Error("unsupported"));
    },
    source_freshness: () => {
      freshnessCalls += 1;
      return [{ id: "src_secondary", estado: "atrasada", local: "bbb" }];
    },
  }));
  await sleep(400);
  app.w.window.dispatchEvent(new app.w.CustomEvent("harness:tarea-nueva"));
  await sleep(100);

  assert.deepEqual(syncCalls, [{ force: false }]);
  assert.equal(freshnessCalls, 0, "retired secondary-source freshness polling must not run");
  assert.equal(app.w.document.querySelectorAll('[role="status"]').length, 0, "no material toast should mount");
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
