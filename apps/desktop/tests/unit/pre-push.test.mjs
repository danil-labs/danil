import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { changedPaths, pushedRanges } from "../../scripts/pre-push.mjs";

function repository(t) {
  const dir = mkdtempSync(join(tmpdir(), "pre-push-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  git("init", "-q", "-b", "dev");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  writeFileSync(join(dir, "a.txt"), "uno\n");
  git("add", ".");
  git("commit", "-qm", "base");
  git("update-ref", "refs/remotes/origin/dev", git("rev-parse", "HEAD"));
  git("switch", "-qc", "work");
  return { dir, git };
}

test("una línea por ref empujado, y una eliminación no cuenta", () => {
  const zero = "0".repeat(40);
  assert.deepEqual(pushedRanges(`refs/heads/work aaa refs/heads/work ${zero}\n`), [{ local: "aaa", remote: zero }]);
  assert.deepEqual(pushedRanges(`(delete) ${zero} refs/heads/work aaa\n`), []);
});

test("una rama nueva compara contra origin/dev", (t) => {
  const { dir, git } = repository(t);
  writeFileSync(join(dir, "b.txt"), "dos\n");
  git("add", ".");
  git("commit", "-qm", "work");
  const zero = "0".repeat(40);
  assert.deepEqual(changedPaths(`refs/heads/work ${git("rev-parse", "HEAD")} refs/heads/work ${zero}\n`, dir), ["b.txt"]);
});

test("una rama existente compara contra el sha remoto", (t) => {
  const { dir, git } = repository(t);
  const base = git("rev-parse", "dev");
  writeFileSync(join(dir, "c.txt"), "tres\n");
  git("add", ".");
  git("commit", "-qm", "work");
  assert.deepEqual(changedPaths(`refs/heads/work ${git("rev-parse", "HEAD")} refs/heads/work ${base}\n`, dir), ["c.txt"]);
});

test("sin base conocida no inventa una lista vacía", (t) => {
  const { dir, git } = repository(t);
  git("update-ref", "-d", "refs/remotes/origin/dev");
  const zero = "0".repeat(40);
  assert.equal(changedPaths(`refs/heads/work ${git("rev-parse", "HEAD")} refs/heads/work ${zero}\n`, dir), null);
});
