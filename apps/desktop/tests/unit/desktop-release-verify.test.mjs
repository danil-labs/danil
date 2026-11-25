// La compuerta de una publicación manual rechaza un artefacto sin herramientas, como la 0.3.2.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  artifactPlan,
  checkCompanionIdentifiers,
  checkCompanions,
  checkEngineIdentifiers,
  checkEngines,
  checkManifests,
  companionPaths,
  resolveCompanions,
  TARGETS,
} from "../../scripts/desktop-release-verify.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");

function tree(manifests) {
  const dir = mkdtempSync(join(tmpdir(), "danil-release-gate-"));
  for (const [target, manifest] of Object.entries(manifests)) {
    mkdirSync(join(dir, target), { recursive: true });
    writeFileSync(join(dir, target, "manifest.json"), JSON.stringify(manifest));
  }
  return dir;
}

const good = (target) => ({ schema: 2, layout: "tree", target });

test("each artifact opens on its own platform and names where its tools live", () => {
  assert.deepEqual(artifactPlan("/x/Danil_0.3.3_x64-setup.exe", "win32"), {
    platform: "win32", targets: ["x86_64-pc-windows-msvc"], resources: "work-tools", engine: "danil-engine.exe",
    engines: ["danil-engine.exe", "seldon-runtime.exe"],
  });
  assert.deepEqual(artifactPlan("/x/Danil_0.3.3_amd64.AppImage", "linux").engines, ["squashfs-root/usr/bin/danil-engine", "squashfs-root/usr/bin/seldon-runtime"]);
  assert.deepEqual(artifactPlan("/x/Danil.app", "darwin").engines, ["Contents/MacOS/danil-engine", "Contents/MacOS/seldon-runtime"]);
  assert.equal(artifactPlan("/x/Danil_0.3.3_amd64.AppImage", "linux").resources, "squashfs-root/usr/share/Danil/work-tools");
  assert.deepEqual(artifactPlan("/x/Danil.app/", "darwin").targets, TARGETS.darwin);
  assert.equal(artifactPlan("/x/Danil_0.3.3_aarch64.dmg", "darwin").platform, "darwin");
  assert.throws(() => artifactPlan("/x/Danil_0.3.3_x64-setup.exe", "linux"), /win32/);
  assert.throws(() => artifactPlan("/x/Danil.zip", "linux"), /no sé abrir/);
});

test("a package without its tree, or with another generation's manifest, does not pass", () => {
  const empty = tree({});
  const old = tree({ "x86_64-pc-windows-msvc": { schema: 1, layout: "tree", target: "x86_64-pc-windows-msvc" } });
  const wrong = tree({ "x86_64-pc-windows-msvc": good("aarch64-pc-windows-msvc") });
  const ok = tree({ "x86_64-pc-windows-msvc": good("x86_64-pc-windows-msvc") });
  try {
    assert.match(checkManifests(empty, TARGETS.win32).join(), /no trae work-tools\/x86_64-pc-windows-msvc/);
    assert.match(checkManifests(old, TARGETS.win32).join(), /esquema 2/);
    assert.match(checkManifests(wrong, TARGETS.win32).join(), /esquema 2/);
    assert.deepEqual(checkManifests(ok, TARGETS.win32), []);
  } finally {
    for (const dir of [empty, old, wrong, ok]) rmSync(dir, { recursive: true, force: true });
  }
});

test("the macOS app needs the Apple Silicon work-tools tree", () => {
  const empty = tree({});
  const arm = tree({ "aarch64-apple-darwin": good("aarch64-apple-darwin") });
  try {
    assert.match(checkManifests(empty, TARGETS.darwin).join(), /aarch64-apple-darwin/);
    assert.deepEqual(checkManifests(arm, TARGETS.darwin), []);
  } finally {
    for (const dir of [empty, arm]) rmSync(dir, { recursive: true, force: true });
  }
});

test("the engine travels as danil-engine and its alias, both with the pinned bytes", () => {
  const dir = mkdtempSync(join(tmpdir(), "danil-release-gate-"));
  try {
    const engine = join(dir, "danil-engine.exe");
    const alias = join(dir, "seldon-runtime.exe");
    const pinned = new Set([createHash("sha256").update("pinned").digest("hex")]);
    assert.match(checkEngines([engine, alias], pinned).join(), /no trae danil-engine.exe.*no trae seldon-runtime.exe/);
    writeFileSync(engine, "pinned");
    assert.match(checkEngines([engine, alias], pinned).join(), /no trae seldon-runtime.exe/);
    writeFileSync(alias, "other");
    const differ = checkEngines([engine, alias], pinned).join();
    assert.match(differ, /no tienen los mismos bytes/);
    assert.match(differ, /seldon-runtime.exe \(sha256 \w+\) no es el motor fijado/);
    writeFileSync(alias, "pinned");
    assert.deepEqual(checkEngines([engine, alias], pinned), []);
    // Signed on macOS: both must be there, the bytes are not the lock's.
    writeFileSync(alias, "signed");
    assert.deepEqual(checkEngines([engine, alias], null), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("on macOS both copies are signed with the identifier seldon-runtime", () => {
  const dir = mkdtempSync(join(tmpdir(), "danil-release-gate-"));
  try {
    const engine = join(dir, "danil-engine");
    const alias = join(dir, "seldon-runtime");
    writeFileSync(engine, "");
    writeFileSync(alias, "");
    const signed = { [engine]: "Executable=x\nIdentifier=seldon-runtime\n", [alias]: "Identifier=seldon-runtime\nFormat=Mach-O" };
    assert.deepEqual(checkEngineIdentifiers([engine, alias], (path) => signed[path]), []);
    signed[engine] = "Identifier=danil-engine\n";
    assert.match(checkEngineIdentifiers([engine, alias], (path) => signed[path]).join(), /danil-engine está firmado como danil-engine/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("companion danil and kn binaries are skipped on Wave 1 locks and verified by sha256, size and macOS identifier on Wave 2 locks", () => {
  const dir = mkdtempSync(join(tmpdir(), "danil-release-companions-"));
  try {
    const winPlan = artifactPlan("/x/Danil_0.3.5_x64-setup.exe", "win32");
    const linuxPlan = artifactPlan("/x/Danil_0.3.5_amd64.AppImage", "linux");
    const macPlan = artifactPlan("/x/Danil.app", "darwin");
    assert.deepEqual(
      companionPaths(winPlan).map((c) => c.rel),
      ["danil.exe", "kn.exe"],
    );
    assert.deepEqual(
      companionPaths(linuxPlan).map((c) => c.rel),
      ["squashfs-root/usr/bin/danil", "squashfs-root/usr/bin/kn"],
    );
    assert.deepEqual(
      companionPaths(macPlan).map((c) => c.rel),
      ["Contents/MacOS/danil", "Contents/MacOS/kn"],
    );

    const wave1Lock = {
      platforms: {
        "x86_64-pc-windows-msvc": { url: "https://example.invalid/e.exe", sha256: "a".repeat(64) },
        "x86_64-unknown-linux-gnu": { url: "https://example.invalid/e", sha256: "a".repeat(64) },
        "aarch64-apple-darwin": { url: "https://example.invalid/e", sha256: "a".repeat(64) },
      },
    };
    assert.deepEqual(resolveCompanions(winPlan, dir, dir, { lock: wave1Lock }), []);

    const danilBytes = Buffer.from("danil-thin-cli");
    const knBytes = Buffer.from("kn-thin-cli");
    const danilHash = createHash("sha256").update(danilBytes).digest("hex");
    const knHash = createHash("sha256").update(knBytes).digest("hex");
    const wave2Lock = {
      platforms: {
        "x86_64-pc-windows-msvc": {
          url: "https://example.invalid/e.exe",
          sha256: "a".repeat(64),
          cli: { url: "https://example.invalid/danil.exe", sha256: danilHash, size: danilBytes.length },
          kn: { url: "https://example.invalid/kn.exe", sha256: knHash, size: knBytes.length },
        },
        "x86_64-unknown-linux-gnu": {
          url: "https://example.invalid/e",
          sha256: "a".repeat(64),
          cli: { url: "https://example.invalid/danil", sha256: danilHash, size: danilBytes.length },
          kn: { url: "https://example.invalid/kn", sha256: knHash, size: knBytes.length },
        },
        "aarch64-apple-darwin": {
          url: "https://example.invalid/e",
          sha256: "a".repeat(64),
          cli: { url: "https://example.invalid/danil", sha256: danilHash, size: danilBytes.length },
          kn: { url: "https://example.invalid/kn", sha256: knHash, size: knBytes.length },
        },
      },
    };

    const winBase = join(dir, "win");
    mkdirSync(winBase, { recursive: true });
    const winCompanions = resolveCompanions(winPlan, winBase, dir, { lock: wave2Lock });
    assert.match(checkCompanions(winCompanions).join(), /no trae danil\.exe.*no trae kn\.exe/);
    writeFileSync(join(winBase, "danil.exe"), danilBytes);
    writeFileSync(join(winBase, "kn.exe"), "wrong");
    assert.match(checkCompanions(winCompanions).join(), /kn\.exe \(sha256 \w+\) no es el binario kn fijado/);
    writeFileSync(join(winBase, "kn.exe"), knBytes);
    assert.deepEqual(checkCompanions(winCompanions), []);

    // Linux accepts both raw lock bytes and patchelf-transformed bytes.
    const linuxBins = join(dir, "linux-bins");
    const linuxBase = join(dir, "linux-app");
    mkdirSync(linuxBins, { recursive: true });
    mkdirSync(join(linuxBase, "squashfs-root/usr/bin"), { recursive: true });
    writeFileSync(join(linuxBins, "danil-x86_64-unknown-linux-gnu"), danilBytes);
    writeFileSync(join(linuxBins, "kn-x86_64-unknown-linux-gnu"), knBytes);
    const linuxCompanions = resolveCompanions(linuxPlan, linuxBase, dir, {
      lock: wave2Lock,
      binariesDir: linuxBins,
      runCommand: (_cmd, args) => {
        const file = args.at(-1);
        writeFileSync(file, Buffer.concat([readFileSync(file), Buffer.from("-rpath")]));
      },
    });
    writeFileSync(join(linuxBase, "squashfs-root/usr/bin/danil"), Buffer.concat([danilBytes, Buffer.from("-rpath")]));
    writeFileSync(join(linuxBase, "squashfs-root/usr/bin/kn"), knBytes);
    assert.deepEqual(checkCompanions(linuxCompanions), []);

    // macOS requires presence and own codesign Identifier (danil / kn).
    const macBase = join(dir, "Danil.app");
    mkdirSync(join(macBase, "Contents/MacOS"), { recursive: true });
    const macCompanions = resolveCompanions(macPlan, macBase, dir, { lock: wave2Lock });
    writeFileSync(join(macBase, "Contents/MacOS/danil"), "signed-danil");
    writeFileSync(join(macBase, "Contents/MacOS/kn"), "signed-kn");
    assert.deepEqual(checkCompanions(macCompanions), []);
    const signed = {
      [join(macBase, "Contents/MacOS/danil")]: "Identifier=danil\n",
      [join(macBase, "Contents/MacOS/kn")]: "Identifier=kn\n",
    };
    assert.deepEqual(checkCompanionIdentifiers(macCompanions, (path) => signed[path]), []);
    signed[join(macBase, "Contents/MacOS/kn")] = "Identifier=seldon-runtime\n";
    assert.match(checkCompanionIdentifiers(macCompanions, (path) => signed[path]).join(), /kn está firmado como seldon-runtime, no como kn/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an AppImage like 0.3.2, with engine and no tools, is refused", { skip: process.platform !== "linux" && "an AppImage is verified on Linux" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "danil-release-gate-"));
  try {
    const image = join(dir, "Danil_0.3.2_amd64.AppImage");
    writeFileSync(image, "#!/bin/sh\nmkdir -p squashfs-root/usr/bin squashfs-root/usr/share/Danil/lenguas\ntouch squashfs-root/usr/bin/seldon-runtime\n");
    chmodSync(image, 0o755);
    const run = spawnSync(process.execPath, [join(root, "scripts/desktop-release-verify.mjs"), image], { encoding: "utf8" });
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(run.stderr, /NO se publica.*no trae work-tools\/x86_64-unknown-linux-gnu/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
