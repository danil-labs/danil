#!/usr/bin/env node
/**
 * El `productName` de `tauri.conf.json` y lo que depende de él dicen lo mismo.
 *
 * En el AppImage el bundle pone los recursos en `usr/lib/<productName>` y arma
 * `<productName>.AppDir`; las herramientas de trabajo van en
 * `usr/share/<productName>`. Si una ruta escrita a mano se queda con el nombre
 * viejo, el AppImage arranca sin herramientas de trabajo y nada falla al
 * construir. En Windows el nombre es la clave de desinstalación y la carpeta:
 * mientras no sea «Terminus», `windows/hooks.nsh` debe adoptar la copia 0.2.x
 * instalada con ese nombre (`latest.json` lleva una 0.2.x directo a la última),
 * y `publish.yml` debe repetir el nombre en `PRODUCT_NAME`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DESKTOP = fileURLToPath(new URL("../..", import.meta.url));
const MONOREPO = join(DESKTOP, "..", "..");
const LEGACY = "Terminus";
const name = JSON.parse(readFileSync(join(DESKTOP, "src-tauri/tauri.conf.json"), "utf8")).productName;

const files = [
  "src-tauri/src/extracted/engine.rs",
  "scripts/work-tools.py",
  "scripts/work-tools-patchelf.py",
  "scripts/work-tools-candidate.mjs",
  "scripts/work-tools-candidate-verify.py",
  "scripts/work-tools-release.py",
  "tests/release/work-tools.test.py",
].map((f) => join(DESKTOP, f));
const workflow = join(MONOREPO, ".github/workflows/publish.yml");

const violations = [];
for (const file of [...files, workflow]) {
  const text = readFileSync(file, "utf8");
  const rel = file.slice(MONOREPO.length + 1);
  const patterns = [
    /usr\/(?:lib|share)\/([A-Za-z]+)/g,
    /'usr', 'share', '([A-Za-z]+)'/g,
    /([A-Za-z]+)\.AppDir/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      // `usr/lib/x86_64-linux-gnu` y similares no son del bundle.
      if (match[1] === "x" || /^(bin|local)$/.test(match[1])) continue;
      if (match[1] !== name) {
        const line = text.slice(0, match.index).split("\n").length;
        violations.push(`${rel}:${line}  «${match[0]}» no sigue a productName «${name}»`);
      }
    }
  }
}

const product = readFileSync(workflow, "utf8").match(/^\s*PRODUCT_NAME:\s*(\S+)\s*$/m)?.[1];
if (product !== name) violations.push(`.github/workflows/publish.yml  PRODUCT_NAME es «${product}», productName es «${name}»`);

if (name !== LEGACY) {
  const hooks = readFileSync(join(DESKTOP, "src-tauri/windows/hooks.nsh"), "utf8");
  const required = [
    `!define TERMINUS_LEGACY_PRODUCTNAME "${LEGACY}"`,
    "!macroundef SetContext",
    "!insertmacro TERMINUS_ADOPT_LEGACY",
    "!insertmacro TERMINUS_RETIRE_LEGACY",
  ];
  for (const needle of required) {
    if (!hooks.includes(needle)) violations.push(`src-tauri/windows/hooks.nsh  falta «${needle}»: la copia «${LEGACY}» quedaría instalada al lado`);
  }
}

if (violations.length === 0) {
  console.log(`productName «${name}»: las rutas del AppImage, PRODUCT_NAME y la migración de Windows lo siguen.`);
  process.exit(0);
}
console.error("Lo que depende de productName dice otro nombre:\n");
for (const v of violations) console.error(`  ${v}`);
process.exit(1);
