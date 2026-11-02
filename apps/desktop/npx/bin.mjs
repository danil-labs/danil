#!/usr/bin/env node
// npx @danil-labs/terminus — instala Danil (app de escritorio) con un
// comando. Canal para desarrolladores (que ya tienen Node), adicional al
// instalador que se descarga a mano.
//
// Flujo: detecta SO/arquitectura -> resuelve el asset en las releases PÚBLICAS
// de danil-labs/terminus vía latest.json -> descarga -> VERIFICA minisign (no
// opcional: descargamos y ejecutamos un binario nativo) -> instala. Si la
// verificación falla, borra la descarga y sale con error.
//
// Los mensajes salen en español o en inglés según el idioma del sistema
// (`lib/i18n.mjs`), con el inglés por defecto.
//
// Sin dependencias: fetch/crypto/child_process nativos de Node 18+.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

import { detectPlatform } from './lib/platform.mjs';
import { downloadToFile, fetchText } from './lib/download.mjs';
import { verifyFile } from './lib/minisign.mjs';
import { t } from './lib/i18n.mjs';

// Clave pública minisign de Danil. Idéntica a la embebida en la app
// (harness-app/terminus-app -> src-tauri/tauri.conf.json -> plugins.updater.pubkey).
// Es pública por diseño; sella que el instalador salió de Danil.
const PUBKEY_B64 =
  'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDM5ODEzRDE1M0QwQ0RFQjgKUldTNDNndzlGVDJCT1hPSnp4ZzBIbkowOW9kVGFYb0YyRkZKZjNTT2N3eERXOXhuRi9UblY5d3EK';

const LATEST_JSON_URL = 'https://github.com/danil-labs/terminus/releases/latest/download/latest.json';
const MANUAL_DOWNLOAD_URL = 'https://danil.ai/download/';
// Nombres con los que la 0.2.x se instaló, antes de llamarse Danil.
const LEGACY_MAC_BUNDLE = 'Terminus.app';
const LEGACY_APPIMAGE = 'Terminus.AppImage';

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const paint = (color, s) => (process.stdout.isTTY ? `${color}${s}${C.reset}` : s);
const log = (s = '') => console.log(s);
const err = (s = '') => console.error(s);

function parseArgs(argv) {
  const args = { dryRun: false, help: false };
  for (const a of argv) {
    if (a === '--dry-run' || a === '-n') args.dryRun = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function printHelp() {
  log(`${paint(C.bold, 'Danil')} — ${t('help', { manualUrl: MANUAL_DOWNLOAD_URL })}`);
}

async function sha256File(filePath) {
  const h = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(filePath), h);
  return h.digest('hex');
}

function runWindowsInstaller(exePath) {
  // NSIS en modo normal (interactivo). Se lanza desprendido para que este
  // proceso de npx pueda salir mientras el instalador sigue en pantalla.
  const child = spawn(exePath, [], { detached: true, stdio: 'ignore' });
  child.unref();
}

// Ejecuta un comando y lanza si sale con error, con su stderr en el mensaje.
function run(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${cmdArgs.join(' ')} → ${r.status}\n  ${(r.stderr || '').trim()}`);
  }
  return r;
}

// En macOS lo que publica la release NO es un instalador: es el `.app`
// comprimido —el mismo artefacto que la app usa para actualizarse sola—. No hay
// nada que ejecutar, así que instalar aquí es descomprimirlo y ponerlo en su
// sitio. Dejarlo como «ya lo descargué, ábrelo tú» sería devolverle a alguien un
// `.tar.gz` en una carpeta temporal, que no se abre haciendo doble clic y que se
// borra sola.
//
// **Y esta ruta se salta el diálogo de «desarrollador no verificado».** La
// cuarentena la pone quien descarga —el navegador—, no el archivo: bajado con
// `fetch` y descomprimido con `tar`, el `.app` nace sin ese atributo. El DMG de
// la página sí lo lleva. Es la ventaja real de este canal, no un atajo: la firma
// se comprobó arriba contra la misma llave que usa la app, y sin ella no se
// llega hasta aquí.
function installMacApp(tarPath, tmpDir) {
  const destinations = [
    '/Applications',
    path.join(os.homedir(), 'Applications'),
  ];

  log(`\n${paint(C.bold, t('installing'))}`);
  run('tar', ['-xzf', tarPath, '-C', tmpDir]);

  const bundle = fs
    .readdirSync(tmpDir)
    .find((n) => n.endsWith('.app'));
  if (!bundle) {
    err(paint(C.red, t('noAppInside')));
    err(paint(C.dim, t('contents', { list: fs.readdirSync(tmpDir).join(', ') })));
    process.exit(1);
  }
  const source = path.join(tmpDir, bundle);
  // Hasta la 0.2.x el bundle era Terminus.app. Si esa copia está, se reemplaza en
  // su sitio, igual que hace el updater: un Danil.app al lado serían dos apps con
  // los mismos datos, y el LaunchAgent y los lanzadores apuntan a la ruta vieja.
  const has = (name) => destinations.find((dir) => fs.existsSync(path.join(dir, name)));
  const installedName = has(LEGACY_MAC_BUNDLE) ? LEGACY_MAC_BUNDLE : bundle;
  // La copia que ya existe se reemplaza donde está, aunque sea ~/Applications:
  // probar /Applications primero dejaría otra al lado.
  const existing = has(installedName);
  if (existing) destinations.sort((a, b) => (b === existing) - (a === existing));
  // Con las dos copias se reemplaza la vieja y no se borra nada: se avisa.
  if (installedName !== bundle && has(bundle)) {
    err(paint(C.yellow, t('duplicateBundle', {
      kept: path.join(has(LEGACY_MAC_BUNDLE), LEGACY_MAC_BUNDLE),
      other: path.join(has(bundle), bundle),
    })));
  }

  // Copiar encima de una app abierta le cambia el binario por debajo y la mata
  // a mitad de lo que esté haciendo. Se mira por ruta y no por nombre: el
  // ejecutable de dentro no se llama como el bundle.
  for (const dir of destinations) {
    const destination = path.join(dir, installedName);
    if (!fs.existsSync(destination)) continue;
    const ps = spawnSync('ps', ['-Ao', 'comm='], { encoding: 'utf8' });
    if ((ps.stdout || '').split('\n').some((l) => l.startsWith(`${destination}/`))) {
      err(paint(C.yellow, t('appIsOpen', { bundle: installedName })));
      err(t('closeAndRetry'));
      process.exit(1);
    }
  }

  let placed = null;
  let lastFailure = null;
  for (const dir of destinations) {
    const destination = path.join(dir, installedName);
    try {
      fs.mkdirSync(dir, { recursive: true });
      // Reemplazo y no fusión: un `cp` encima deja los archivos de la versión
      // vieja que la nueva ya no trae, y un bundle mitad y mitad no arranca de
      // una forma que se pueda diagnosticar.
      fs.rmSync(destination, { recursive: true, force: true });
      run('ditto', [source, destination]);
      placed = destination;
      break;
    } catch (e) {
      // `/Applications` pide permiso en algunas máquinas. Se cae a la carpeta
      // del usuario en vez de pedir sudo: instalar una app no debería exigir
      // administrador, y pedirlo enseña a dárselo a cualquier cosa.
      lastFailure = e;
    }
  }

  if (!placed) {
    err(paint(C.red, t('installFailed', { reason: lastFailure?.message ?? '' })));
    process.exit(1);
  }

  log(paint(C.green, t('installedAt', { where: placed })));
  log(paint(C.dim, t('selfUpdates')));
  spawnSync('open', [placed]);
}

// En Linux lo que publica la release es un AppImage: un ejecutable portátil, el
// mismo formato que el updater de la app sabe aplicar. No hay nada que instalar
// —no registra la app ni pide administrador—, así que lo que se hace es dejarlo
// en un lugar estable y marcarlo ejecutable, igual que `prod:install` de la app.
// Dejarlo en la carpeta temporal, sin permiso de ejecución, sería devolverle a
// alguien un archivo que no abre y que se borra solo.
//
// Se copia a un nombre temporal al lado y se renombra: renombrar sobre un
// AppImage que está corriendo funciona, y un `cp` encima falla con «Text file
// busy». La app en marcha sigue con la versión vieja hasta que se reinicie.
function installLinuxAppImage(appImagePath) {
  const dir = path.join(os.homedir(), 'Applications');
  // Una copia de la 0.2.x se llama Terminus.AppImage: se reemplaza en su sitio.
  const legacy = path.join(dir, LEGACY_APPIMAGE);
  const destination = fs.existsSync(legacy) ? legacy : path.join(dir, 'Danil.AppImage');
  const staging = `${destination}.new`;

  log(`\n${paint(C.bold, t('installing'))}`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(appImagePath, staging);
    fs.chmodSync(staging, 0o755);
    fs.renameSync(staging, destination);
  } catch (e) {
    try { fs.rmSync(staging, { force: true }); } catch {}
    err(paint(C.red, t('installFailed', { reason: e.message })));
    process.exit(1);
  }

  log(paint(C.green, t('installedAt', { where: destination })));
  log(t('appImageOpenWith', { where: destination }));
  log(paint(C.dim, t('appImageNeedsFuse')));
  log(paint(C.dim, t('selfUpdates')));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();

  if (typeof fetch !== 'function') {
    err(paint(C.red, t('needNode')));
    process.exit(1);
  }

  log(paint(C.bold, 'Danil') + paint(C.dim, ` · ${t('title')}`));

  const plat = detectPlatform();
  log(`  ${t('system')}${plat.label}  ${paint(C.dim, `(${plat.platform}/${plat.arch})`)}`);

  // 1) Manifiesto de la release. Es la fuente de verdad de versión, URL del
  //    asset y firma — y es multiplataforma por diseño.
  let manifest;
  try {
    manifest = JSON.parse(await fetchText(LATEST_JSON_URL));
  } catch (e) {
    err(paint(C.red, t('manifestUnreadable', { reason: e.message })));
    process.exit(1);
  }

  const entry = plat.key ? manifest.platforms?.[plat.key] : null;
  if (!entry) {
    // No fingimos soporte que no existe.
    err(
      paint(C.yellow, t('noBuild', { label: plat.label })) +
        t('downloadByHand', { url: paint(C.cyan, MANUAL_DOWNLOAD_URL) })
    );
    process.exit(1);
  }

  const version = manifest.version || t('unknownVersion');
  const installerUrl = entry.url;
  const signatureB64 = entry.signature;
  log(`  ${t('version')}${version}`);

  if (!installerUrl || !signatureB64) {
    err(paint(C.red, t('manifestIncomplete')));
    process.exit(1);
  }
  const expectedFileName = path.basename(new URL(installerUrl).pathname);

  // 2) Descarga a temporal.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'danil-terminus-'));
  const installerPath = path.join(tmpDir, expectedFileName);
  const cleanup = () => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} };

  log(`\n${paint(C.bold, t('downloading'))} ${expectedFileName}`);
  try {
    await downloadToFile(installerUrl, installerPath);
  } catch (e) {
    cleanup();
    err(paint(C.red, t('downloadFailed', { reason: e.message })));
    process.exit(1);
  }

  // 3) VERIFICACIÓN DE INTEGRIDAD — obligatoria. Si falla, no se ejecuta nada.
  log(`\n${paint(C.bold, t('verifying'))} ${paint(C.dim, '(minisign · BLAKE2b-512 + Ed25519)')}`);
  try {
    const info = await verifyFile({
      filePath: installerPath,
      sigFileB64: signatureB64,
      publicKeyB64: PUBKEY_B64,
      expectedFileName,
    });
    const sha = await sha256File(installerPath);
    log(paint(C.green, t('signatureValid')) + paint(C.dim, ` (keyId ${info.keyId})`));
    log(paint(C.dim, `  sha256: ${sha}`));
  } catch (e) {
    cleanup();
    err(paint(C.red, t('verificationFailed', { reason: e.message })));
    err(paint(C.dim, t('downloadDeleted')));
    process.exit(1);
  }

  // 4) Instalar (o parar en dry-run).
  if (args.dryRun) {
    log(paint(C.yellow, t('dryRun')));
    log(paint(C.dim, t('dryRunKept', { file: installerPath })));
    return; // se deja el archivo para inspección manual en dry-run
  }

  if (plat.installerKind === 'windows-nsis') {
    log(`\n${paint(C.bold, t('runningInstaller'))}...`);
    runWindowsInstaller(installerPath);
    log(paint(C.green, t('installerLaunched')) + t('followSteps'));
    log(paint(C.dim, t('selfUpdates')));
  } else if (plat.installerKind === 'macos') {
    installMacApp(installerPath, tmpDir);
  } else if (plat.installerKind === 'linux-appimage') {
    installLinuxAppImage(installerPath);
    cleanup();
  }
}

main().catch((e) => {
  err(paint(C.red, t('unexpected', { detail: e?.stack || e })));
  process.exit(1);
});
