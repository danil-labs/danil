import assert from "node:assert/strict";
import { test } from "node:test";
import { canFinishTask, readTaskGit, retainGitObservation, UNKNOWN_TASK_GIT, type TaskGitStatus } from "../../src/lib/tasks/index.ts";

const merged: TaskGitStatus = {
  ...UNKNOWN_TASK_GIT, kind: "branch", branch: "fix/example", head: "commit", pull_known: true,
  pull: { number: 362, state: "merged", head_sha: "commit" },
};

test("una máquina sin observaciones descubre los árboles antes de consultar el PR", async () => {
  let observed = false;
  const rows: Record<string, TaskGitStatus> = { task: merged };
  const read = async (remote: boolean) => {
    if (!remote) { observed = true; return { task: { ...merged, pull: null, pull_known: false } }; }
    return observed ? rows : {};
  };
  assert.deepEqual(await read(true), {}, "el refresco remoto solo no descubre tareas");
  const local: unknown[] = [];
  assert.deepEqual(await readTaskGit(read, { onLocal: rows => local.push(rows) }), rows);
  assert.equal(local.length, 1);
  assert.equal((local[0] as typeof rows).task.pull, null);
});

test("un fallo de GitHub conserva la observación local publicada", async () => {
  let local: unknown;
  await assert.rejects(readTaskGit(async remote => {
    if (remote) throw Error("connection unavailable");
    return { task: merged };
  }, { onLocal: value => { local = value; } }), /connection unavailable/);
  assert.deepEqual(local, { task: merged });
});

test("al cambiar de workspace no se inicia otra lectura de la consulta anterior", async () => {
  let remoteCalls = 0;
  await readTaskGit(async remote => {
    if (remote) remoteCalls++;
    return {};
  }, { current: () => false });
  assert.equal(remoteCalls, 0);
});

test("el cierre depende del HEAD integrado vigente, no de tener un número de PR", () => {
  assert.equal(canFinishTask({}, merged, false), true);
  for (const status of [
    null, UNKNOWN_TASK_GIT, { ...merged, stale: true }, { ...merged, head: "new-commit" },
    { ...merged, pull_known: false }, { ...merged, pull: { ...merged.pull!, state: "open" as const } },
  ]) assert.equal(canFinishTask({}, status, false), false);
  assert.equal(canFinishTask({}, merged, true), false);
  assert.equal(canFinishTask({ archived: true }, merged, false), false);
  assert.equal(canFinishTask({}, { ...merged, pull: null, pull_known: false, merged_locally: true, has_remote: true }, false), false);
  assert.equal(canFinishTask({}, { ...merged, pull: null, pull_known: false, merged_locally: true, has_remote: false }, false), true);
});

test("una observación más antigua no pisa el pull más nuevo", () => {
  const newer: TaskGitStatus = { ...merged, checked_at: 20 };
  const older: TaskGitStatus = { ...merged, checked_at: 10, pull: { number: 362, state: "open", head_sha: "commit" } };
  assert.equal(retainGitObservation({ t: newer }, { t: older }).t.pull?.state, "merged");
});

test("una fila igual conserva su objeto para no repintar", () => {
  const row: TaskGitStatus = { ...merged, checked_at: 20 };
  assert.equal(retainGitObservation({ t: row }, { t: { ...row } }).t, row);
});
