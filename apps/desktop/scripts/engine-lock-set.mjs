#!/usr/bin/env node
/**
 * Fija en `seldon-runtime.lock` un release publicado del motor y sus binarios hermanos opcionales (`cli`, `kn`).
 *
 *   node scripts/engine-lock-set.mjs --release seldon-runtime-v0.3.1-<sha8> --commit <sha> \
 *     --platform x86_64-unknown-linux-gnu=<sha256> [--cli x86_64-unknown-linux-gnu=<sha256>] [--kn x86_64-unknown-linux-gnu=<sha256>]
 *   node scripts/engine-lock-set.mjs --manifest path/to/seldon-runtime.json --release <tag> --commit <sha>
 *
 * Una plataforma no actualizada conserva su motor (y `cli`/`kn` previos) con el `release` de origen.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_LOCK = fileURLToPath(new URL("../seldon-runtime.lock", import.meta.url));
const BASE = "https://github.com/danil-labs/danil/releases/download";
const SHA256_RE = /^[0-9a-f]{64}$/;
const URL_RE = /^https?:\/\/\S+$/;
const COMPANIONS = [
  { key: "cli", name: "danil" },
  { key: "kn", name: "kn" },
];

function fail(message) {
  throw new Error(message);
}

function parsePair(flag, value, validator, hint) {
  const eq = value.indexOf("=");
  const triple = eq > 0 ? value.slice(0, eq) : "";
  const raw = eq > 0 ? value.slice(eq + 1) : "";
  if (!triple || !validator(raw)) fail(`${flag} espera <triple>=<${hint}>: ${value}`);
  return [triple, raw];
}

function parsePositiveInt(raw) {
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function validateUrl(url, label) {
  if (typeof url !== "string" || !URL_RE.test(url)) fail(`${label} debe ser una URL http(s): ${url}`);
  return url;
}

function validateSha256(sha, label) {
  if (typeof sha !== "string" || !SHA256_RE.test(sha)) fail(`${label} espera sha256 hex de 64 caracteres: ${sha}`);
  return sha;
}

function validateSize(size, label) {
  if (size === undefined) return undefined;
  if (!Number.isInteger(size) || size <= 0) fail(`${label} espera un tamaño entero positivo: ${size}`);
  return size;
}

export function parseLockSetArgs(args) {
  const options = {
    platforms: {},
    platformSizes: {},
    companions: { cli: {}, kn: {} },
    companionUrls: { cli: {}, kn: {} },
    companionSizes: { cli: {}, kn: {} },
  };
  for (let i = 0; i < args.length; i += 2) {
    const [flag, value] = [args[i], args[i + 1]];
    if (value === undefined) fail(`Falta el valor de ${flag}.`);
    if (flag === "--release") options.release = value;
    else if (flag === "--commit") options.commit = value;
    else if (flag === "--engine-version") options.engineVersion = value;
    else if (flag === "--manifest") options.manifest = value;
    else if (flag === "--lock") options.lockPath = value;
    else if (flag === "--platform") {
      const [triple, sha256] = parsePair(flag, value, (v) => SHA256_RE.test(v), "sha256");
      options.platforms[triple] = sha256;
    } else if (flag === "--platform-size") {
      const [triple, raw] = parsePair(flag, value, (v) => parsePositiveInt(v) !== null, "bytes");
      options.platformSizes[triple] = parsePositiveInt(raw);
    } else if (flag === "--cli" || flag === "--kn") {
      const key = flag.slice(2);
      const [triple, sha256] = parsePair(flag, value, (v) => SHA256_RE.test(v), "sha256");
      options.companions[key][triple] = sha256;
    } else if (flag === "--cli-url" || flag === "--kn-url") {
      const key = flag.slice(2, -4);
      const [triple, url] = parsePair(flag, value, (v) => URL_RE.test(v), "url");
      options.companionUrls[key][triple] = url;
    } else if (flag === "--cli-size" || flag === "--kn-size") {
      const key = flag.slice(2, -5);
      const [triple, raw] = parsePair(flag, value, (v) => parsePositiveInt(v) !== null, "bytes");
      options.companionSizes[key][triple] = parsePositiveInt(raw);
    } else fail(`Opción desconocida: ${flag}`);
  }
  return options;
}

function companionFromManifest(triple, key, spec) {
  if (spec === undefined || spec === null) return undefined;
  if (typeof spec !== "object" || Array.isArray(spec)) fail(`manifest.platforms[${triple}].${key} debe ser un objeto.`);
  const entry = {
    url: validateUrl(spec.url, `manifest.platforms[${triple}].${key}.url`),
    sha256: validateSha256(spec.sha256, `manifest.platforms[${triple}].${key}.sha256`),
  };
  const size = validateSize(spec.size, `manifest.platforms[${triple}].${key}.size`);
  if (size !== undefined) entry.size = size;
  return entry;
}

export function updateLock(lock, options, manifest = null) {
  const version = options.engineVersion ?? manifest?.engine_version ?? manifest?.version ?? lock.engine_version;
  const commit = options.commit ?? manifest?.commit;
  const release = options.release ?? manifest?.release;
  if (!/^[0-9a-f]{40}$/.test(commit ?? "")) fail("--commit espera el sha completo del motor.");
  if (release !== `seldon-runtime-v${version}-${commit.slice(0, 8)}`) {
    fail(`--release debe ser seldon-runtime-v${version}-${commit.slice(0, 8)}.`);
  }

  const manifestPlatforms = manifest?.platforms && typeof manifest.platforms === "object" ? manifest.platforms : null;
  if (manifest && !manifestPlatforms) fail("El manifiesto no contiene un objeto platforms.");

  const known = new Set(Object.keys(lock.platforms));
  const checkKnown = (map, label) => {
    const unknown = Object.keys(map ?? {}).filter((triple) => !known.has(triple));
    if (unknown.length) fail(`Plataformas que el lock no conoce (${label}): ${unknown.join(", ")}.`);
  };
  checkKnown(options.platforms, "--platform");
  checkKnown(options.platformSizes, "--platform-size");
  for (const { key } of COMPANIONS) {
    checkKnown(options.companions?.[key], `--${key}`);
    checkKnown(options.companionUrls?.[key], `--${key}-url`);
    checkKnown(options.companionSizes?.[key], `--${key}-size`);
  }

  const updatedTriples = new Set(Object.keys(options.platforms ?? {}));
  if (manifestPlatforms && updatedTriples.size === 0) {
    for (const [triple, entry] of Object.entries(manifestPlatforms)) {
      if (known.has(triple) && entry?.url && entry?.sha256) updatedTriples.add(triple);
    }
  }
  if (!updatedTriples.size) fail("Pasa al menos una --platform publicada o un --manifest con plataformas.");

  for (const triple of Object.keys(options.platformSizes ?? {})) {
    if (!updatedTriples.has(triple)) fail(`--platform-size requiere actualizar ${triple} en la misma corrida.`);
  }
  for (const { key } of COMPANIONS) {
    for (const [map, label] of [
      [options.companions?.[key], `--${key}`],
      [options.companionUrls?.[key], `--${key}-url`],
      [options.companionSizes?.[key], `--${key}-size`],
    ]) {
      for (const triple of Object.keys(map ?? {})) {
        if (!updatedTriples.has(triple)) fail(`${label} requiere actualizar ${triple} con --platform o --manifest.`);
      }
    }
  }

  const previous = lock.release;
  const platforms = {};
  for (const [triple, pin] of Object.entries(lock.platforms)) {
    if (!updatedTriples.has(triple)) {
      platforms[triple] = { release: pin.release ?? previous, ...pin };
      continue;
    }
    const ext = triple.includes("windows") ? ".exe" : "";
    const fromManifest = manifestPlatforms?.[triple];
    const sha256 = options.platforms?.[triple] ?? validateSha256(fromManifest?.sha256, `manifest.platforms[${triple}].sha256`);
    const url = fromManifest?.url
      ? validateUrl(fromManifest.url, `manifest.platforms[${triple}].url`)
      : `${BASE}/${release}/seldon-runtime-${triple}${ext}`;
    const size = options.platformSizes?.[triple] ?? validateSize(fromManifest?.size, `manifest.platforms[${triple}].size`);
    const nextPin = { url, sha256 };
    if (size !== undefined) nextPin.size = size;

    for (const { key, name } of COMPANIONS) {
      const cliSha = options.companions?.[key]?.[triple];
      const cliUrl = options.companionUrls?.[key]?.[triple];
      const cliSize = options.companionSizes?.[key]?.[triple];
      const baseCompanion = companionFromManifest(triple, key, fromManifest?.[key]);
      if (!cliSha && !baseCompanion) {
        if (cliUrl || cliSize !== undefined) fail(`--${key}-url y --${key}-size requieren --${key} para ${triple}.`);
        continue;
      }
      const companion = {
        url: cliUrl ?? baseCompanion?.url ?? `${BASE}/${release}/${name}-${triple}${ext}`,
        sha256: cliSha ?? baseCompanion.sha256,
      };
      const resolvedSize = cliSize ?? baseCompanion?.size;
      if (resolvedSize !== undefined) companion.size = resolvedSize;
      nextPin[key] = companion;
    }
    platforms[triple] = nextPin;
  }

  return {
    next: {
      ...lock,
      engine_version: version,
      commit,
      release,
      manifest: `${BASE}/${release}/seldon-runtime.json`,
      terms: `${BASE}/${release}/TERMS.md`,
      platforms,
    },
    updated: [...updatedTriples],
    preserved: Object.keys(platforms).filter((triple) => !updatedTriples.has(triple)),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseLockSetArgs(process.argv.slice(2));
    const lockPath = options.lockPath ? resolve(options.lockPath) : DEFAULT_LOCK;
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    const manifest = options.manifest ? JSON.parse(readFileSync(resolve(options.manifest), "utf8")) : null;
    const { next, preserved } = updateLock(lock, options, manifest);
    writeFileSync(lockPath, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`seldon-runtime.lock → ${next.release}; conservan su motor: ${preserved.join(", ") || "ninguna"}.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
