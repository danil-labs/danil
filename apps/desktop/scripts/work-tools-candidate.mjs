#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { isReleaseVersion } from "./release-version.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const options = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  if (!process.argv[i].startsWith("--") || !process.argv[i + 1]) throw new Error("Expected --name value pairs.");
  options.set(process.argv[i].slice(2), process.argv[i + 1]);
}
const required = (name) => {
  const value = options.get(name);
  if (!value) throw new Error(`Missing --${name}.`);
  return value;
};
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const version = required("version");
if (!isReleaseVersion(version)) throw new Error("Use a new stable or prerelease SemVer candidate version.");
if (JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version !== version) throw new Error("Bump the project version before preparing its candidate.");
const engine = resolve(required("engine"));
const resources = resolve(required("resources"));
const expectedEngine = required("engine-sha256");
const expectedManifest = required("manifest-sha256");
if (hash(engine) !== expectedEngine) throw new Error("Candidate engine SHA-256 mismatch.");
const manifestPath = join(resources, "manifest.json");
if (hash(manifestPath) !== expectedManifest) throw new Error("Candidate resources SHA-256 mismatch.");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const arch = { x64: "x86_64", arm64: "aarch64" }[process.arch];
const os = { darwin: "apple-darwin", linux: "unknown-linux-gnu", win32: "pc-windows-msvc" }[process.platform];
const target = `${arch}-${os}`;
if (!arch || !os || manifest.schema !== 2 || manifest.layout !== "tree" || manifest.target !== target) throw new Error("Candidate resources must be a prepared tree for the native target.");
if (hash(join(resources, "inventory.json")) !== manifest.inventory_sha256) throw new Error("Candidate inventory SHA-256 mismatch.");
const resourcesInventory = join(dirname(resources), "resources-inventory.json");
if (process.platform === "linux" && !existsSync(resourcesInventory)) throw new Error("Prepare with --tauri-config first: the AppImage needs resources-inventory.json.");
const lock = JSON.parse(readFileSync(join(root, "seldon-runtime.lock"), "utf8"));
if (Object.values(lock.platforms ?? {}).some((pin) => pin.sha256 === expectedEngine)) throw new Error("Candidate engine is the published pin; a new local engine is required.");
const contract = hash(join(root, "src-tauri/crates/engine-protocol/commands.json"));
const bundleEnvironment = process.platform === "linux" ? {
  NO_STRIP: "1",
  PATCHELF: join(root, "scripts/work-tools-patchelf.py"),
  TERMINUS_REAL_PATCHELF: resolve(required("patchelf")),
  TERMINUS_WORK_TOOLS_ROOT: join(root, "src-tauri/target/release/bundle/appimage/Danil.AppDir/usr/share/Danil/work-tools"),
} : {};
const output = join(root, ".engine", `work-tools-candidate-${version}-${target}`);
if (existsSync(output)) throw new Error("Candidate directory already exists; use a new version or inspect it first.");
mkdirSync(output, { recursive: true });
const stagedResources = join(output, "resources", "work-tools", target);
cpSync(resources, stagedResources, { recursive: true, dereference: false, errorOnExist: true, force: false });
if (hash(join(stagedResources, "manifest.json")) !== expectedManifest) throw new Error("Candidate manifest copy failed verification.");
if (process.platform === "linux") copyFileSync(resourcesInventory, join(output, "resources", "resources-inventory.json"));
const lab = mkdtempSync(join(output, "contract-lab-"));
const home = join(lab, "home");
mkdirSync(home);
const env = { HOME: home, USERPROFILE: home, PATH: process.platform === "win32" ? `${process.env.SystemRoot}\\System32` : "/usr/bin:/bin", TMPDIR: lab, TMP: lab, TEMP: lab };
for (const key of ["SystemRoot", "COMSPEC", "PATHEXT"]) if (process.env[key]) env[key] = process.env[key];
const child = spawn(engine, ["--data-dir", join(lab, "data"), "--resource-dir", join(output, "resources"), "--identity", "ai.danil.seldon.dev"], { env, stdio: "ignore" });
let started = false;
try {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Candidate engine exited: ${child.exitCode}.`);
    const endpointFile = join(lab, "data", "seldon-endpoint.json");
    if (existsSync(endpointFile)) {
      const endpoint = JSON.parse(readFileSync(endpointFile, "utf8"));
      if (endpoint.pid === child.pid) {
        if (endpoint.contract !== contract) throw new Error("Candidate engine contract does not match the window.");
        started = true;
        break;
      }
    }
    await delay(100);
  }
  if (!started) throw new Error("Candidate engine did not publish its contract.");
} finally {
  child.kill("SIGTERM");
  await Promise.race([new Promise((done) => child.once("exit", done)), delay(5000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
  rmSync(lab, { recursive: true, force: true });
}
const binaries = join(output, "binaries");
mkdirSync(binaries);
const extension = process.platform === "win32" ? ".exe" : "";
const sidecar = join(binaries, `seldon-runtime-${target}${extension}`);
copyFileSync(engine, sidecar);
if (hash(sidecar) !== expectedEngine) throw new Error("Candidate sidecar copy failed verification.");
const config = {
  version,
  build: { beforeBuildCommand: "pnpm build" },
  // Los resources de Tauri copian el destino de cada symlink; macOS y AppImage `files`, no.
  bundle: {
    createUpdaterArtifacts: false,
    externalBin: [join(binaries, "seldon-runtime")],
    ...(process.platform === "linux"
      ? { linux: { appimage: { files: { [`/usr/share/Danil/work-tools/${target}`]: stagedResources, "/usr/share/Danil/lenguas": join(root, "plugins", "languages"), "/usr/share/Danil/resources-inventory.json": join(output, "resources", "resources-inventory.json") } } } }
      : process.platform === "darwin"
        ? { macOS: { files: { [`Resources/work-tools/${target}`]: stagedResources } } }
        : { resources: { [stagedResources]: `work-tools/${target}` } }),
  },
};
const configPath = join(output, "tauri.candidate.json");
writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
writeFileSync(join(output, "candidate.json"), `${JSON.stringify({ schema: 1, version, target, engine_sha256: expectedEngine, resource_manifest_sha256: expectedManifest, contract, published_engine_lock: false, updater_signature: false, production_identity_changed: false, native_platforms_tested: [], source_engine: "local engine build; see SHA-256", resources: `resources/work-tools/${target}`, browser_catalog_sha256: hash(join(stagedResources, "browser-navigation.json")), bundle_environment: bundleEnvironment }, null, 2)}\n`);
console.log(JSON.stringify({ config: configPath, metadata: join(output, "candidate.json"), target, version, bundle_environment: bundleEnvironment, next: `Apply bundle_environment to pnpm tauri build --config ${configPath}; then run work-tools-candidate-verify.py on the final AppImage.` }, null, 2));
