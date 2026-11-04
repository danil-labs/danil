import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { configure, launcher } from "../../scripts/cli-path.mjs";

function scratch(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "danil-path-")));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("launchers preserve args, pipes and exit code; reinstall, retarget and uninstall only owned files", (t) => {
  const dir = scratch(t);
  const binDir = join(dir, "bin");
  const target = join(dir, "engine ' $ ` & name");
  writeFileSync(target, '#!/bin/sh\nprintf "%s\\n" "$@"\ncat\nprintf "stderr\\n" >&2\nexit 23\n', { mode: 0o755 });
  const config = { action: "install", target, binDir, pathValue: binDir };
  configure({ ...config, dryRun: true });
  assert.equal(existsSync(binDir), false);
  configure(config);
  assert.deepEqual(readdirSync(binDir).sort(), process.platform === "win32" ? ["danil", "danil.cmd", "dn", "dn.cmd"] : ["danil", "dn"]);
  const before = readFileSync(join(binDir, "danil"), "utf8");
  configure(config);
  assert.equal(readFileSync(join(binDir, "danil"), "utf8"), before);
  if (process.platform !== "win32") {
    for (const name of ["danil", "dn"]) {
      const result = spawnSync(join(binDir, name), ["task", "á with spaces", "$(false)", "'"], { input: "stdin\n", encoding: "utf8", timeout: 10_000 });
      assert.ifError(result.error);
      assert.equal(result.status, 23);
      assert.equal(result.stdout, "task\ná with spaces\n$(false)\n'\nstdin\n");
      assert.equal(result.stderr, "stderr\n");
    }
  }
  configure({ ...config, target: process.execPath });
  const result = spawnSync(join(binDir, process.platform === "win32" ? "danil.cmd" : "danil"), ["--version"], { encoding: "utf8", timeout: 10_000, shell: process.platform === "win32" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), process.version);
  configure({ action: "uninstall", binDir });
  configure({ action: "uninstall", binDir });
  assert.equal(existsSync(join(binDir, "danil")), false);
});

test("all destinations are checked before mutation; foreign commands and dangling symlinks survive", (t) => {
  const binDir = scratch(t);
  const config = { action: "install", target: process.execPath, binDir, pathValue: binDir };
  const foreign = join(binDir, "dn");
  writeFileSync(foreign, "foreign");
  assert.throws(() => configure(config), /Foreign command/);
  assert.equal(existsSync(join(binDir, "danil")), false);
  assert.throws(() => configure({ action: "uninstall", binDir }), /Foreign command/);
  assert.equal(readFileSync(foreign, "utf8"), "foreign");
  rmSync(foreign);
  symlinkSync(join(binDir, "missing"), foreign);
  assert.throws(() => configure(config), /Foreign command/);
  assert.equal(existsSync(join(binDir, "danil")), false);
});

test("PATH collisions, including Windows extensions and case, prevent installation", (t) => {
  const dir = scratch(t);
  const binDir = join(dir, "bin");
  const pathValue = dir;
  writeFileSync(join(dir, "danil"), "foreign");
  assert.throws(() => configure({ action: "install", target: process.execPath, binDir, pathValue }), /PATH collision/);
  assert.equal(existsSync(binDir), false);
  assert.throws(() => configure({ action: "install", target: process.execPath, binDir, pathValue, platform: "win32", pathExt: ".EXE;" }), /PATH collision/);
  rmSync(join(dir, "danil"));
  writeFileSync(join(dir, "Dn.EXE"), "foreign");
  assert.throws(() => configure({ action: "install", target: process.execPath, binDir, pathValue, platform: "win32" }), /PATH collision/);
  assert.equal(existsSync(binDir), false);
  rmSync(join(dir, "Dn.EXE"));
  writeFileSync(join(dir, "dn.custom"), "foreign");
  assert.throws(() => configure({ action: "install", target: process.execPath, binDir, pathValue, platform: "win32", pathExt: ".EXE;.CUSTOM" }), /PATH collision/);
  assert.equal(existsSync(binDir), false);
});

test("modified managed content is foreign; launcher metadata alone proves no ownership", (t) => {
  const binDir = scratch(t);
  const path = join(binDir, "danil");
  writeFileSync(path, `${launcher(process.execPath, "sh")}echo changed\n`);
  assert.throws(() => configure({ action: "uninstall", binDir }), /Foreign command/);
  assert.equal(existsSync(path), true);
});


test("Unix launchers pass termination signals to the same process", { skip: process.platform === "win32" }, async (t) => {
  const binDir = scratch(t);
  configure({ action: "install", target: process.execPath, binDir, pathValue: binDir });
  const child = spawn(join(binDir, "dn"), ["-e", "process.stdout.write(String(process.pid)); setInterval(() => {}, 1000)"]);
  t.after(() => { if (child.exitCode === null) child.kill("SIGKILL"); });
  const ready = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("CLI did not become ready")), 5000);
    child.once("error", reject);
    child.stdout.once("data", (data) => { clearTimeout(timer); resolve(Number(data.toString().trim())); });
  });
  assert.equal(ready, child.pid);
  const exited = new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
  child.kill("SIGTERM");
  assert.deepEqual(await exited, { code: null, signal: "SIGTERM" });
});


test("empty Unix PATH entries include cwd and symlink ancestors are rejected before writing", { skip: process.platform === "win32" }, (t) => {
  const dir = scratch(t);
  const binDir = join(dir, "bin");
  writeFileSync(join(dir, "dn"), "foreign", { mode: 0o755 });
  const original = process.cwd();
  try {
    process.chdir(dir);
    assert.throws(() => configure({ action: "install", target: process.execPath, binDir, pathValue: ":/usr/bin" }), /PATH collision/);
    assert.equal(existsSync(binDir), false);
  } finally { process.chdir(original); }
  const alias = join(dir, "alias");
  symlinkSync(dir, alias);
  for (const dryRun of [false, true]) {
    assert.throws(() => configure({ action: "install", target: process.execPath, binDir: join(alias, "new-bin"), pathValue: "/usr/bin", dryRun }), /canonical directory/);
    assert.equal(existsSync(join(dir, "new-bin")), false);
  }
});
