#!/usr/bin/env node
// Dueño único de las plataformas de escritorio y sus manifiestos de
// actualización (`latest-darwin.json`, `latest-windows.json`, `latest-linux.json`).
//
// Lo consumen `.github/workflows/publish.yml`, `.github/workflows/promote-update.yml`
// y las publicaciones manuales (`terminus-workspace/docs/release/desktop-manual.md`).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { verifyFile } from '../npx/lib/minisign.mjs';

export const POINTER_RELEASE_TAG = 'updater-stable';
export const UPDATER_ENDPOINT =
  `https://github.com/danil-labs/danil/releases/download/${POINTER_RELEASE_TAG}/latest-{{target}}.json`;
export const PLATFORM_ORDER = ['windows', 'macos', 'linux'];

export const PLATFORMS = {
  windows: {
    name: 'windows',
    runner: 'windows-latest',
    target: 'windows',
    manifestFile: 'latest-windows.json',
    updaterKey: 'windows-x86_64',
    updaterAsset: (v) => `Danil_${v}_x64-setup.exe`,
    stableFiles: ['Danil-Windows-Setup.exe', 'Terminus-Windows-Setup.exe'],
  },
  macos: {
    name: 'macos',
    runner: 'macos-latest',
    target: 'darwin',
    manifestFile: 'latest-darwin.json',
    updaterKey: 'darwin-aarch64',
    updaterAsset: () => 'Danil.app.tar.gz',
    stableFiles: ['Danil-macOS.dmg', 'Terminus-macOS.dmg'],
  },
  linux: {
    name: 'linux',
    runner: 'ubuntu-22.04',
    target: 'linux',
    manifestFile: 'latest-linux.json',
    updaterKey: 'linux-x86_64',
    updaterAsset: (v) => `Danil_${v}_amd64.AppImage`,
    stableFiles: ['Danil-Linux-x86_64.AppImage', 'Terminus-Linux-x86_64.AppImage'],
  },
};

export function parsePlatforms(input) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new Error('Especifica al menos una plataforma (macos, windows, linux o all).');
  if (raw.toLowerCase() === 'all') return [...PLATFORM_ORDER];
  const requested = new Set();
  for (const part of raw.split(',')) {
    const name = part.trim().toLowerCase();
    if (!name) continue;
    if (name === 'all') return [...PLATFORM_ORDER];
    if (!Object.hasOwn(PLATFORMS, name)) {
      throw new Error(`Plataforma desconocida «${part.trim()}». Valores válidos: ${PLATFORM_ORDER.join(', ')}, all.`);
    }
    requested.add(name);
  }
  if (requested.size === 0) {
    throw new Error('Especifica al menos una plataforma (macos, windows, linux o all).');
  }
  return PLATFORM_ORDER.filter((name) => requested.has(name));
}

export function buildMatrix(platformsInput) {
  return parsePlatforms(platformsInput).map((name) => ({
    so: PLATFORMS[name].runner,
    name,
  }));
}

export function expectedStableFiles(platformsInput) {
  return parsePlatforms(platformsInput).flatMap((name) => PLATFORMS[name].stableFiles);
}

export function parseMinisignSignedFilename(sigFileB64) {
  const text = Buffer.from(sigFileB64.trim(), 'base64').toString('utf8');
  const match = text.match(/file:([^\s]+)/);
  return match ? match[1] : null;
}

export function verifySignatureFilenames(assetsDir) {
  const sigs = readdirSync(assetsDir).filter((name) => name.endsWith('.sig')).sort();
  if (sigs.length === 0) {
    throw new Error(`No hay archivos .sig en ${assetsDir}.`);
  }
  for (const sig of sigs) {
    const expected = sig.slice(0, -'.sig'.length);
    const signedName = parseMinisignSignedFilename(readFileSync(join(assetsDir, sig), 'utf8'));
    if (signedName !== expected) {
      throw new Error(
        `${expected} lleva una firma que dice «${signedName ?? '(vacío)'}». Renombrar un artefacto firmado rompe la comprobación de nombre.`,
      );
    }
  }
  return sigs.map((s) => s.slice(0, -'.sig'.length));
}

function normalizeNotes(notesEs, notesEn) {
  const es = String(notesEs ?? '');
  const en = String(notesEn ?? '');
  return {
    notes: en !== '' ? en : es,
    notes_by_locale: { es, en },
  };
}

export function buildPlatformManifest({ platform, version, repo, signature, notesEs, notesEn, pubDate }) {
  const spec = PLATFORMS[platform];
  if (!spec) throw new Error(`Plataforma desconocida: ${platform}`);
  if (!version) throw new Error('Falta version para armar el manifiesto.');
  if (!repo) throw new Error('Falta repo (owner/name) para armar el manifiesto.');
  const sig = String(signature ?? '').trim();
  if (!sig) throw new Error(`Falta la firma minisign para ${platform}.`);
  const asset = spec.updaterAsset(version);
  const url = `https://github.com/${repo}/releases/download/v${version}/${asset}`;
  return {
    version,
    ...normalizeNotes(notesEs, notesEn),
    pub_date: pubDate ?? new Date().toISOString(),
    platforms: {
      [spec.updaterKey]: { signature: sig, url },
    },
  };
}

export function buildCombinedManifest({ version, repo, signaturesByPlatform, notesEs, notesEn, pubDate }) {
  const platforms = {};
  for (const name of PLATFORM_ORDER) {
    const sig = String(signaturesByPlatform?.[name] ?? '').trim();
    if (!sig) throw new Error(`Falta firma para ${name} al armar latest.json combinado.`);
    const spec = PLATFORMS[name];
    platforms[spec.updaterKey] = {
      signature: sig,
      url: `https://github.com/${repo}/releases/download/v${version}/${spec.updaterAsset(version)}`,
    };
  }
  return {
    version,
    ...normalizeNotes(notesEs, notesEn),
    pub_date: pubDate ?? new Date().toISOString(),
    platforms,
  };
}

export function buildManifestsForDir({
  assetsDir,
  platforms: platformsInput,
  version,
  repo,
  notesEs,
  notesEn,
  pubDate = new Date().toISOString(),
}) {
  const selected = parsePlatforms(platformsInput);
  verifySignatureFilenames(assetsDir);

  const signaturesByPlatform = {};
  const written = [];
  for (const name of selected) {
    const spec = PLATFORMS[name];
    const asset = spec.updaterAsset(version);
    const assetPath = join(assetsDir, asset);
    const sigPath = `${assetPath}.sig`;
    if (!existsSync(assetPath)) throw new Error(`Falta el artefacto ${asset} en ${assetsDir}.`);
    if (!existsSync(sigPath)) throw new Error(`Falta la firma ${asset}.sig en ${assetsDir}.`);
    const signature = readFileSync(sigPath, 'utf8').trim();
    signaturesByPlatform[name] = signature;
    const manifest = buildPlatformManifest({
      platform: name,
      version,
      repo,
      signature,
      notesEs,
      notesEn,
      pubDate,
    });
    writeFileSync(join(assetsDir, spec.manifestFile), `${JSON.stringify(manifest, null, 2)}\n`);
    written.push(spec.manifestFile);
  }

  // Solo se escribe el `latest.json` combinado cuando las tres plataformas
  // están presentes: una corrida parcial nunca emite un `latest.json` a medias.
  if (selected.length === PLATFORM_ORDER.length) {
    const combined = buildCombinedManifest({
      version,
      repo,
      signaturesByPlatform,
      notesEs,
      notesEn,
      pubDate,
    });
    writeFileSync(join(assetsDir, 'latest.json'), `${JSON.stringify(combined, null, 2)}\n`);
    written.push('latest.json');
  }

  return written;
}

export async function verifyManifest({ manifest, platform, version, repo, publicKeyB64, assetPath }) {
  const spec = PLATFORMS[platform];
  if (!spec) throw new Error(`Plataforma desconocida: ${platform}`);
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('El manifiesto no es un objeto JSON válido.');
  }
  if (manifest.version !== version) {
    throw new Error(`La versión del manifiesto es «${manifest.version}», esperada «${version}».`);
  }
  if (!manifest.notes_by_locale || typeof manifest.notes_by_locale.es !== 'string' || typeof manifest.notes_by_locale.en !== 'string') {
    throw new Error('El manifiesto no incluye notes_by_locale.{es,en}.');
  }
  const keys = Object.keys(manifest.platforms ?? {});
  if (keys.length !== 1 || keys[0] !== spec.updaterKey) {
    throw new Error(`El manifiesto de ${platform} debe declarar únicamente «${spec.updaterKey}» (encontrado: ${keys.join(', ') || 'ninguno'}).`);
  }
  const entry = manifest.platforms[spec.updaterKey];
  const expectedAsset = spec.updaterAsset(version);
  const expectedUrl = `https://github.com/${repo}/releases/download/v${version}/${expectedAsset}`;
  if (entry.url !== expectedUrl) {
    throw new Error(`URL inesperada para ${platform}: «${entry.url}» (esperada: «${expectedUrl}»).`);
  }
  if (!entry.signature || !String(entry.signature).trim()) {
    throw new Error(`Firma vacía para ${platform}.`);
  }
  const signedName = parseMinisignSignedFilename(entry.signature);
  if (signedName !== expectedAsset) {
    throw new Error(`La firma en el manifiesto corresponde a «${signedName ?? '(vacío)'}», no a «${expectedAsset}».`);
  }
  if (publicKeyB64 && assetPath) {
    await verifyFile({
      filePath: assetPath,
      sigFileB64: entry.signature,
      publicKeyB64,
      expectedFileName: basename(assetPath),
    });
  }
  return { platform, manifestFile: spec.manifestFile, updaterKey: spec.updaterKey, asset: expectedAsset, url: expectedUrl };
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Argumento inesperado: ${arg}`);
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Falta valor para --${key}`);
    }
    flags[key] = value;
    i += 1;
  }
  return flags;
}

async function runCli(argv) {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  switch (command) {
    case 'matrix':
      console.log(JSON.stringify(buildMatrix(flags.platforms ?? 'all')));
      return;
    case 'platforms':
      console.log(parsePlatforms(flags.platforms ?? 'all').join(','));
      return;
    case 'manifest-files':
      for (const name of parsePlatforms(flags.platforms ?? 'all')) {
        console.log(PLATFORMS[name].manifestFile);
      }
      return;
    case 'stable-files':
      for (const file of expectedStableFiles(flags.platforms ?? 'all')) {
        console.log(file);
      }
      return;
    case 'updater-asset': {
      const [name] = parsePlatforms(flags.platform);
      if (!flags.version) throw new Error('Falta --version');
      console.log(PLATFORMS[name].updaterAsset(flags.version));
      return;
    }
    case 'build': {
      const notesEs = flags['notes-es-file']
        ? readFileSync(flags['notes-es-file'], 'utf8')
        : (process.env.NOTE_ES ?? '');
      const notesEn = flags['notes-en-file']
        ? readFileSync(flags['notes-en-file'], 'utf8')
        : (process.env.NOTE_EN ?? '');
      const written = buildManifestsForDir({
        assetsDir: flags['assets-dir'],
        platforms: flags.platforms ?? 'all',
        version: flags.version,
        repo: flags.repo,
        notesEs,
        notesEn,
        pubDate: flags['pub-date'] ?? new Date().toISOString(),
      });
      for (const file of written) console.log(file);
      return;
    }
    case 'verify': {
      const manifest = JSON.parse(readFileSync(flags.manifest, 'utf8'));
      const info = await verifyManifest({
        manifest,
        platform: flags.platform,
        version: flags.version,
        repo: flags.repo,
        publicKeyB64: flags.pubkey,
        assetPath: flags.asset,
      });
      console.log(`OK ${info.platform} (${info.manifestFile}) -> ${info.asset}`);
      return;
    }
    default:
      throw new Error(
        `Subcomando desconocido «${command ?? ''}». Usa: matrix | platforms | manifest-files | stable-files | updater-asset | build | verify.`,
      );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}
