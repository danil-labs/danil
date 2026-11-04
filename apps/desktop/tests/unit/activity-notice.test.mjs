import assert from "node:assert/strict";
import test from "node:test";
import { boot, sleep } from "../helpers/jsdom-app.mjs";

test("maintenance successes stay silent and dismissed failures are not replayed", async () => {
  const workspace = { workspaces: [{ id: "w", name: "W", context_root: null }], active: "w" };
  const app = await boot("listo", "activity-notice", {
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
  });
  await sleep(400);
  const notice = () => [...app.w.document.querySelectorAll('[role="status"]')].find(el => el.textContent.includes("Check installation"));
  const row = { workspace: "w", id: "check-1", title: "Check installation", machine: "Airm4" };
  const emit = async (state, extra = {}) => { app.emit("activity", { ...row, state, ...extra }); await sleep(30); };
  await emit("running");
  assert.equal(notice(), undefined);
  await emit("success");
  await emit("success");
  assert.equal(notice(), undefined);
  for (const id of ["check-2", "check-3"]) {
    await emit("running", { id });
    await emit("success", { id });
    assert.equal(notice(), undefined, "periodic checks with new ids also stay silent");
  }
  await emit("failure", { workspace: "another-workspace" });
  assert.equal(notice(), undefined);
  await emit("failure");
  assert.ok(notice(), "a failure still calls for attention");
  notice().querySelector('[aria-label="Cerrar el aviso"]').click();
  await emit("failure");
  assert.equal(notice(), undefined, "replayed failure stays dismissed");
  await emit("running");
  await emit("failure");
  assert.ok(notice(), "a new attempt can fail again");
  notice().querySelector('[aria-label="Cerrar el aviso"]').click();
  await emit("failure", { machine: "another-machine" });
  assert.ok(notice(), "machines have separate activity identities");
  notice().querySelector('[aria-label="Cerrar el aviso"]').click();
  await emit("interrupted");
  assert.ok(notice(), "an interruption still calls for attention");
  assert.deepEqual(app.failures, []);
});
