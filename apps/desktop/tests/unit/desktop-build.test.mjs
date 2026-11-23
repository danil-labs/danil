// `pnpm desktop:build` no empaqueta un Danil sin herramientas incluidas.
// La 0.3.2 de Windows salió sin `work-tools/`: el motor no encontraba git y la
// preparación pedía «Reparar» sin poder hacerlo.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { bundleEnvironment, ESCAPE, missingWorkTools } from "../../scripts/desktop-build.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");

function lab() {
  const dir = mkdtempSync(join(tmpdir(), "danil-desktop-build-"));
  const tree = (name) => {
    const path = join(dir, name);
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, "manifest.json"), "{}");
    return path;
  };
  const config = (name, value) => {
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify(value));
    return path;
  };
  return { dir, tree, config, done: () => rmSync(dir, { recursive: true, force: true }) };
}

const windows = { platform: "win32", env: {} };

test("pnpm desktop:build stops before tauri when no overlay brings the tools", { skip: process.platform === "win32" && "the fake tauri is a POSIX script" }, () => {
  const l = lab();
  try {
    // Un `tauri` falso en el PATH: si el script lo llama, deja rastro y sale bien.
    const bin = join(l.dir, "bin");
    mkdirSync(bin);
    const called = join(l.dir, "tauri-called");
    writeFileSync(join(bin, "tauri"), `#!/bin/sh\necho "$@" > "${called}"\nexit 0\n`);
    chmodSync(join(bin, "tauri"), 0o755);
    const script = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts["desktop:build"];
    const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` };
    delete env[ESCAPE];
    const run = spawnSync("sh", ["-c", `${script} --bundles nsis`], { cwd: root, env, encoding: "utf8" });
    assert.notEqual(run.status, 0, run.stdout + run.stderr);
    assert.equal(existsSync(called), false, "tauri build ran without work-tools");
    assert.match(run.stderr, /work-tools/);
  } finally {
    l.done();
  }
});

test("a Windows release needs work-tools/ among the resources, with its manifest", () => {
  const l = lab();
  try {
    const tree = l.tree("work-tools/x86_64-pc-windows-msvc");
    const overlay = l.config("tauri.work-tools.json", { bundle: { resources: { [tree]: "work-tools/x86_64-pc-windows-msvc/" } } });
    const sign = JSON.stringify({ bundle: { windows: { signCommand: { cmd: "bash", args: ["sign.sh", "%1"] } } } });

    assert.match(missingWorkTools(["--bundles", "nsis"], windows), /work-tools/);
    assert.match(missingWorkTools(["--bundles", "nsis", "--config", sign], windows), /work-tools/);
    assert.equal(missingWorkTools(["--bundles", "nsis", "--config", overlay, "--config", sign], windows), null);
    assert.equal(missingWorkTools([`--config=${overlay}`], windows), null);

    const hollow = join(l.dir, "hollow");
    mkdirSync(hollow);
    const empty = l.config("empty.json", { bundle: { resources: { [hollow]: "work-tools/x86_64-pc-windows-msvc/" } } });
    assert.match(missingWorkTools(["--config", empty], windows), /manifest\.json/);
  } finally {
    l.done();
  }
});

test("macOS and the AppImage read their own overlay shape", () => {
  const l = lab();
  try {
    const mac = l.tree("aarch64-apple-darwin");
    const linux = l.tree("x86_64-unknown-linux-gnu");
    const macOverlay = l.config("mac.json", { bundle: { macOS: { files: { "Resources/work-tools/aarch64-apple-darwin": mac } } } });
    const linuxOverlay = l.config("linux.json", { bundle: { linux: { appimage: { files: { "/usr/share/Danil/work-tools/x86_64-unknown-linux-gnu": linux } } } } });
    const darwin = ["--target", "aarch64-apple-darwin"];

    assert.equal(missingWorkTools([...darwin, "--config", macOverlay], { platform: "linux", env: {} }), null);
    assert.match(missingWorkTools([...darwin, "--config", linuxOverlay], { platform: "linux", env: {} }), /work-tools/);
    assert.equal(missingWorkTools(["--config", "src-tauri/tauri.linux.conf.json", "--config", linuxOverlay], { platform: "linux", env: {}, cwd: root }), null);
    assert.match(missingWorkTools(["--config", "src-tauri/tauri.linux.conf.json"], { platform: "linux", env: {}, cwd: root }), /work-tools/);
  } finally {
    l.done();
  }
});

test("debug, unbundled and explicitly tool-less builds still pass", () => {
  assert.equal(missingWorkTools(["--debug", "--no-bundle"], windows), null);
  assert.equal(missingWorkTools(["-d"], windows), null);
  assert.equal(missingWorkTools(["--no-bundle"], windows), null);
  assert.equal(missingWorkTools(["--bundles", "nsis"], { platform: "win32", env: { [ESCAPE]: "1" } }), null);
});

test("the overlay work-tools.py writes is the one the build accepts", () => {
  const l = lab();
  try {
    const output = join(l.dir, "work-tools");
    const targets = { win32: "x86_64-pc-windows-msvc", darwin: "aarch64-apple-darwin" };
    for (const [platform, target] of Object.entries(targets)) {
      l.tree(`work-tools/${target}`);
      const config = join(l.dir, `${platform}.json`);
      const python = process.platform === "win32" ? "python" : "python3";
      const code = [
        "import importlib.util, sys, pathlib",
        "spec = importlib.util.spec_from_file_location('w', sys.argv[1])",
        "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
        "m.write_tauri_config(pathlib.Path(sys.argv[2]), [sys.argv[3]], pathlib.Path(sys.argv[4]))",
      ].join("\n");
      const run = spawnSync(python, ["-I", "-c", code, join(root, "scripts/work-tools.py"), output, target, config], { encoding: "utf8" });
      assert.equal(run.status, 0, `${run.error ?? ""}${run.stderr}`);
      assert.equal(missingWorkTools(["--config", config], { platform, env: {} }), null, platform);
    }
  } finally {
    l.done();
  }
});

test("an AppImage build gets linuxdeploy's environment, or does not start without patchelf", () => {
  const l = lab();
  try {
    const bin = join(l.dir, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "patchelf"), "");
    const linux = { platform: "linux", cwd: root };
    const { env } = bundleEnvironment(["--config", "x.json"], { ...linux, env: { PATH: bin } });
    assert.deepEqual(env, {
      NO_STRIP: "1",
      PATCHELF: join(root, "scripts/work-tools-patchelf.py"),
      TERMINUS_REAL_PATCHELF: join(bin, "patchelf"),
      TERMINUS_WORK_TOOLS_ROOT: join(root, "src-tauri/target/release/bundle/appimage/Danil.AppDir/usr/share/Danil/work-tools"),
    });
    const moved = bundleEnvironment([], { ...linux, env: { PATH: bin, CARGO_TARGET_DIR: "/t" } }).env;
    assert.equal(moved.TERMINUS_WORK_TOOLS_ROOT, "/t/release/bundle/appimage/Danil.AppDir/usr/share/Danil/work-tools");
    assert.match(bundleEnvironment([], { ...linux, env: { PATH: join(l.dir, "none") } }).error, /patchelf/);
    assert.deepEqual(bundleEnvironment([], { platform: "win32", env: {} }).env, {});
    assert.deepEqual(bundleEnvironment(["--debug"], { ...linux, env: {} }).env, {});
  } finally {
    l.done();
  }
});

test("a macOS bundle signs danil-engine with the identifier seldon-runtime", { skip: process.platform === "win32" && "the shim is POSIX sh" }, () => {
  const l = lab();
  try {
    const { env } = bundleEnvironment(["--target", "aarch64-apple-darwin"], { platform: "darwin", cwd: root, env: { PATH: "/usr/bin" } });
    const shim = join(env.PATH.split(delimiter)[0], "codesign");
    assert.equal(env.PATH.split(delimiter)[1], "/usr/bin");
    const real = join(l.dir, "real-codesign");
    writeFileSync(real, '#!/bin/sh\necho "$@"\n', { mode: 0o755 });
    const run = (...args) => spawnSync(shim, args, { encoding: "utf8", env: { ...env, DANIL_REAL_CODESIGN: real } }).stdout.trim();
    const app = "/b/Danil.app/Contents/MacOS";
    assert.equal(run("--force", "-s", "ID", `${app}/danil-engine`), `--identifier seldon-runtime --force -s ID ${app}/danil-engine`);
    assert.equal(run("--force", "-s", "ID", `${app}/seldon-runtime`), `--force -s ID ${app}/seldon-runtime`);
    assert.equal(run("--verify", `${app}/danil-engine`), `--verify ${app}/danil-engine`);
    assert.equal(run("--force", "-s", "ID", "--identifier", "x", `${app}/danil-engine`), `--force -s ID --identifier x ${app}/danil-engine`);
  } finally {
    l.done();
  }
});

test("every build in publish.yml goes through desktop:build", () => {
  const workflow = readFileSync(join(root, "../../.github/workflows/publish.yml"), "utf8");
  const lines = workflow.split("\n").filter((line) => !line.trim().startsWith("#"));
  const direct = lines.filter((line) => /\btauri(?:\.js)?\s+build\b|tauri-action/.test(line));
  assert.deepEqual(direct, []);
  assert.equal(lines.filter((line) => /pnpm desktop:build\b/.test(line)).length, 3);
});
