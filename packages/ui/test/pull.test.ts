import assert from "node:assert/strict";
import { test } from "node:test";
import { cardPull, type TaskGit } from "../src/lib/tasks.ts";

const git = (pull: Partial<NonNullable<TaskGit["pull"]>> = {}, rest: Partial<TaskGit> = {}): TaskGit => ({
  head: "abc",
  shared_with: null,
  pull: { number: 42, state: "open", head_sha: "abc", ...pull },
  pull_known: true,
  stale: false,
  ...rest,
});

test("sin git, sin PR o sin confirmar no hay chip", () => {
  assert.equal(cardPull(null), null);
  assert.equal(cardPull(git({}, { pull: null })), null);
  assert.equal(cardPull(git({}, { pull_known: false })), null);
});

test("el PR de quien comparte el árbol se dice en la fila de la dueña", () => {
  assert.equal(cardPull(git({}, { shared_with: "padre" })), null);
});

test("el color sigue al estado del PR", () => {
  assert.deepEqual(cardPull(git()), { number: 42, state: "open", tone: "open", numberTone: "open" });
  assert.equal(cardPull(git({ state: "draft" }))?.tone, "muted");
  assert.equal(cardPull(git({ state: "closed" }))?.tone, "closed");
  assert.equal(cardPull(git({ state: "merged" }))?.tone, "merged");
  const otherHead = cardPull(git({ state: "merged", head_sha: "viejo" }));
  assert.equal(otherHead?.state, "merged_other_head");
  assert.equal(otherHead?.tone, "muted");
});

test("CI fallido: el número en rojo, solo si es del HEAD de ahora", () => {
  const failing = cardPull(git({ checks: "failure" }));
  assert.equal(failing?.numberTone, "failure");
  assert.equal(failing?.tone, "open");
  assert.equal(cardPull(git({ checks: "failure", head_sha: "otro" }))?.numberTone, "open");
  assert.equal(cardPull(git({ checks: "success" }))?.numberTone, "open");
});

test("git viejo: el número sigue, pero en gris y sin rojo", () => {
  const stale = cardPull(git({ checks: "failure" }, { stale: true }));
  assert.equal(stale?.number, 42);
  assert.equal(stale?.tone, "muted");
  assert.equal(stale?.numberTone, "muted");
});

test("finalizar requiere la revisión integrada exacta y un estado vigente", async () => {
  const { canFinishTask } = await import("../src/lib/tasks.ts");
  const merged = git({ state: "merged" }, { kind: "branch" });
  assert.equal(canFinishTask({}, merged, false), true);
  for (const status of [git({}, { kind: "branch" }), { ...merged, head: "nuevo" }, { ...merged, stale: true }, { ...merged, pull_known: false }, undefined]) {
    assert.equal(canFinishTask({}, status, false), false);
  }
  assert.equal(canFinishTask({}, merged, true), false);
  assert.equal(canFinishTask({ archived: true }, merged, false), false);
  assert.equal(canFinishTask({}, { ...merged, pull: null, merged_locally: true, has_remote: false }, false), true);
  assert.equal(canFinishTask({}, { ...merged, kind: "kn", kn: "saved" }, false), true);
});

test("una subtarea hereda el Git de su dueña conservando la carpeta compartida", async () => {
  const { canFinishTask, resolveTaskGit } = await import("../src/lib/tasks.ts");
  const root = { id: "root" };
  const child = { id: "child", parent: "root", subagent: "native" };
  const merged = git({ state: "merged" }, { kind: "branch" });
  const unknown = git({}, { kind: "unknown", pull: null, head: null, stale: true });
  const result = resolveTaskGit(child, { root: merged, child: { ...unknown, shared_with: "root" } }, [root, child], unknown);
  assert.equal(result.owner, "root");
  assert.equal(result.status.shared_with, "root");
  assert.equal(canFinishTask(child, result.status, false), true);
  const cycle = resolveTaskGit(child, { root: { ...unknown, shared_with: "child" }, child: { ...unknown, shared_with: "root" } }, [root, child], unknown);
  assert.equal(cycle.owner, null);
  assert.equal(canFinishTask(child, cycle.status, false), false);
});
