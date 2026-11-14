#!/usr/bin/env node
/**
 * Fija en `seldon-runtime.lock` un release publicado del motor.
 *
 *   node scripts/engine-lock-set.mjs --release seldon-runtime-v0.3.1-<sha8> --commit <sha> \
 *     --platform x86_64-unknown-linux-gnu=<sha256> --platform x86_64-pc-windows-msvc=<sha256>
 *
 * Las URL salen del nombre del release, igual que las de los releases
 * anteriores. Una plataforma que no se pasa conserva su motor, y queda dicho
 * en su entrada con el `release` del que viene: una ventana con el lock nuevo
 * no descarga para esa plataforma un binario que nadie publicó. El contrato
 * RPC1 no cambia aquí: si el release habla otro, se adopta en un cambio
 * aparte con su guarda.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const LOCK = fileURLToPath(new URL("../seldon-runtime.lock", import.meta.url));
const BASE = "https://github.com/danil-labs/danil/releases/download";

function fail(message) {
  console.error(message);
  process.exit(1);
}

const args = process.argv.slice(2);
const options = { platforms: {} };
for (let i = 0; i < args.length; i += 2) {
  const [flag, value] = [args[i], args[i + 1]];
  if (value === undefined) fail(`Falta el valor de ${flag}.`);
  if (flag === "--release") options.release = value;
  else if (flag === "--commit") options.commit = value;
  else if (flag === "--engine-version") options.engineVersion = value;
  else if (flag === "--platform") {
    const [triple, sha256] = value.split("=");
    if (!triple || !/^[0-9a-f]{64}$/.test(sha256 ?? "")) fail(`--platform espera <triple>=<sha256>: ${value}`);
    options.platforms[triple] = sha256;
  } else fail(`Opción desconocida: ${flag}`);
}

const lock = JSON.parse(readFileSync(LOCK, "utf8"));
const version = options.engineVersion ?? lock.engine_version;
if (!/^[0-9a-f]{40}$/.test(options.commit ?? "")) fail("--commit espera el sha completo del motor.");
if (options.release !== `seldon-runtime-v${version}-${options.commit.slice(0, 8)}`) {
  fail(`--release debe ser seldon-runtime-v${version}-${options.commit.slice(0, 8)}.`);
}
const unknown = Object.keys(options.platforms).filter((triple) => !(triple in lock.platforms));
if (unknown.length) fail(`Plataformas que el lock no conoce: ${unknown.join(", ")}.`);
if (!Object.keys(options.platforms).length) fail("Pasa al menos una --platform publicada.");

const previous = lock.release;
const platforms = {};
for (const [triple, pin] of Object.entries(lock.platforms)) {
  const sha256 = options.platforms[triple];
  platforms[triple] = sha256
    ? { url: `${BASE}/${options.release}/seldon-runtime-${triple}${triple.includes("windows") ? ".exe" : ""}`, sha256 }
    : { release: pin.release ?? previous, ...pin };
}

const next = {
  ...lock,
  engine_version: version,
  commit: options.commit,
  release: options.release,
  manifest: `${BASE}/${options.release}/seldon-runtime.json`,
  terms: `${BASE}/${options.release}/TERMS.md`,
  platforms,
};
writeFileSync(LOCK, `${JSON.stringify(next, null, 2)}\n`);
console.log(`seldon-runtime.lock → ${options.release}; conservan su motor: ${
  Object.keys(platforms).filter((t) => !options.platforms[t]).join(", ") || "ninguna"
}.`);
