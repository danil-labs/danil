#!/usr/bin/env node
/**
 * Los nombres del motor empaquetado tienen un dueño: `ENGINE_NAMES` en
 * `src-tauri/src/extracted/engine.rs` (`danil-engine` y su alias `seldon-runtime`,
 * renombre del motor). Este guarda falla si `externalBin`,
 * las macros del instalador de Windows o las listas de los scripts pierden uno, y si
 * un sidecar ya puesto en `src-tauri/binaries/` no tiene los bytes del lock.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DESKTOP = fileURLToPath(new URL("../..", import.meta.url));
const read = (file) => readFileSync(join(DESKTOP, file), "utf8");
const violations = [];

const ENGINE_RS = "src-tauri/src/extracted/engine.rs";
const owner = /pub const ENGINE_NAMES: \[&str; \d+\] = \[([^\]]*)\];/.exec(read(ENGINE_RS));
const names = owner ? [...owner[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]) : [];
if (names.length < 2) violations.push(`${ENGINE_RS}  no declara ENGINE_NAMES con el motor y su alias`);

const same = (list) => list.length === names.length && list.every((name, i) => name === names[i]);

const externalBin = JSON.parse(read("src-tauri/tauri.conf.json")).bundle?.externalBin ?? [];
const bundled = externalBin.filter((entry) => names.some((name) => entry === `binaries/${name}`));
if (!same(bundled.map((entry) => entry.slice("binaries/".length)))) {
  violations.push(`src-tauri/tauri.conf.json  bundle.externalBin lleva ${JSON.stringify(externalBin)}; ENGINE_NAMES pide ${JSON.stringify(names.map((name) => `binaries/${name}`))}`);
}
for (const platform of ["linux", "windows", "macos"]) {
  const file = `src-tauri/tauri.${platform}.conf.json`;
  if (existsSync(join(DESKTOP, file)) && JSON.parse(read(file)).bundle?.externalBin) {
    violations.push(`${file}  redefine bundle.externalBin: el motor y su alias se declaran solo en tauri.conf.json`);
  }
}

const hooks = read("src-tauri/windows/hooks.nsh");
for (const macro of ["TERMINUS_KILL_ENGINE", "TERMINUS_SWEEP", "TERMINUS_SET_ASIDE"]) {
  const body = new RegExp(`!macro ${macro}\\b([\\s\\S]*?)!macroend`).exec(hooks)?.[1];
  if (!body) {
    violations.push(`src-tauri/windows/hooks.nsh  falta la macro ${macro}`);
    continue;
  }
  for (const name of names) {
    if (!body.includes(`${name}.exe`)) violations.push(`src-tauri/windows/hooks.nsh  ${macro} no nombra ${name}.exe`);
  }
}

const lists = {
  "scripts/engine.mjs": /const SIDECAR_NAMES = \[([^\]]*)\]/,
  "scripts/desktop-release-verify.mjs": /export const ENGINE_NAMES = \[([^\]]*)\]/,
};
for (const [file, pattern] of Object.entries(lists)) {
  const found = pattern.exec(read(file));
  const list = found ? [...found[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]) : [];
  if (!same(list)) violations.push(`${file}  lista ${JSON.stringify(list)}; ENGINE_NAMES es ${JSON.stringify(names)}`);
}

// Los sidecars los pone `engine.mjs sidecar`; si están, cada nombre lleva los bytes del lock.
const lock = JSON.parse(read("seldon-runtime.lock"));
const binaries = join(DESKTOP, "src-tauri/binaries");
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const placed = existsSync(binaries) ? readdirSync(binaries) : [];
const triples = new Set(
  placed.flatMap((file) => names.filter((name) => file.startsWith(`${name}-`)).map((name) => file.slice(name.length + 1).replace(/\.exe$/, ""))),
);
for (const triple of triples) {
  const files = names.map((name) => `${name}-${triple}${triple.includes("windows") ? ".exe" : ""}`);
  const missing = files.filter((file) => !placed.includes(file));
  if (missing.length) {
    violations.push(`src-tauri/binaries  falta ${missing.join(", ")}: corre node scripts/engine.mjs sidecar`);
    continue;
  }
  const hashes = files.map((file) => sha256(join(binaries, file)));
  if (new Set(hashes).size > 1) violations.push(`src-tauri/binaries  ${files.join(" y ")} no tienen los mismos bytes`);
  const pinned = lock.platforms?.[triple]?.sha256;
  if (pinned && hashes.some((hash) => hash !== pinned)) {
    violations.push(`src-tauri/binaries  ${triple} no tiene el SHA-256 de seldon-runtime.lock (${pinned}): corre node scripts/engine.mjs sidecar`);
  }
}

if (violations.length === 0) {
  console.log(`Motor ${names.join(" + alias ")}: externalBin, hooks.nsh, los scripts y los sidecars lo siguen.`);
  process.exit(0);
}
console.error("Los nombres del motor no coinciden con ENGINE_NAMES:\n");
for (const v of violations) console.error(`  ${v}`);
process.exit(1);
