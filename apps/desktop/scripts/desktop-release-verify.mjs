// La compuerta de una publicación manual: abre el instalador, AppImage o .app ya
// construido y exige las herramientas con su inventario, como publish.yml tras empaquetar.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Igual que ENGINE_NAMES en src-tauri/src/extracted/engine.rs (guarda `engine-names`).
export const ENGINE_NAMES = ["danil-engine", "seldon-runtime"];
export const COMPANION_BINARIES = [
  { key: "cli", name: "danil" },
  { key: "kn", name: "kn" },
];
const SHA256_RE = /^[0-9a-f]{64}$/;
export const TARGETS = {
  win32: ["x86_64-pc-windows-msvc"],
  linux: ["x86_64-unknown-linux-gnu"],
  darwin: ["aarch64-apple-darwin"],
};

const PLATFORM_LAYOUTS = {
  linux: { resources: "squashfs-root/usr/share/Danil/work-tools", engines: "squashfs-root/usr/bin", suffix: "" },
  win32: { resources: "work-tools", engines: "", suffix: ".exe" },
  darwin: { resources: "Contents/Resources/work-tools", engines: "Contents/MacOS", suffix: "" },
};

/** Qué plataforma es el artefacto y dónde quedan sus herramientas una vez abierto. */
export function artifactPlan(artifact, host = process.platform) {
  const name = basename(artifact.replace(/[\\/]+$/, ""));
  const platform = name.endsWith(".AppImage") ? "linux" : name.endsWith(".exe") ? "win32" : /\.(app|dmg)$/.test(name) ? "darwin" : null;
  if (!platform) throw new Error(`no sé abrir ${name}: pasa el *_x64-setup.exe, el *.AppImage, el Danil.app o el .dmg`);
  if (platform !== host) {
    throw new Error(`${name} se verifica en ${platform}: su motor tiene que correr y el inventario se lee con las reglas de esa plataforma`);
  }
  const layout = PLATFORM_LAYOUTS[platform];
  const engines = ENGINE_NAMES.map((name) => (layout.engines ? `${layout.engines}/${name}${layout.suffix}` : `${name}${layout.suffix}`));
  return { platform, targets: TARGETS[platform], resources: layout.resources, engine: engines[0], engines };
}

/** Rutas relativas de los binarios hermanos delgados (`danil`, `kn`) dentro del paquete abierto. */
export function companionPaths(plan) {
  const layout = PLATFORM_LAYOUTS[plan.platform];
  return COMPANION_BINARIES.map(({ key, name }) => ({
    key,
    name,
    rel: layout.engines ? `${layout.engines}/${name}${layout.suffix}` : `${name}${layout.suffix}`,
  }));
}

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

/**
 * `danil-engine` y su alias tienen los mismos bytes y son los del lock (`accepted`: los SHA-256
 * que valen en esta plataforma). En macOS la firma cambia los bytes: ahí se pide `accepted = null`
 * y solo se exige que estén los dos.
 */
export function checkEngines(paths, accepted) {
  const problems = [];
  const present = paths.filter((path) => {
    if (existsSync(path)) return true;
    problems.push(`el paquete no trae ${basename(path)}`);
    return false;
  });
  if (!accepted) return problems;
  const hashes = new Map(present.map((path) => [path, sha256(path)]));
  if (new Set(hashes.values()).size > 1) problems.push(`${present.map((path) => basename(path)).join(" y ")} no tienen los mismos bytes`);
  for (const [path, hash] of hashes) {
    if (!accepted.has(hash)) problems.push(`${basename(path)} (sha256 ${hash}) no es el motor fijado en seldon-runtime.lock`);
  }
  return problems;
}

/** Verifica existencia, SHA-256 (y tamaño si aplica) de cada binario hermano fijado en el lock. */
export function checkCompanions(entries) {
  const problems = [];
  for (const { name, path, accepted, pinnedSha256, expectedSize } of entries) {
    if (!existsSync(path)) {
      problems.push(`el paquete no trae ${basename(path)}`);
      continue;
    }
    if (!accepted) continue;
    const hash = sha256(path);
    if (!accepted.has(hash)) {
      problems.push(`${basename(path)} (sha256 ${hash}) no es el binario ${name} fijado en seldon-runtime.lock`);
      continue;
    }
    if (expectedSize !== undefined && hash === pinnedSha256) {
      const actualSize = statSync(path).size;
      if (actualSize !== expectedSize) {
        problems.push(`${basename(path)} mide ${actualSize} bytes; seldon-runtime.lock fija ${expectedSize}`);
      }
    }
  }
  return problems;
}

/** En macOS los dos se firman con el identificador `seldon-runtime` que exige la ventana. */
export function checkEngineIdentifiers(paths, describe = codesignDetails) {
  return paths
    .filter((path) => existsSync(path))
    .flatMap((path) => {
      const identifier = /^Identifier=(.+)$/m.exec(describe(path))?.[1];
      return identifier === "seldon-runtime" ? [] : [`${basename(path)} está firmado como ${identifier ?? "nada"}, no como seldon-runtime`];
    });
}

/** En macOS `danil` y `kn` se firman con su propio nombre, no como `seldon-runtime`. */
export function checkCompanionIdentifiers(entries, describe = codesignDetails) {
  return entries
    .filter(({ path }) => existsSync(path))
    .flatMap(({ name, path }) => {
      const identifier = /^Identifier=(.+)$/m.exec(describe(path))?.[1];
      return identifier === name ? [] : [`${basename(path)} está firmado como ${identifier ?? "nada"}, no como ${name}`];
    });
}

function codesignDetails(path) {
  const result = spawnSync("codesign", ["-dv", path], { encoding: "utf8" });
  return `${result.stdout}${result.stderr}`;
}

/**
 * Los SHA-256 que vale el motor empaquetado: el del lock y, en un AppImage, el mismo binario con
 * el RUNPATH que le pone linuxdeploy (`work-tools-candidate-verify.py`).
 */
function acceptedEngines(plan, scratch) {
  if (plan.platform === "darwin") return null;
  const lock = JSON.parse(readFileSync(join(ROOT, "seldon-runtime.lock"), "utf8"));
  const [target] = plan.targets;
  const pinned = lock.platforms?.[target]?.sha256;
  if (!pinned) throw new Error(`seldon-runtime.lock no fija ${target}`);
  const accepted = new Set([pinned]);
  if (plan.platform !== "linux") return accepted;
  const sidecar = join(ROOT, "src-tauri/binaries", `${ENGINE_NAMES[0]}-${target}`);
  if (!existsSync(sidecar) || sha256(sidecar) !== pinned) {
    throw new Error(`falta ${sidecar} con el motor del lock: corre node scripts/engine.mjs sidecar`);
  }
  const patchelf = process.env.TERMINUS_REAL_PATCHELF || "patchelf";
  const expected = join(scratch, "expected-engine");
  copyFileSync(sidecar, expected);
  run(patchelf, ["--set-rpath", "$ORIGIN/../lib", expected]);
  accepted.add(sha256(expected));
  return accepted;
}

/** Binarios hermanos esperados en este paquete según `seldon-runtime.lock` (vacío en locks sin `cli`/`kn`). */
export function resolveCompanions(
  plan,
  base,
  scratch,
  {
    lock = JSON.parse(readFileSync(join(ROOT, "seldon-runtime.lock"), "utf8")),
    binariesDir = join(ROOT, "src-tauri/binaries"),
    patchelf = process.env.TERMINUS_REAL_PATCHELF || "patchelf",
    runCommand = run,
  } = {},
) {
  const [target] = plan.targets;
  const platformPin = lock.platforms?.[target];
  if (!platformPin) throw new Error(`seldon-runtime.lock no fija ${target}`);
  const resolved = [];
  for (const { key, name, rel } of companionPaths(plan)) {
    const spec = platformPin[key];
    if (!spec) continue;
    if (typeof spec.sha256 !== "string" || !SHA256_RE.test(spec.sha256)) {
      throw new Error(`seldon-runtime.lock declara ${target}.${key} con sha256 inválido`);
    }
    if (spec.size !== undefined && (!Number.isInteger(spec.size) || spec.size <= 0)) {
      throw new Error(`seldon-runtime.lock declara ${target}.${key} con size inválido`);
    }
    let accepted = null;
    if (plan.platform !== "darwin") {
      accepted = new Set([spec.sha256]);
      if (plan.platform === "linux") {
        const sidecar = join(binariesDir, `${name}-${target}`);
        if (!existsSync(sidecar) || sha256(sidecar) !== spec.sha256) {
          throw new Error(`falta ${sidecar} con el binario ${name} del lock: corre node scripts/engine.mjs sidecar`);
        }
        const expected = join(scratch, `expected-${name}`);
        copyFileSync(sidecar, expected);
        runCommand(patchelf, ["--set-rpath", "$ORIGIN/../lib", expected]);
        accepted.add(sha256(expected));
      }
    }
    resolved.push({ key, name, path: join(base, rel), pinnedSha256: spec.sha256, expectedSize: spec.size, accepted });
  }
  return resolved;
}

/** Cada árbol que el paquete tiene que traer, con un manifiesto de esta generación. */
export function checkManifests(resources, targets) {
  const problems = [];
  for (const target of targets) {
    const path = join(resources, target, "manifest.json");
    if (!existsSync(path)) {
      problems.push(`falta ${target}/manifest.json: el paquete no trae work-tools/${target}`);
      continue;
    }
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      problems.push(`${target}/manifest.json no se lee: ${error.message}`);
      continue;
    }
    if (manifest.schema !== 2 || manifest.layout !== "tree" || manifest.target !== target) {
      problems.push(`${target}/manifest.json no es un árbol de esquema 2 para ${target} (schema ${manifest.schema}, layout ${manifest.layout}, target ${manifest.target})`);
    }
  }
  return problems;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw new Error(`${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${basename(command)} ${args[0] ?? ""} salió con ${result.status}`);
}

function sevenZip() {
  const names = ["7z.exe", "7zz.exe", "7za.exe", "7z", "7zz", "7za"];
  const dirs = (process.env.PATH ?? "").split(delimiter).concat(process.env.ProgramFiles ? [join(process.env.ProgramFiles, "7-Zip")] : []);
  for (const dir of dirs) for (const name of names) if (dir && existsSync(join(dir, name))) return join(dir, name);
  throw new Error("hace falta 7-Zip (7z) para abrir el instalador de NSIS");
}

/** Abre el artefacto en `scratch` y devuelve la carpeta donde queda el `layout`, y cómo cerrarlo. */
function open(artifact, plan, scratch) {
  if (plan.platform === "linux") {
    run(artifact, ["--appimage-extract"], { cwd: scratch, stdio: ["ignore", "ignore", "inherit"] });
    return { base: scratch, close() {} };
  }
  if (plan.platform === "win32") {
    run(sevenZip(), ["x", "-y", `-o${scratch}`, artifact], { stdio: ["ignore", "ignore", "inherit"] });
    return { base: scratch, close() {} };
  }
  if (statSync(artifact).isDirectory()) return { base: artifact, close() {} };
  const mount = join(scratch, "dmg");
  run("hdiutil", ["attach", "-nobrowse", "-readonly", "-mountpoint", mount, artifact]);
  return { base: join(mount, "Danil.app"), close: () => spawnSync("hdiutil", ["detach", mount, "-force"]) };
}

export function verify(artifact) {
  const plan = artifactPlan(artifact);
  if (plan.platform === "darwin" && !process.env.APPLE_TEAM_ID) {
    throw new Error("APPLE_TEAM_ID hace falta: el árbol de macOS se verifica con su firma (work-tools-macos.py)");
  }
  const scratch = mkdtempSync(join(tmpdir(), "danil-release-verify-"));
  let opened;
  try {
    opened = open(artifact, plan, scratch);
    const resources = join(opened.base, plan.resources);
    const problems = checkManifests(resources, plan.targets);
    if (problems.length) throw new Error(problems.join("; "));
    const engines = plan.engines.map((engine) => join(opened.base, engine));
    const engineProblems = checkEngines(engines, acceptedEngines(plan, scratch));
    if (plan.platform === "darwin") engineProblems.push(...checkEngineIdentifiers(engines));
    if (engineProblems.length) throw new Error(engineProblems.join("; "));
    const companions = resolveCompanions(plan, opened.base, scratch);
    if (companions.length) {
      const companionProblems = checkCompanions(companions);
      if (plan.platform === "darwin") companionProblems.push(...checkCompanionIdentifiers(companions));
      if (companionProblems.length) throw new Error(companionProblems.join("; "));
    }
    const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
    run(python, [join(ROOT, "scripts/work-tools-release.py"), "verify", "--directory", resources]);
    const app = plan.platform === "darwin" ? ["--app", opened.base] : [];
    run(python, [join(ROOT, "scripts/work-tools-runtime-smoke.py"), "--engine", join(opened.base, plan.engine), "--resources", dirname(resources), "--browser", "--clone", ...app]);
    return { artifact, platform: plan.platform, targets: plan.targets };
  } finally {
    opened?.close();
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const artifact = process.argv[2];
  if (!artifact) {
    console.error("Uso: node scripts/desktop-release-verify.mjs <*_x64-setup.exe | *.AppImage | Danil.app | *.dmg>");
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(verify(resolve(artifact)), null, 2));
    console.log("Artefacto verificado: lleva las herramientas incluidas íntegras y el motor las usa.");
  } catch (error) {
    console.error(`desktop-release-verify: NO se publica. ${error.message}`);
    process.exit(1);
  }
}
