import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { downloadBinaries, placeSidecar, sidecarPath } from "../../scripts/engine.mjs";
import { parseLockSetArgs, updateLock } from "../../scripts/engine-lock-set.mjs";

const root = resolve(fileURLToPath(import.meta.url), "../../..");
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const noopLog = () => {};

function baseLock(extraPlatform = {}) {
  const engineBytes = Buffer.from("wave1-engine-payload");
  return {
    version: 1,
    name: "seldon-runtime",
    engine_version: "0.3.1",
    commit: "bc473ea8fb62e69a701d065a196a87f303f09d15",
    release: "seldon-runtime-v0.3.1-bc473ea8",
    manifest: "https://github.com/danil-labs/danil/releases/download/seldon-runtime-v0.3.1-bc473ea8/seldon-runtime.json",
    terms: "https://github.com/danil-labs/danil/releases/download/seldon-runtime-v0.3.1-bc473ea8/TERMS.md",
    contract: "46798e8630db16622e62b79747cde5b02073681ca602d92adc6fdae559d802e5",
    platforms: {
      "x86_64-pc-windows-msvc": {
        url: "https://example.invalid/seldon-runtime-x86_64-pc-windows-msvc.exe",
        sha256: sha256(engineBytes),
      },
      "aarch64-apple-darwin": {
        url: "https://example.invalid/seldon-runtime-aarch64-apple-darwin",
        sha256: sha256(engineBytes),
        ...extraPlatform,
      },
      "x86_64-unknown-linux-gnu": {
        url: "https://example.invalid/seldon-runtime-x86_64-unknown-linux-gnu",
        sha256: sha256(engineBytes),
      },
    },
  };
}

test("Wave 1 lock without cli/kn places only engine sidecars and downloads only engine", async () => {
  const dir = mkdtempSync(join(tmpdir(), "danil-wave1-"));
  try {
    const engineBytes = Buffer.from("wave1-engine-payload");
    const lock = baseLock();
    const fetched = [];
    const fetcher = async (url) => {
      fetched.push(url);
      return engineBytes;
    };

    await placeSidecar("aarch64-apple-darwin", { lock, root: dir, fetcher, log: noopLog });
    assert.deepEqual(fetched, ["https://example.invalid/seldon-runtime-aarch64-apple-darwin"]);
    assert.equal(existsSync(sidecarPath("aarch64-apple-darwin", "danil-engine", dir)), true);
    assert.equal(existsSync(sidecarPath("aarch64-apple-darwin", "seldon-runtime", dir)), true);
    assert.equal(existsSync(sidecarPath("aarch64-apple-darwin", "danil", dir)), false);
    assert.equal(existsSync(sidecarPath("aarch64-apple-darwin", "kn", dir)), false);

    const downloaded = await downloadBinaries({
      lock,
      platform: "aarch64-apple-darwin",
      engineDir: join(dir, ".engine"),
      fetcher,
      log: noopLog,
    });
    assert.equal(existsSync(downloaded.engine), true);
    assert.deepEqual(downloaded.companions, {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Wave 2 lock downloads, verifies sha256 and size, caches and sets executable bits for danil and kn", async () => {
  const dir = mkdtempSync(join(tmpdir(), "danil-wave2-"));
  try {
    const engineBytes = Buffer.from("wave2-engine-binary");
    const cliBytes = Buffer.from("#!/bin/sh\necho danil\n");
    const knBytes = Buffer.from("#!/bin/sh\necho kn\n");
    const lock = baseLock({
      url: "https://example.invalid/seldon-runtime-aarch64-apple-darwin",
      sha256: sha256(engineBytes),
      size: engineBytes.length,
      cli: { url: "https://example.invalid/danil-aarch64-apple-darwin", sha256: sha256(cliBytes), size: cliBytes.length },
      kn: { url: "https://example.invalid/kn-aarch64-apple-darwin", sha256: sha256(knBytes), size: knBytes.length },
    });
    const payloads = new Map([
      ["https://example.invalid/seldon-runtime-aarch64-apple-darwin", engineBytes],
      ["https://example.invalid/danil-aarch64-apple-darwin", cliBytes],
      ["https://example.invalid/kn-aarch64-apple-darwin", knBytes],
    ]);
    const fetched = [];
    const fetcher = async (url) => {
      fetched.push(url);
      return payloads.get(url);
    };

    await placeSidecar("aarch64-apple-darwin", { lock, root: dir, fetcher, log: noopLog });
    assert.equal(fetched.length, 3);
    const danilSidecar = sidecarPath("aarch64-apple-darwin", "danil", dir);
    const knSidecar = sidecarPath("aarch64-apple-darwin", "kn", dir);
    assert.deepEqual(readFileSync(danilSidecar), cliBytes);
    assert.deepEqual(readFileSync(knSidecar), knBytes);
    if (process.platform !== "win32") {
      assert.equal(statSync(danilSidecar).mode & 0o777, 0o755);
      assert.equal(statSync(knSidecar).mode & 0o777, 0o755);
    }

    // Second run hits cache for engine, danil and kn.
    await placeSidecar("aarch64-apple-darwin", { lock, root: dir, fetcher, log: noopLog });
    assert.equal(fetched.length, 3);

    const downloaded = await downloadBinaries({
      lock,
      platform: "aarch64-apple-darwin",
      engineDir: join(dir, ".engine"),
      fetcher,
      log: noopLog,
    });
    assert.deepEqual(readFileSync(downloaded.companions.cli), cliBytes);
    assert.deepEqual(readFileSync(downloaded.companions.kn), knBytes);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("placeSidecar rejects sha256 mismatch, size mismatch and archive urls for cli/kn without placing files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "danil-wave2-reject-"));
  try {
    const engineBytes = Buffer.from("wave1-engine-payload");
    const cliBytes = Buffer.from("real-cli");
    const badLock = baseLock({
      cli: { url: "https://example.invalid/danil-aarch64-apple-darwin", sha256: sha256(cliBytes), size: cliBytes.length },
    });
    await assert.rejects(
      placeSidecar("aarch64-apple-darwin", {
        lock: badLock,
        root: dir,
        fetcher: async (url) => (url.includes("danil-") ? Buffer.from("tampered-cli") : engineBytes),
        log: noopLog,
      }),
      /SHA-256 mismatch for danil/,
    );
    assert.equal(existsSync(sidecarPath("aarch64-apple-darwin", "danil", dir)), false);

    const badSizeLock = baseLock({
      kn: { url: "https://example.invalid/kn-aarch64-apple-darwin", sha256: sha256(cliBytes), size: cliBytes.length + 10 },
    });
    await assert.rejects(
      placeSidecar("aarch64-apple-darwin", {
        lock: badSizeLock,
        root: dir,
        fetcher: async (url) => (url.includes("kn-") ? cliBytes : engineBytes),
        log: noopLog,
      }),
      /Size mismatch for kn/,
    );
    assert.equal(existsSync(sidecarPath("aarch64-apple-darwin", "kn", dir)), false);

    const archiveLock = baseLock({
      cli: { url: "https://example.invalid/danil-aarch64-apple-darwin.tar.gz", sha256: sha256(cliBytes) },
    });
    await assert.rejects(
      placeSidecar("aarch64-apple-darwin", {
        lock: archiveLock,
        root: dir,
        fetcher: async () => engineBytes,
        log: noopLog,
      }),
      /bare executable/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--cli-from and --kn-from place local builds in download and sidecar even on a Wave 1 lock", async () => {
  const dir = mkdtempSync(join(tmpdir(), "danil-wave2-local-"));
  try {
    const localDir = join(dir, "local");
    mkdirSync(localDir, { recursive: true });
    const localEngine = join(localDir, "seldon-runtime");
    const localCli = join(localDir, "danil");
    const localKn = join(localDir, "kn");
    writeFileSync(localEngine, "local-engine");
    writeFileSync(localCli, "local-danil");
    writeFileSync(localKn, "local-kn");
    const lock = baseLock();

    await placeSidecar("x86_64-pc-windows-msvc", {
      lock,
      root: dir,
      from: localEngine,
      cliFrom: localCli,
      knFrom: localKn,
      log: noopLog,
    });
    assert.equal(readFileSync(sidecarPath("x86_64-pc-windows-msvc", "danil", dir), "utf8"), "local-danil");
    assert.equal(readFileSync(sidecarPath("x86_64-pc-windows-msvc", "kn", dir), "utf8"), "local-kn");

    const downloaded = await downloadBinaries({
      lock,
      platform: "x86_64-unknown-linux-gnu",
      engineDir: join(dir, ".engine"),
      from: localEngine,
      cliFrom: localCli,
      knFrom: localKn,
      log: noopLog,
    });
    assert.equal(readFileSync(downloaded.companions.cli, "utf8"), "local-danil");
    assert.equal(readFileSync(downloaded.companions.kn, "utf8"), "local-kn");

    await assert.rejects(
      downloadBinaries({
        lock,
        platform: "x86_64-unknown-linux-gnu",
        engineDir: join(dir, ".engine"),
        from: localEngine,
        cliFrom: join(localDir, "missing-danil"),
        log: noopLog,
      }),
      /--cli-from file does not exist/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("engine-lock-set updates optional cli and kn pins via flags and via --manifest without breaking untouched platforms", () => {
  const lock = baseLock();
  const commit = "1111111122222222333333334444444455555555";
  const release = "seldon-runtime-v0.3.2-11111111";
  const engineSha = "a".repeat(64);
  const cliSha = "b".repeat(64);
  const knSha = "c".repeat(64);

  const parsed = parseLockSetArgs([
    "--release",
    release,
    "--commit",
    commit,
    "--engine-version",
    "0.3.2",
    "--platform",
    `x86_64-unknown-linux-gnu=${engineSha}`,
    "--cli",
    `x86_64-unknown-linux-gnu=${cliSha}`,
    "--cli-size",
    "x86_64-unknown-linux-gnu=1048576",
    "--kn",
    `x86_64-unknown-linux-gnu=${knSha}`,
    "--kn-size",
    "x86_64-unknown-linux-gnu=524288",
  ]);
  const { next, preserved } = updateLock(lock, parsed);
  assert.deepEqual(preserved, ["x86_64-pc-windows-msvc", "aarch64-apple-darwin"]);
  assert.equal(next.platforms["aarch64-apple-darwin"].release, "seldon-runtime-v0.3.1-bc473ea8");
  assert.deepEqual(next.platforms["x86_64-unknown-linux-gnu"], {
    url: `https://github.com/danil-labs/danil/releases/download/${release}/seldon-runtime-x86_64-unknown-linux-gnu`,
    sha256: engineSha,
    cli: {
      url: `https://github.com/danil-labs/danil/releases/download/${release}/danil-x86_64-unknown-linux-gnu`,
      sha256: cliSha,
      size: 1048576,
    },
    kn: {
      url: `https://github.com/danil-labs/danil/releases/download/${release}/kn-x86_64-unknown-linux-gnu`,
      sha256: knSha,
      size: 524288,
    },
  });

  // Updating from a seldon-runtime.json manifest imports url, sha256, size and cli/kn.
  const dir = mkdtempSync(join(tmpdir(), "danil-lock-set-"));
  try {
    const lockFile = join(dir, "seldon-runtime.lock");
    const manifestFile = join(dir, "seldon-runtime.json");
    writeFileSync(lockFile, `${JSON.stringify(next, null, 2)}\n`);
    const manifest = {
      engine_version: "0.3.2",
      commit,
      release,
      platforms: {
        "x86_64-pc-windows-msvc": {
          url: `https://github.com/danil-labs/danil/releases/download/${release}/seldon-runtime-x86_64-pc-windows-msvc.exe`,
          sha256: "d".repeat(64),
          size: 9_000_000,
          signed: true,
          notices: "https://example.invalid/NOTICES.txt",
          cli: {
            url: `https://github.com/danil-labs/danil/releases/download/${release}/danil-x86_64-pc-windows-msvc.exe`,
            sha256: "e".repeat(64),
            size: 900_000,
          },
          kn: {
            url: `https://github.com/danil-labs/danil/releases/download/${release}/kn-x86_64-pc-windows-msvc.exe`,
            sha256: "f".repeat(64),
            size: 800_000,
          },
        },
      },
    };
    writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

    const run = spawnSync(
      process.execPath,
      [join(root, "scripts/engine-lock-set.mjs"), "--lock", lockFile, "--manifest", manifestFile],
      { encoding: "utf8" },
    );
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const written = JSON.parse(readFileSync(lockFile, "utf8"));
    assert.deepEqual(written.platforms["x86_64-pc-windows-msvc"], {
      url: manifest.platforms["x86_64-pc-windows-msvc"].url,
      sha256: "d".repeat(64),
      size: 9_000_000,
      cli: manifest.platforms["x86_64-pc-windows-msvc"].cli,
      kn: manifest.platforms["x86_64-pc-windows-msvc"].kn,
    });
    // Untouched Wave 2 Linux pin keeps its cli and kn intact.
    assert.equal(written.platforms["x86_64-unknown-linux-gnu"].cli.sha256, cliSha);
    assert.equal(written.platforms["x86_64-unknown-linux-gnu"].kn.sha256, knSha);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("engine-lock-set rejects orphan --cli/--kn flags and malformed sizes", () => {
  const lock = baseLock();
  const commit = "1111111122222222333333334444444455555555";
  const release = "seldon-runtime-v0.3.2-11111111";
  assert.throws(
    () =>
      updateLock(
        lock,
        parseLockSetArgs([
          "--release",
          release,
          "--commit",
          commit,
          "--engine-version",
          "0.3.2",
          "--platform",
          `x86_64-unknown-linux-gnu=${"a".repeat(64)}`,
          "--cli",
          `aarch64-apple-darwin=${"b".repeat(64)}`,
        ]),
      ),
    /--cli requiere actualizar aarch64-apple-darwin/,
  );
  assert.throws(() => parseLockSetArgs(["--cli-size", "aarch64-apple-darwin=0"]), /--cli-size espera/);
});
