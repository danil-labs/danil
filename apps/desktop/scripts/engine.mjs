#!/usr/bin/env node
/**
 * Downloads the Seldon engine (`seldon-runtime`) pinned in `seldon-runtime.lock`
 * and runs the Terminus window against it with throwaway data.
 *
 *   node scripts/engine.mjs download [--from <seldon-runtime>] [--cli-from <danil>] [--kn-from <kn>]
 *   node scripts/engine.mjs sidecar  [--from <seldon-runtime>] [--cli-from <danil>] [--kn-from <kn>] [--target <triple>]
 *   node scripts/engine.mjs start    [--window <terminus>] [--lab <dir>]
 *   node scripts/engine.mjs engine | select | window | status | stop  [--lab <dir>]
 *
 * `window --cdp-port <port>` opens WebView2 remote debugging (Windows) for UI tests.
 *
 * The engine is a proprietary binary by Danil; its source is not in this
 * repository; its terms are linked from the lock (`terms`). A download is
 * accepted only when its SHA-256 (and size, if pinned) matches the lock.
 * `--from`, `--cli-from` and `--kn-from` copy local builds instead and say that
 * they are not the pinned ones.
 *
 * Everything lives under `.engine/` (ignored by git). The lab never touches the
 * data, keychain or accounts of an installed Terminus: the engine gets its own
 * data directory, HOME, temp folder, keychain (macOS) and the identity `ai.danil.seldon.dev`.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK = JSON.parse(readFileSync(join(ROOT, "seldon-runtime.lock"), "utf8"));
const IDENTITY = "ai.danil.seldon.dev";
const WINDOWS = process.platform === "win32";
const EXE = WINDOWS ? ".exe" : "";
const ARCH = { x64: "x86_64", arm64: "aarch64" }[process.arch] ?? process.arch;
const PLATFORM = `${ARCH}-${{ win32: "pc-windows-msvc", darwin: "apple-darwin", linux: "unknown-linux-gnu" }[process.platform] ?? process.platform}`;
const SHA256_RE = /^[0-9a-f]{64}$/;
const ARCHIVE_RE = /\.(zip|tar\.gz|tgz)$/;

export const COMPANION_BINARIES = [
  { key: "cli", name: "danil", flag: "cli-from" },
  { key: "kn", name: "kn", flag: "kn-from" },
];

const [command = "help", ...rest] = process.argv.slice(2);
const option = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 && rest[i + 1] ? resolve(rest[i + 1]) : fallback;
};
const rawOption = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 && rest[i + 1] ? rest[i + 1] : fallback;
};

const ENGINE_DIR = join(ROOT, ".engine");
const ENGINE = join(ENGINE_DIR, "bin", `seldon-runtime${EXE}`);
const LAB = option("lab", join(ENGINE_DIR, "lab"));
const WINDOW = option("window", join(ROOT, "src-tauri", "target", "debug", `terminus${EXE}`));
const DATA = join(LAB, "data");
const SELECTION = join(LAB, "selection.json");
const WINDOW_DATA = join(LAB, "window");
const HOME = join(LAB, "home");
const TMP = join(LAB, "tmp");

function fail(message) {
  throw new Error(message);
}

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const sha256Bytes = (bytes) => createHash("sha256").update(bytes).digest("hex");

function validatePinnedSpec(label, spec) {
  if (!spec || typeof spec !== "object" || typeof spec.url !== "string" || !spec.url.trim()) {
    fail(`${label} in seldon-runtime.lock is missing a valid url.`);
  }
  if (typeof spec.sha256 !== "string" || !SHA256_RE.test(spec.sha256)) {
    fail(`${label} in seldon-runtime.lock must declare a 64-char hex sha256.`);
  }
  if (spec.size !== undefined && (!Number.isInteger(spec.size) || spec.size <= 0)) {
    fail(`${label} in seldon-runtime.lock must declare a positive integer size.`);
  }
}

function verifyPinnedBytes(label, bytes, spec) {
  const got = sha256Bytes(bytes);
  if (got !== spec.sha256) {
    fail(`SHA-256 mismatch for ${label}: expected ${spec.sha256}, got ${got}. Nothing was placed.`);
  }
  if (spec.size !== undefined && bytes.length !== spec.size) {
    fail(`Size mismatch for ${label}: expected ${spec.size} bytes, got ${bytes.length}. Nothing was placed.`);
  }
  return got;
}

function matchesPinnedFile(path, spec) {
  if (!existsSync(path)) return false;
  if (spec.size !== undefined && statSync(path).size !== spec.size) return false;
  return sha256(path) === spec.sha256;
}

/** Only the current user may read it: the window rejects anything wider. */
function makePrivate(path, folder = false) {
  if (!WINDOWS) {
    chmodSync(path, folder ? 0o700 : 0o600);
    return;
  }
  const user = `${process.env.USERDOMAIN}\\${process.env.USERNAME}`;
  const result = spawnSync("icacls", [path, "/inheritance:r", "/grant:r", `${user}:${folder ? "(OI)(CI)F" : "F"}`], { encoding: "utf8" });
  if (result.status !== 0) fail(`icacls ${path}: ${result.stdout}${result.stderr}`);
}

/** Loopback only: a lab may point at a local fake control plane, never at the real one. */
const loopback = (value) => {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
};

/**
 * Engine and Terminus variables of the calling shell never reach the lab. On an agent
 * host they carry the real Danil machine credential (`SELDON_DANIL_MACHINE_FILE`) and
 * the calling task's connection: inherited, the throwaway lab signs in to the real
 * account and links its workspace there.
 */
function inherited() {
  const env = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (/^(SELDON|TERMINUS|DANIL)_/i.test(name) && !(/^DANIL_COMPUTERS_URL$/i.test(name) && loopback(value))) continue;
    env[name] = value;
  }
  return env;
}

function labEnvironment(extra = {}) {
  const env = { ...inherited(), HOME, TMPDIR: TMP, TEMP: TMP, TMP, HARNESS_IGNORE_SYSTEM_AGENTS: "1", ...extra };
  if (WINDOWS) {
    Object.assign(env, {
      USERPROFILE: HOME,
      APPDATA: join(HOME, "AppData", "Roaming"),
      LOCALAPPDATA: join(HOME, "AppData", "Local"),
    });
  }
  return env;
}

function ensureLocalFile(flag, sourcePath) {
  if (!existsSync(sourcePath)) fail(`--${flag} file does not exist: ${sourcePath}`);
}

async function installBinaryFromSpec({ label, target, binaryName, spec, downloadDir, exe, fetcher, log }) {
  validatePinnedSpec(label, spec);
  const bytes = await fetcher(spec.url);
  const got = verifyPinnedBytes(label, bytes, spec);
  const archive = join(downloadDir, spec.url.split("/").pop() || `${binaryName}${exe}`);
  mkdirSync(dirname(archive), { recursive: true });
  writeFileSync(archive, bytes);
  if (ARCHIVE_RE.test(archive)) {
    const out = join(downloadDir, `unpacked-${binaryName}`);
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    const result = spawnSync("tar", ["-xf", archive, "-C", out], { stdio: "inherit" });
    if (result.status !== 0) fail(`Could not unpack ${archive}.`);
    const found = findFile(out, `${binaryName}${exe}`);
    if (!found) fail(`${archive} does not contain ${binaryName}${exe}.`);
    copyFileSync(found, target);
  } else {
    copyFileSync(archive, target);
  }
  if (!exe) chmodSync(target, 0o755);
  log(`${label} installed at ${target} (sha256 ${got} verified).`);
  return target;
}

export async function downloadBinaries({
  lock = LOCK,
  platform = PLATFORM,
  engineDir = ENGINE_DIR,
  from = null,
  cliFrom = null,
  knFrom = null,
  fetcher = fetchRetrying,
  log = console.log,
} = {}) {
  const exe = platform.includes("windows") ? ".exe" : "";
  const binDir = join(engineDir, "bin");
  const engineTarget = join(binDir, `seldon-runtime${exe}`);
  const downloadDir = join(engineDir, "download");
  const pinned = lock.platforms?.[platform];
  mkdirSync(binDir, { recursive: true });

  if (from) {
    ensureLocalFile("from", from);
    copyExecutable(from, engineTarget);
    log(`Copied ${from} (sha256 ${sha256(engineTarget)}). This is a local build, not the one pinned in seldon-runtime.lock.`);
  } else {
    if (!pinned?.url || !pinned?.sha256) {
      fail(
        `No seldon-runtime has been published for ${platform} yet (release ${lock.release}).\n` +
          `The Danil window cannot run on this platform until it is. If you have an engine binary,\n` +
          `use it with: node scripts/engine.mjs download --from <path-to-seldon-runtime${exe}>`,
      );
    }
    await installBinaryFromSpec({
      label: `seldon-runtime ${lock.engine_version} (${lock.release})`,
      target: engineTarget,
      binaryName: "seldon-runtime",
      spec: pinned,
      downloadDir,
      exe,
      fetcher,
      log,
    });
  }

  const localCompanions = { cli: cliFrom, kn: knFrom };
  const companions = {};
  for (const { key, name, flag } of COMPANION_BINARIES) {
    const target = join(binDir, `${name}${exe}`);
    const localPath = localCompanions[key];
    if (localPath) {
      ensureLocalFile(flag, localPath);
      copyExecutable(localPath, target);
      log(`Copied ${localPath} to ${target} (sha256 ${sha256(target)}). This is a local build, not the one pinned in seldon-runtime.lock.`);
      companions[key] = target;
      continue;
    }
    const spec = pinned?.[key];
    if (!spec) continue;
    companions[key] = await installBinaryFromSpec({
      label: `${name} (${platform})`,
      target,
      binaryName: name,
      spec,
      downloadDir,
      exe,
      fetcher,
      log,
    });
  }
  return { engine: engineTarget, companions };
}

async function download() {
  await downloadBinaries({
    from: option("from"),
    cliFrom: option("cli-from"),
    knFrom: option("kn-from"),
  });
}

/**
 * The engine the installer packages: Tauri looks for `src-tauri/binaries/<name>-<triple>` for every
 * name in `bundle.externalBin`. The pinned binary is downloaded once and placed as `danil-engine`
 * and as the alias `seldon-runtime`, byte for byte.
 */
const SIDECAR_NAMES = ["danil-engine", "seldon-runtime"];

async function sidecar() {
  const triple = rawOption("target", process.platform === "darwin" ? "aarch64-apple-darwin" : PLATFORM);
  await placeSidecar(triple, {
    from: option("from"),
    cliFrom: option("cli-from"),
    knFrom: option("kn-from"),
  });
}

function copyExecutable(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  if (!to.endsWith(".exe")) chmodSync(to, 0o755);
}

async function fetchRetrying(url, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    console.log(`Downloading ${url}`);
    let response;
    try {
      response = await fetch(url, { redirect: "follow" });
    } catch (error) {
      if (attempt >= attempts) fail(`Download failed: ${error.message}`);
      continue;
    }
    if (!response.ok) fail(`Download failed: HTTP ${response.status}`);
    try {
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt >= attempts) fail(`Download failed: ${error.message}`);
    }
  }
}

export const sidecarPath = (triple, name = SIDECAR_NAMES[0], root = ROOT) =>
  join(root, "src-tauri", "binaries", `${name}-${triple}${triple.includes("windows") ? ".exe" : ""}`);

async function placeCompanionSidecar(triple, { name, flag }, { spec, localPath, root, fetcher, log }) {
  const target = sidecarPath(triple, name, root);
  if (localPath) {
    ensureLocalFile(flag, localPath);
    copyExecutable(localPath, target);
    log(`Companion sidecar ready (local): ${target} (sha256 ${sha256(target)}).`);
    return target;
  }
  if (!spec) return null;
  validatePinnedSpec(`${name} (${triple})`, spec);
  if (ARCHIVE_RE.test(spec.url)) fail(`The ${name} sidecar takes a bare executable; ${triple} is pinned as an archive.`);
  if (matchesPinnedFile(target, spec)) {
    log(`Companion sidecar in place: ${target} (sha256 matches the lock).`);
    return target;
  }
  const bytes = await fetcher(spec.url);
  const got = verifyPinnedBytes(`${name} (${triple})`, bytes, spec);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  if (!triple.includes("windows")) chmodSync(target, 0o755);
  log(`Companion sidecar ready: ${target} (sha256 ${got}).`);
  return target;
}

/** One pinned engine under every name, plus optional `danil`/`kn` companion sidecars when pinned or passed locally. */
export async function placeSidecar(
  triple,
  { lock = LOCK, root = ROOT, from = null, cliFrom = null, knFrom = null, fetcher = fetchRetrying, log = console.log } = {},
) {
  const pinned = lock.platforms?.[triple];
  const targets = SIDECAR_NAMES.map((name) => sidecarPath(triple, name, root));
  if (from) {
    ensureLocalFile("from", from);
    for (const target of targets) copyExecutable(from, target);
    log(`Sidecar ready (local): ${targets.join(", ")} (sha256 ${sha256(targets[0])}).`);
  } else {
    if (!pinned?.url || !pinned?.sha256) fail(`seldon-runtime.lock does not pin ${triple}: the bundle cannot carry the engine.`);
    validatePinnedSpec(`engine (${triple})`, pinned);
    if (ARCHIVE_RE.test(pinned.url)) fail(`The sidecar takes a bare executable; ${triple} is pinned as an archive.`);
    const source = targets.find((target) => matchesPinnedFile(target, pinned));
    if (source) {
      for (const target of targets) {
        if (target !== source && !matchesPinnedFile(target, pinned)) copyExecutable(source, target);
      }
      log(`Sidecar in place: ${targets.join(", ")} (sha256 matches the lock).`);
    } else {
      const bytes = await fetcher(pinned.url);
      const got = verifyPinnedBytes(triple, bytes, pinned);
      mkdirSync(dirname(targets[0]), { recursive: true });
      for (const target of targets) {
        writeFileSync(target, bytes);
        if (!triple.includes("windows")) chmodSync(target, 0o755);
      }
      log(`Sidecar ready: ${targets.join(", ")} (sha256 ${got}).`);
    }
  }

  const localCompanions = { cli: cliFrom, kn: knFrom };
  for (const companion of COMPANION_BINARIES) {
    await placeCompanionSidecar(triple, companion, {
      spec: pinned?.[companion.key],
      localPath: localCompanions[companion.key],
      root,
      fetcher,
      log,
    });
  }
  return targets[0];
}

function findFile(dir, name) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(path, name);
      if (found) return found;
    } else if (entry.name === name) return path;
  }
  return null;
}

const endpoint = () => JSON.parse(readFileSync(join(DATA, "seldon-endpoint.json"), "utf8"));

/** One RPC1 request over the engine's local socket. */
function rpc(name, args = {}) {
  const ep = endpoint();
  const separator = ep.address.lastIndexOf(":");
  const request = {
    version: 1,
    token: readFileSync(ep.token_file, "utf8"),
    workspace: null,
    folder: null,
    command: name,
    args,
    request_id: randomUUID(),
  };
  return new Promise((done, reject) => {
    const socket = createConnection({ host: ep.address.slice(0, separator), port: Number(ep.address.slice(separator + 1)) });
    let buffer = "";
    socket.setTimeout(10_000, () => socket.destroy(new Error("engine did not answer in 10 s")));
    socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on("data", (chunk) => {
      buffer += chunk;
      const end = buffer.indexOf("\n");
      if (end >= 0) {
        socket.end();
        done(JSON.parse(buffer.slice(0, end)));
      }
    });
    socket.on("error", reject);
  });
}

/**
 * macOS resolves the default keychain from HOME. With the lab HOME there is none
 * ("A default keychain could not be found"): the vault never opens and a personal
 * workspace cannot keep secrets or decide the Free Router consent. The lab gets a
 * throwaway keychain, with no password and no auto-lock; the person's keychain and
 * search list stay untouched. Not `login.keychain-db`: macOS refuses an empty password.
 */
function labKeychain() {
  if (process.platform !== "darwin") return;
  const keychain = join(HOME, "Library", "Keychains", "lab.keychain-db");
  mkdirSync(dirname(keychain), { recursive: true });
  mkdirSync(join(HOME, "Library", "Preferences"), { recursive: true });
  const security = (...args) => {
    const result = spawnSync("security", args, { env: { ...process.env, HOME }, encoding: "utf8" });
    if (result.status !== 0) fail(`security ${args[0]} (lab keychain ${keychain}): ${result.stdout}${result.stderr}`);
  };
  if (!existsSync(keychain)) {
    security("create-keychain", "-p", "", keychain);
    security("set-keychain-settings", keychain);
  }
  security("unlock-keychain", "-p", "", keychain);
  security("default-keychain", "-d", "user", "-s", keychain);
}

async function startEngine() {
  if (!existsSync(ENGINE)) fail(`No engine at ${ENGINE}. Run: node scripts/engine.mjs download`);
  for (const dir of [join(LAB, "resources"), join(HOME, "AppData", "Roaming"), join(HOME, "AppData", "Local"), join(HOME, "Desktop"), TMP, WINDOW_DATA]) {
    mkdirSync(dir, { recursive: true });
  }
  labKeychain();
  const log = openSync(join(LAB, "engine.log"), "a");
  const child = spawn(ENGINE, ["--data-dir", DATA, "--resource-dir", join(LAB, "resources"), "--identity", IDENTITY], {
    cwd: LAB,
    env: labEnvironment(),
    detached: true,
    windowsHide: true,
    stdio: ["ignore", log, log],
  });
  let exited = null;
  child.on("exit", (code) => {
    exited = code;
  });
  child.unref();
  for (let i = 0; i < 300; i++) {
    if (exited !== null) fail(`The engine exited with ${exited}. See ${join(LAB, "engine.log")}.`);
    if (existsSync(join(DATA, "seldon-endpoint.json")) && endpoint().pid === child.pid) {
      const ep = endpoint();
      console.log(JSON.stringify({ pid: child.pid, runtime: ep.runtime, contract: ep.contract }));
      // The window speaks the vendored commands.json, which may be ahead of the lock (MOTOR_PENDIENTE).
      const vendored = sha256(join(ROOT, "src-tauri", "crates", "engine-protocol", "commands.json"));
      if (ep.contract !== vendored) console.warn(`Warning: the engine speaks contract ${ep.contract}; this window expects ${vendored}.`);
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  fail("The engine did not become ready in 30 s.");
}

async function select() {
  const ep = endpoint();
  const status = await rpc("status");
  if (status.error) fail(JSON.stringify(status.error));
  const value = {
    version: 1,
    endpoint: join(DATA, "seldon-endpoint.json"),
    credential: ep.token_file,
    runtime: ep.runtime,
    data_directory: ep.data_directory,
    contract: ep.contract,
    service_build: status.result.service_build,
    window_data: WINDOW_DATA,
  };
  writeFileSync(SELECTION, JSON.stringify(value));
  makePrivate(SELECTION);
  makePrivate(WINDOW_DATA, true);
  console.log(JSON.stringify({ selection: SELECTION, runtime: ep.runtime, build: status.result.build }));
}

/**
 * Las VMs de Lima y Colima de la persona: con el HOME del laboratorio, la
 * ventana no vería `~/.lima` ni `~/.colima` («Linux en esta Mac»). Solo se
 * pasan las carpetas, y una ya definida se respeta.
 */
function localGuestHomes() {
  if (process.platform !== "darwin") return {};
  const real = homedir();
  return {
    LIMA_HOME: process.env.LIMA_HOME || join(real, ".lima"),
    COLIMA_HOME: process.env.COLIMA_HOME || join(real, ".colima"),
  };
}

function openWindow() {
  if (!existsSync(WINDOW)) fail(`No window binary at ${WINDOW}. Build it first (see README, "Build from source").`);
  const port = rest[rest.indexOf("--cdp-port") + 1];
  const debug = rest.includes("--cdp-port") && port ? { WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` } : {};
  const child = spawn(WINDOW, ["--external-host", SELECTION], {
    cwd: LAB,
    env: labEnvironment({ ...debug, ...localGuestHomes() }),
    detached: true,
    stdio: ["ignore", openSync(join(LAB, "window.err"), "w"), openSync(join(LAB, "window.err"), "a")],
  });
  child.unref();
  console.log(JSON.stringify({ window: child.pid, errors: join(LAB, "window.err") }));
}

const commands = {
  download,
  sidecar,
  engine: startEngine,
  select,
  window: openWindow,
  async start() {
    await startEngine();
    await select();
    openWindow();
  },
  async status() {
    console.log(JSON.stringify((await rpc("status")).result, null, 1));
  },
  async stop() {
    console.log(JSON.stringify(await rpc("service stop")));
  },
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!commands[command]) {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n\/\*\*\n/, "").replace(/^ \* ?/gm, ""));
    process.exit(command === "help" ? 0 : 1);
  }
  try {
    await commands[command]();
  } catch (error) {
    console.error(error?.message ?? error);
    process.exit(1);
  }
}
