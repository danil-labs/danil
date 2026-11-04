/** El barrido de `target/`: solo lista por defecto y nunca toca lo que un cargo usa. */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { processes, scan, sweep } from "../../scripts/sweep-targets.mjs";

const script = resolve(import.meta.dirname, "../../scripts/sweep-targets.mjs");
const skip = process.platform !== "linux" ? "lee /proc" : false;

function target(root, name, ageHours) {
  const path = join(root, name, "apps/desktop/src-tauri/target");
  mkdirSync(join(path, "debug"), { recursive: true });
  writeFileSync(join(path, "CACHEDIR.TAG"), "");
  writeFileSync(join(path, "debug/bin"), "x".repeat(4096));
  const when = new Date(Date.now() - ageHours * 3_600_000);
  for (const path2 of [join(path, "debug/bin"), join(path, "CACHEDIR.TAG"), join(path, "debug"), path]) utimesSync(path2, when, when);
  return path;
}

function root(t) {
  const dir = mkdtempSync(join(tmpdir(), "sweep-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("sin --apply solo lista", { skip }, (t) => {
  const dir = root(t);
  const old = target(dir, "viejo", 48);
  const output = execFileSync(process.execPath, [script, "--root", dir], { encoding: "utf8" });
  assert.match(output, /se borraría/);
  assert.equal(existsSync(old), true);
});

test("borra lo viejo y conserva lo reciente y lo que no es de cargo", { skip }, (t) => {
  const dir = root(t);
  const old = target(dir, "viejo", 48);
  const recent = target(dir, "reciente", 2);
  const foreign = join(dir, "ajeno/target");
  mkdirSync(foreign, { recursive: true });
  const { deleted } = sweep(dir, { running: [] });
  assert.deepEqual(deleted, [old]);
  assert.equal(existsSync(recent), true);
  assert.equal(existsSync(foreign), true);
});

test("un archivo leído hace poco cuenta como uso", { skip }, (t) => {
  const dir = root(t);
  const path = target(dir, "leido", 48);
  utimesSync(join(path, "debug/bin"), new Date(), new Date(Date.now() - 48 * 3_600_000));
  assert.equal(scan(dir, { running: [] })[0].stale, false);
});

test("un cargo vivo en el worktree la protege, según ps y /proc/*/cwd", { skip }, async (t) => {
  const dir = root(t);
  const old = target(dir, "ocupado", 48);
  const worktree = join(dir, "ocupado");
  const fake = join(dir, "cargo");
  copyFileSync(execFileSync("sh", ["-c", "command -v sleep"], { encoding: "utf8" }).trim(), fake);
  execFileSync("chmod", ["+x", fake]);
  const child = spawn(fake, ["30"], { cwd: join(worktree, "apps") });
  t.after(() => child.kill("SIGKILL"));
  for (let i = 0; i < 100 && !processes().some((proc) => String(proc.pid) === String(child.pid) && proc.comm.startsWith("cargo")); i += 1) await new Promise((done) => setTimeout(done, 20));
  assert.equal(String(scan(dir)[0].heldBy), String(child.pid));
  assert.deepEqual(sweep(dir).deleted, []);
  assert.equal(existsSync(old), true);
});

test("un compilador ilegible detiene el borrado", { skip }, (t) => {
  const dir = root(t);
  const old = target(dir, "viejo", 48);
  const { deleted } = sweep(dir, { running: [{ pid: "1", comm: "rustc", cwd: null, exe: null, args: [], env: [] }] });
  assert.deepEqual(deleted, []);
  assert.equal(existsSync(old), true);
});
