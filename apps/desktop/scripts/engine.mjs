#!/usr/bin/env node
/**
 * Downloads the Seldon engine (`seldon-runtime`) pinned in `seldon-runtime.lock`
 * and runs the Terminus window against it with throwaway data.
 *
 *   node scripts/engine.mjs download [--from <seldon-runtime>]
 *   node scripts/engine.mjs sidecar   places the pinned engine in src-tauri/binaries/ for `bundle.externalBin`
 *   node scripts/engine.mjs start    [--window <terminus>] [--lab <dir>]
 *   node scripts/engine.mjs engine | select | window | status | stop  [--lab <dir>]
 *
 * `window --cdp-port <port>` opens WebView2 remote debugging (Windows) for UI tests.
 *
 * The engine is a proprietary binary by Danil; its source is not in this
 * repository; its terms are linked from the lock (`terms`). A download is
 * accepted only when its SHA-256 matches the lock.
 * `--from` copies a local build instead and says that it is not the pinned one.
 *
 * Everything lives under `.engine/` (ignored by git). The lab never touches the
 * data, keychain or accounts of an installed Terminus: the engine gets its own
 * data directory, HOME, temp folder and the identity `ai.danil.seldon.dev`.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK = JSON.parse(readFileSync(join(ROOT, "seldon-runtime.lock"), "utf8"));
const IDENTITY = "ai.danil.seldon.dev";
const WINDOWS = process.platform === "win32";
const EXE = WINDOWS ? ".exe" : "";
const ARCH = { x64: "x86_64", arm64: "aarch64" }[process.arch] ?? process.arch;
const PLATFORM = `${ARCH}-${{ win32: "pc-windows-msvc", darwin: "apple-darwin", linux: "unknown-linux-gnu" }[process.platform] ?? process.platform}`;

const [command = "help", ...rest] = process.argv.slice(2);
const option = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 && rest[i + 1] ? resolve(rest[i + 1]) : fallback;
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
  console.error(message);
  process.exit(1);
}

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

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

async function download() {
  const from = option("from");
  mkdirSync(dirname(ENGINE), { recursive: true });
  if (from) {
    copyFileSync(from, ENGINE);
    if (!WINDOWS) chmodSync(ENGINE, 0o755);
    console.log(`Copied ${from} (sha256 ${sha256(ENGINE)}). This is a local build, not the one pinned in seldon-runtime.lock.`);
    return;
  }
  const pinned = LOCK.platforms[PLATFORM];
  if (!pinned?.url || !pinned?.sha256) {
    fail(
      `No seldon-runtime has been published for ${PLATFORM} yet (release ${LOCK.release}).\n` +
        `The Danil window cannot run on this platform until it is. If you have an engine binary,\n` +
        `use it with: node scripts/engine.mjs download --from <path-to-seldon-runtime${EXE}>`,
    );
  }
  console.log(`Downloading ${pinned.url}`);
  const response = await fetch(pinned.url, { redirect: "follow" });
  if (!response.ok) fail(`Download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== pinned.sha256) fail(`SHA-256 mismatch: expected ${pinned.sha256}, got ${got}. Nothing was installed.`);
  const archive = join(ENGINE_DIR, "download", pinned.url.split("/").pop());
  mkdirSync(dirname(archive), { recursive: true });
  writeFileSync(archive, bytes);
  if (/\.(zip|tar\.gz|tgz)$/.test(archive)) {
    const out = join(ENGINE_DIR, "download", "unpacked");
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    const result = spawnSync("tar", ["-xf", archive, "-C", out], { stdio: "inherit" });
    if (result.status !== 0) fail(`Could not unpack ${archive}.`);
    const found = findFile(out, `seldon-runtime${EXE}`);
    if (!found) fail(`${archive} does not contain seldon-runtime${EXE}.`);
    copyFileSync(found, ENGINE);
  } else {
    copyFileSync(archive, ENGINE);
  }
  if (!WINDOWS) chmodSync(ENGINE, 0o755);
  console.log(`seldon-runtime ${LOCK.engine_version} (${LOCK.release}) installed at ${ENGINE} (sha256 verified).`);
}

/**
 * The engine the installer packages: Tauri looks for `src-tauri/binaries/seldon-runtime-<triple>`
 * on every platform. macOS also gets `universal-apple-darwin`, a `lipo` of both pinned binaries,
 * for the universal bundle.
 */
async function sidecar() {
  const triples = process.platform === "darwin" ? ["aarch64-apple-darwin", "x86_64-apple-darwin"] : [PLATFORM];
  const placed = [];
  for (const triple of triples) placed.push(await placeSidecar(triple));
  if (process.platform === "darwin") {
    const universal = sidecarPath("universal-apple-darwin");
    const result = spawnSync("lipo", ["-create", "-output", universal, ...placed], { stdio: "inherit" });
    if (result.status !== 0) fail(`lipo could not build ${universal}.`);
    chmodSync(universal, 0o755);
    console.log(`Sidecar ready: ${universal} (lipo of ${triples.join(", ")}).`);
  }
}

async function fetchRetrying(url, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    console.log(`Downloading ${url}`);
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) fail(`Download failed: HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt >= attempts) fail(`Download failed: ${error.message}`);
    }
  }
}

const sidecarPath = (triple) => join(ROOT, "src-tauri", "binaries", `seldon-runtime-${triple}${triple.includes("windows") ? ".exe" : ""}`);

/** One pinned engine, downloaded only when the copy in place does not match the lock. */
async function placeSidecar(triple) {
  const pinned = LOCK.platforms[triple];
  if (!pinned?.url || !pinned?.sha256) fail(`seldon-runtime.lock does not pin ${triple}: the bundle cannot carry the engine.`);
  if (/\.(zip|tar\.gz|tgz)$/.test(pinned.url)) fail(`The sidecar takes a bare executable; ${triple} is pinned as an archive.`);
  const target = sidecarPath(triple);
  if (existsSync(target) && sha256(target) === pinned.sha256) {
    console.log(`Sidecar in place: ${target} (sha256 matches the lock).`);
    return target;
  }
  const bytes = await fetchRetrying(pinned.url);
  const got = createHash("sha256").update(bytes).digest("hex");
  if (got !== pinned.sha256) fail(`SHA-256 mismatch for ${triple}: expected ${pinned.sha256}, got ${got}. Nothing was placed.`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  if (!triple.includes("windows")) chmodSync(target, 0o755);
  console.log(`Sidecar ready: ${target} (sha256 ${got}).`);
  return target;
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

async function startEngine() {
  if (!existsSync(ENGINE)) fail(`No engine at ${ENGINE}. Run: node scripts/engine.mjs download`);
  for (const dir of [join(LAB, "resources"), join(HOME, "AppData", "Roaming"), join(HOME, "AppData", "Local"), join(HOME, "Desktop"), TMP, WINDOW_DATA]) {
    mkdirSync(dir, { recursive: true });
  }
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

function openWindow() {
  if (!existsSync(WINDOW)) fail(`No window binary at ${WINDOW}. Build it first (see README, "Build from source").`);
  const port = rest[rest.indexOf("--cdp-port") + 1];
  const debug = rest.includes("--cdp-port") && port ? { WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` } : {};
  const child = spawn(WINDOW, ["--external-host", SELECTION], {
    cwd: LAB,
    env: labEnvironment(debug),
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

if (!commands[command]) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n\/\*\*\n/, "").replace(/^ \* ?/gm, ""));
  process.exit(command === "help" ? 0 : 1);
}
await commands[command]();
