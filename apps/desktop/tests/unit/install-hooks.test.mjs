import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { installHooks } from "../../scripts/install-hooks.mjs";

function repository(t) {
  const dir = mkdtempSync(join(tmpdir(), "install-hooks-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q"], { cwd: dir, stdio: "ignore" });
  const hooksPath = () => {
    try {
      return execFileSync("git", ["config", "--get", "core.hooksPath"], { cwd: dir, encoding: "utf8" }).trim();
    } catch {
      return "";
    }
  };
  const set = (value) => execFileSync("git", ["config", "core.hooksPath", value], { cwd: dir, stdio: "ignore" });
  return { dir, hooksPath, set };
}

test("sin valor previo apunta a .githooks", (t) => {
  const { dir, hooksPath } = repository(t);
  assert.equal(installHooks({ cwd: dir }).installed, true);
  assert.equal(hooksPath(), ".githooks");
});

test("un core.hooksPath ajeno se queda y el aviso dice cómo cambiarlo", (t) => {
  const { dir, hooksPath, set } = repository(t);
  set(".husky");
  const result = installHooks({ cwd: dir });
  assert.equal(result.installed, false);
  assert.equal(hooksPath(), ".husky");
  assert.match(result.lines.join("\n"), /\.husky/);
  assert.match(result.lines.join("\n"), /pnpm hooks:install --force/);
  assert.match(result.lines.join("\n"), /git config core\.hooksPath \.githooks/);
});

test("--force reemplaza el valor ajeno", (t) => {
  const { dir, hooksPath, set } = repository(t);
  set(".husky");
  assert.equal(installHooks({ cwd: dir, force: true }).installed, true);
  assert.equal(hooksPath(), ".githooks");
});

test("fuera de git no instala nada y no falla", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "install-hooks-nogit-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const result = installHooks({ cwd: dir });
  assert.equal(result.installed, false);
});
