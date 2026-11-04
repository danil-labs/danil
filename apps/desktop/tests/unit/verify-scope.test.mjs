import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { changedFiles, classify, quickRefusal, quickScope, stepFiles, testReader, touches } from "../../scripts/verify-scope.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const desktop = (path) => `apps/desktop/${path}`;

function repository(t) {
  const dir = mkdtempSync(join(tmpdir(), "verify-scope-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  git("init", "-q", "-b", "dev");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  writeFileSync(join(dir, ".gitignore"), "ignored.txt\n");
  writeFileSync(join(dir, "kept.txt"), "uno\n");
  writeFileSync(join(dir, "renamed.txt"), "uno\n");
  git("add", ".");
  git("commit", "-qm", "base");
  return { dir, git };
}

test("el diff junta lo commiteado, lo sin commitear y lo sin seguimiento, y nada ignorado", (t) => {
  const { dir, git } = repository(t);
  git("switch", "-qc", "work");
  writeFileSync(join(dir, "committed ñ.txt"), "dos\n");
  git("mv", "renamed.txt", "moved.txt");
  git("add", ".");
  git("commit", "-qm", "work");
  writeFileSync(join(dir, "kept.txt"), "tres\n");
  writeFileSync(join(dir, "new.txt"), "cuatro\n");
  writeFileSync(join(dir, "ignored.txt"), "cinco\n");
  const { files, reason } = changedFiles(dir, "dev");
  assert.equal(reason, undefined);
  assert.deepEqual(files, ["committed ñ.txt", "kept.txt", "moved.txt", "new.txt", "renamed.txt"]);
});

test("una base que git no conoce no da una lista vacía", (t) => {
  const { dir } = repository(t);
  const { files, reason } = changedFiles(dir, "no-such-ref");
  assert.equal(files, undefined);
  assert.match(reason, /no-such-ref/);
});

test("lo que la cadena comparte y lo que el mapa no ubica piden todo", () => {
  for (const file of [
    "package.json",
    "pnpm-lock.yaml",
    desktop("package.json"),
    desktop("scripts/verify.mjs"),
    desktop("scripts/verify-scope.mjs"),
    desktop("scripts/git.mjs"),
    desktop("tests/helpers/fake-relay.mjs"),
    "packages/tasks/src/index.ts",
    desktop("vite.config.ts"),
    desktop("tsconfig.json"),
    desktop("index.html"),
  ]) assert.deepEqual(classify([file]).full, [file]);
});

test("un doc no pide pruebas, y el código pasa por el mapa", () => {
  assert.deepEqual(classify([desktop("docs/guards.md"), "packages/tasks/README.md", "apps/mobile/app/index.tsx"]), { full: [], rust: [], code: [], tests: [] });
  const groups = classify([desktop("src/lib/format.ts"), desktop("tests/unit/tabs.test.ts"), desktop("src-tauri/src/lib.rs"), desktop("seldon-runtime.lock")]);
  assert.deepEqual(groups.full, []);
  assert.deepEqual(groups.code, [desktop("src/lib/format.ts")]);
  assert.deepEqual(groups.tests, [desktop("tests/unit/tabs.test.ts")]);
  assert.equal(groups.rust.length, 2);
});

test("una prueba alcanza su import indirecto y no el de otra", () => {
  const reach = testReader(root)([join(root, "tests/unit/format.test.ts")]);
  assert.ok(reach.files.has("src/lib/format.ts"));
  assert.ok(touches(reach, [desktop("tests/unit/format.test.ts")]));
  assert.ok(!touches(reach, [desktop("src/features/settings/nada.ts")]));
});

test("una ruta nombrada cuenta como dependencia, también si es una carpeta", () => {
  const reach = testReader(root)([join(root, "tests/unit/format.test.ts")]);
  assert.ok(reach.prefixes.includes("src/locales"));
  assert.ok(touches(reach, [desktop("src/locales/es/manifiesto.json")]));
  assert.ok(!touches(reach, [desktop("src/localesque.ts")]));
});

test("montar dist pide los builds; una prueba de fuente no", () => {
  const read = testReader(root);
  assert.equal(read([join(root, "tests/unit/web-gate.test.mjs")]).needsBuild, true);
  assert.equal(read([join(root, "tests/unit/tabs.test.ts")]).needsBuild, false);
});

test("un paso con comodín se expande a sus archivos", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "verify-scope-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "test"));
  writeFileSync(join(dir, "test/a.test.ts"), "");
  writeFileSync(join(dir, "test/b.ts"), "");
  assert.deepEqual(stepFiles(["--test", join(dir, "test/*.test.ts")]), [join(dir, "test/a.test.ts")]);
});

function desktopRepository(t) {
  const dir = mkdtempSync(join(tmpdir(), "verify-scope-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  git("init", "-q", "-b", "dev");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  mkdirSync(join(dir, "apps/desktop/src/locales/es"), { recursive: true });
  mkdirSync(join(dir, "apps/desktop/tests/unit"), { recursive: true });
  writeFileSync(join(dir, "apps/desktop/src/bar.ts"), "export const bar = 1;\n");
  writeFileSync(join(dir, "apps/desktop/src/foo.ts"), "export const foo = 1;\n");
  writeFileSync(join(dir, "apps/desktop/src/locales/es/app.json"), "{}\n");
  writeFileSync(
    join(dir, "apps/desktop/tests/unit/foo.test.ts"),
    'import assert from "node:assert/strict";\nimport { test } from "node:test";\nimport { bar } from "../../src/bar.ts";\ntest("bar", () => assert.equal(bar, 1));\n',
  );
  git("add", ".");
  git("commit", "-qm", "base");
  git("switch", "-qc", "work");
  return { dir, git };
}

function quickScopeOf(dir, steps) {
  const desktop = join(dir, "apps/desktop");
  return quickScope({
    root: desktop,
    base: "dev",
    steps,
    rustSteps: [],
    cliStep: ["cli", "x", ["nada"], desktop],
    engineStep: ["engine", "x", ["nada"], desktop],
    isVite: () => false,
    requiresDist: /$^/,
    skipRust: true,
  });
}

test("un código que ninguna prueba alcanza pide la cadena completa", (t) => {
  const { dir, git } = desktopRepository(t);
  const desktop = join(dir, "apps/desktop");
  writeFileSync(join(desktop, "src/foo.ts"), "export const foo = 2;\n");
  git("add", ".");
  git("commit", "-qm", "cambia foo");
  const steps = [["la prueba", process.execPath, ["--test", join(desktop, "tests/unit/foo.test.ts")], desktop]];
  assert.match(quickScopeOf(dir, steps).reason, /no test reaches apps\/desktop\/src\/foo\.ts/);
});

test("un código que sí alcanza una prueba corre esa prueba y no todo", (t) => {
  const { dir, git } = desktopRepository(t);
  const desktop = join(dir, "apps/desktop");
  writeFileSync(join(desktop, "src/bar.ts"), "export const bar = 2;\n");
  git("add", ".");
  git("commit", "-qm", "cambia bar");
  const steps = [["la prueba", process.execPath, ["--test", join(desktop, "tests/unit/foo.test.ts")], desktop]];
  const scope = quickScopeOf(dir, steps);
  assert.equal(scope.reason, undefined);
  assert.ok(scope.plan.has(steps[0]));
});

test("un archivo de datos bajo src/ no pide la cadena completa", (t) => {
  const { dir, git } = desktopRepository(t);
  const desktop = join(dir, "apps/desktop");
  writeFileSync(join(desktop, "src/locales/es/app.json"), '{"a":1}\n');
  git("add", ".");
  git("commit", "-qm", "cambia el catálogo");
  const steps = [["la prueba", process.execPath, ["--test", join(desktop, "tests/unit/foo.test.ts")], desktop]];
  const scope = quickScopeOf(dir, steps);
  assert.equal(scope.reason, undefined);
  assert.equal(scope.plan.size, 0);
});

test("sin plan, --quick no da un verde y nombra el siguiente comando de la plataforma", () => {
  const linux = quickRefusal("no test reaches apps/desktop/src/foo.ts", "linux").join("\n");
  assert.match(linux, /no test reaches apps\/desktop\/src\/foo\.ts/);
  assert.match(linux, /Nothing was verified/);
  assert.match(linux, /pnpm verify --remote --detach/);
  assert.doesNotMatch(linux, /Verified on/);
  for (const platform of ["darwin", "win32"]) {
    const local = quickRefusal("touched package.json", platform).join("\n");
    assert.match(local, /`pnpm verify` on this machine/);
    assert.doesNotMatch(local, /--remote/);
  }
});
