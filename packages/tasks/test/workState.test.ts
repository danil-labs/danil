import assert from "node:assert/strict";
import { test } from "node:test";
import { WORK_STATUS_LABELS } from "../../design/src/index.ts";
import { applySidebarView, canFinishTask, DEFAULT_SIDEBAR_VIEW, groupKey, groupLabel, resolveTaskGit, sanitizeSidebarView, UNKNOWN_TASK_GIT, WORK_STATES, workStateOf, type TaskGit, type WorkState } from "../src/index.ts";

const git = (extra: Partial<TaskGit> = {}): TaskGit => ({
  kind: "branch", head: "current", branch: "work", has_remote: true,
  shared_with: null, pull: null, pull_known: true, stale: false, ...extra,
});
const pull = (state: "open" | "draft" | "closed" | "merged", head_sha = "current") => ({ number: 7, state, head_sha });

test("work state requires current evidence and confirmed pull presence or absence", () => {
  const cases: [TaskGit | null | undefined, WorkState][] = [
    [undefined, "unknown"], [null, "unknown"], [git({ kind: "none" }), "unknown"],
    [git({ kind: "unknown" }), "unknown"], [git({ stale: true }), "unknown"],
    [git({ head: null }), "unknown"], [git({ kind: "detached" }), "unknown"],
    [git({ pull_known: false }), "unknown"], [git({ pull_known: false, has_remote: undefined }), "unknown"],
    [git({ pull_known: false, has_remote: false }), "draft"], [git(), "draft"],
    ...(["open", "draft", "closed", "merged"] as const).map(state => [git({ pull: pull(state), pull_known: false }), "unknown"] as [TaskGit, WorkState]),
    [git({ pull: pull("open") }), "review"], [git({ pull: pull("draft") }), "draft"],
    [git({ pull: pull("closed") }), "closed"], [git({ pull: pull("merged") }), "ready"],
    [git({ pull: pull("merged", "old") }), "draft"], [git({ pull: pull("merged", "old"), head: null }), "unknown"],
    [git({ kind: "detached", pull: pull("merged") }), "unknown"],
    [git({ kind: "kn", kn: "clean" }), "draft"], [git({ kind: "kn", kn: "draft" }), "draft"],
    [git({ kind: "kn", kn: "saved" }), "ready"], [git({ kind: "kn", kn: null }), "unknown"],
    [git({ merged_locally: true }), "ready"], [git({ merged_locally: true, pull_known: false }), "unknown"],
    [git({ merged_locally: true, pull_known: false, has_remote: false }), "ready"],
    [git({ merged_locally: true, stale: true }), "unknown"],
  ];
  for (const [status, expected] of cases) {
    assert.equal(workStateOf(status), expected, JSON.stringify(status));
    assert.equal(workStateOf(status) === "ready", canFinishTask({}, status, false), "ready uses exactly the neutral finish evidence");
  }
  assert.equal(canFinishTask({ archived: true }, git({ pull: pull("merged") }), false), false);
  assert.equal(canFinishTask({}, git({ pull: pull("merged") }), true), false);
});

test("saved status preference changes meaning with stable group keys, order and pin rules", () => {
  const view = sanitizeSidebarView({ folders: [], agent: null, group: "status" });
  assert.equal(view.group, "status");
  const tasks = [
    { id: "u", esperando: true, git: undefined },
    { id: "c", esperando: false, git: git({ pull: pull("closed") }) },
    { id: "r", esperando: false, git: git({ pull: pull("merged") }) },
    { id: "v", esperando: false, git: git({ pull: pull("open") }) },
    { id: "d", esperando: false, git: git() },
    { id: "p", esperando: false, pinned: true, git: git() },
  ];
  const classify = (task: typeof tasks[number]) => workStateOf(task.git);
  const groups = applySidebarView(tasks, view, { live: ["r"], approving: ["c"], workStateOf: classify });
  assert.deepEqual(groups.map(groupKey), WORK_STATES.map(key => `status:${key}`));
  assert.deepEqual(groups[0].tasks.map(task => task.id), ["p", "d"]);
  for (const lang of ["es", "en"] as const) {
    assert.deepEqual(groups.map(group => groupLabel(lang, group, id => id)), WORK_STATES.map(key => WORK_STATUS_LABELS[lang][key]));
  }
  assert.deepEqual(applySidebarView(tasks, view, { live: [], approving: [], workStateOf: classify }), groups);
  assert.deepEqual(applySidebarView(tasks, DEFAULT_SIDEBAR_VIEW, { live: [], approving: [] }).flatMap(group => group.tasks).map(task => task.id), ["p", "u", "c", "r", "v", "d"]);
});

test("shared trees resolve before classification and saved own work wins", () => {
  const parent = { id: "parent" };
  const child = { id: "child", parent: "parent", subagent: "worker" };
  const rows = { parent: git({ pull: pull("merged") }), child: git({ shared_with: "parent" }) };
  const effective = resolveTaskGit(child, rows, [parent, child], UNKNOWN_TASK_GIT).status;
  assert.equal(workStateOf(effective), "ready");
  assert.equal(workStateOf(resolveTaskGit(child, { ...rows, child: git({ kind: "kn", kn: "saved", shared_with: "parent" }) }, [child, parent], UNKNOWN_TASK_GIT).status), "ready");
  assert.equal(workStateOf(resolveTaskGit(child, { child: git({ shared_with: "parent" }), parent: git({ shared_with: "child" }) }, [parent, child], UNKNOWN_TASK_GIT).status), "unknown");
});
