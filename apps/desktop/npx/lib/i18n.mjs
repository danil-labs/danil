// Idioma de los mensajes que ve quien ejecuta `npx`: español si el sistema
// está en español, inglés en cualquier otro caso (y si no se puede saber).
//
// Se decide por el entorno, en este orden: `LC_ALL`, `LC_MESSAGES`, `LANG` (el
// primero que traiga algo distinto de `C`/`POSIX`) y, si ninguno lo dice —lo
// normal en Windows—, el idioma que reporta `Intl`. Se lee en cada llamada y no
// al cargar el módulo, para que una prueba pueda cambiarlo con `process.env`.
//
// Sin dependencias. Cada mensaje vive en los dos idiomas, uno junto al otro, y
// así no se puede agregar uno sin el otro sin que se note.

function fromEnv(env) {
  for (const name of ['LC_ALL', 'LC_MESSAGES', 'LANG']) {
    const value = (env[name] || '').trim();
    if (value && value !== 'C' && value !== 'POSIX') return value;
  }
  return null;
}

function fromIntl() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return null;
  }
}

export function detectLocale(env = process.env) {
  const raw = fromEnv(env) || fromIntl() || '';
  return /^es([_\-.@]|$)/i.test(raw) ? 'es' : 'en';
}

const MESSAGES = {
  // ── bin.mjs ────────────────────────────────────────────────────────────────
  'help': {
    es: ({ manualUrl }) => `Instalador vía npx

  Uso:
    npx @danil-labs/terminus [opciones]

  Opciones:
    -n, --dry-run   Descarga y verifica, pero NO instala ni ejecuta nada.
    -h, --help      Muestra esta ayuda.

  Qué hace:
    1. Detecta tu sistema operativo y arquitectura.
    2. Resuelve el artefacto correcto de las releases públicas de Danil.
    3. Lo descarga a una carpeta temporal.
    4. Verifica su firma minisign antes de ejecutar ni copiar nada.
    5. Windows: lanza el instalador. macOS: descomprime la app y la deja en
       /Applications. Linux: deja el AppImage en ~/Applications/Danil.AppImage
       (o reemplaza ~/Applications/Terminus.AppImage si ya estaba).
       A partir de ahí, se actualiza sola.

  Descarga manual: ${manualUrl}`,
    en: ({ manualUrl }) => `Installer via npx

  Usage:
    npx @danil-labs/terminus [options]

  Options:
    -n, --dry-run   Download and verify, but do NOT install or run anything.
    -h, --help      Show this help.

  What it does:
    1. Detects your operating system and architecture.
    2. Resolves the right artifact from Danil's public releases.
    3. Downloads it to a temporary folder.
    4. Verifies its minisign signature before running or copying anything.
    5. Windows: launches the installer. macOS: unpacks the app and puts it in
       /Applications. Linux: puts the AppImage at ~/Applications/Danil.AppImage
       (or replaces ~/Applications/Terminus.AppImage if it is there).
       From then on, it updates itself.

  Manual download: ${manualUrl}`,
  },
  'title': { es: 'instalador', en: 'installer' },
  'needNode': {
    es: 'Necesitas Node 18 o superior (falta fetch nativo).',
    en: 'You need Node 18 or newer (native fetch is missing).',
  },
  'system': { es: 'Sistema:  ', en: 'System:   ' },
  'version': { es: 'Versión:  ', en: 'Version:  ' },
  'unknownVersion': { es: '(desconocida)', en: '(unknown)' },
  'manifestUnreadable': {
    es: ({ reason }) => `\nNo se pudo leer la información de la última versión.\n  ${reason}`,
    en: ({ reason }) => `\nCould not read the latest version's information.\n  ${reason}`,
  },
  'noBuild': {
    es: ({ label }) => `\nTodavía no hay build para ${label}.`,
    en: ({ label }) => `\nThere is no build for ${label} yet.`,
  },
  'downloadByHand': {
    es: ({ url }) => `\nDescárgalo a mano en ${url} cuando esté disponible.`,
    en: ({ url }) => `\nDownload it by hand at ${url} once it is available.`,
  },
  'manifestIncomplete': {
    es: '\nEl manifiesto de la release está incompleto (falta url o firma).',
    en: '\nThe release manifest is incomplete (url or signature is missing).',
  },
  'downloading': { es: 'Descargando', en: 'Downloading' },
  'downloadFailed': {
    es: ({ reason }) => `\nLa descarga falló.\n  ${reason}`,
    en: ({ reason }) => `\nThe download failed.\n  ${reason}`,
  },
  'verifying': { es: 'Verificando firma', en: 'Verifying signature' },
  'signatureValid': { es: '  ✓ Firma válida', en: '  ✓ Valid signature' },
  'verificationFailed': {
    es: ({ reason }) => `\n  ✗ VERIFICACIÓN FALLIDA — no se ejecuta el instalador.\n  ${reason}`,
    en: ({ reason }) => `\n  ✗ VERIFICATION FAILED — the installer is not run.\n  ${reason}`,
  },
  'downloadDeleted': { es: '  La descarga fue borrada.', en: '  The download was deleted.' },
  'dryRun': {
    es: '\n--dry-run: descarga verificada, no se instala nada.',
    en: '\n--dry-run: download verified, nothing is installed.',
  },
  'dryRunKept': {
    es: ({ file }) => `  Archivo en: ${file}`,
    en: ({ file }) => `  File at: ${file}`,
  },
  'runningInstaller': { es: 'Ejecutando el instalador', en: 'Running the installer' },
  'installerLaunched': { es: '\n✓ Instalador lanzado.', en: '\n✓ Installer launched.' },
  'followSteps': { es: ' Sigue los pasos en pantalla.', en: ' Follow the steps on screen.' },
  'selfUpdates': {
    es: '  A partir de ahora, Danil se actualiza sola desde dentro de la app.',
    en: '  From now on, Danil updates itself from inside the app.',
  },
  'unexpected': {
    es: ({ detail }) => `\nError inesperado: ${detail}`,
    en: ({ detail }) => `\nUnexpected error: ${detail}`,
  },

  // ── instalación en macOS ───────────────────────────────────────────────────
  'installing': { es: 'Instalando', en: 'Installing' },
  'noAppInside': {
    es: '\n  El archivo no traía ninguna app dentro.',
    en: '\n  The archive had no app inside.',
  },
  'contents': {
    es: ({ list }) => `  Contenido: ${list}`,
    en: ({ list }) => `  Contents: ${list}`,
  },
  'duplicateBundle': {
    es: ({ kept, other }) => `\n  Se actualiza ${kept}. También está ${other}, con los mismos datos: ciérrala y bórrala a mano si no la usas.`,
    en: ({ kept, other }) => `\n  Updating ${kept}. ${other} is also there and shares the same data: close it and delete it by hand if you do not use it.`,
  },
  'appIsOpen': {
    es: ({ bundle }) => `\n  ${bundle} está abierta.`,
    en: ({ bundle }) => `\n  ${bundle} is open.`,
  },
  'closeAndRetry': {
    es: '  Ciérrala y repite — instalar encima la mataría a mitad de lo que esté haciendo.',
    en: '  Close it and try again — installing over it would kill it mid-task.',
  },
  'installFailed': {
    es: ({ reason }) => `\n  No se pudo instalar.\n  ${reason}`,
    en: ({ reason }) => `\n  Could not install.\n  ${reason}`,
  },
  'installedAt': {
    es: ({ where }) => `\n✓ Instalada en ${where}`,
    en: ({ where }) => `\n✓ Installed at ${where}`,
  },

  // ── instalación en Linux ───────────────────────────────────────────────────
  'appImageOpenWith': {
    es: ({ where }) => `  Ábrela con:  ${where}\n  (o desde el explorador de archivos, con doble clic).`,
    en: ({ where }) => `  Open it with:  ${where}\n  (or double-click it in your file manager).`,
  },
  'appImageNeedsFuse': {
    es: '  Si no arranca y menciona FUSE, instala `libfuse2` (en Ubuntu: sudo apt install libfuse2)\n  o ejecútala con --appimage-extract-and-run.',
    en: '  If it does not start and mentions FUSE, install `libfuse2` (on Ubuntu: sudo apt install libfuse2)\n  or run it with --appimage-extract-and-run.',
  },

  // ── download.mjs ───────────────────────────────────────────────────────────
  'downloadingProgress': {
    es: ({ mb }) => `\r  descargando... ${mb} MB`,
    en: ({ mb }) => `\r  downloading... ${mb} MB`,
  },
  'httpDownload': {
    es: ({ status, url }) => `la descarga falló: HTTP ${status} en ${url}`,
    en: ({ status, url }) => `download failed: HTTP ${status} at ${url}`,
  },
  'incompleteDownload': {
    es: ({ received, total }) => `descarga incompleta: ${received} de ${total} bytes`,
    en: ({ received, total }) => `incomplete download: ${received} of ${total} bytes`,
  },
  'stalled': {
    es: ({ url, seconds }) => `la conexión se detuvo: ${seconds} s sin recibir datos de ${url}`,
    en: ({ url, seconds }) => `the connection stalled: ${seconds} s without data from ${url}`,
  },
  'httpRead': {
    es: ({ url, status }) => `no se pudo leer ${url}: HTTP ${status}`,
    en: ({ url, status }) => `could not read ${url}: HTTP ${status}`,
  },

  // ── minisign.mjs ───────────────────────────────────────────────────────────
  'badPublicKey': { es: 'clave pública minisign malformada', en: 'malformed minisign public key' },
  'badPublicKeySize': {
    es: 'clave pública minisign con tamaño inesperado',
    en: 'minisign public key has an unexpected size',
  },
  'badSignature': { es: 'firma minisign malformada', en: 'malformed minisign signature' },
  'badSignatureSize': {
    es: 'firma minisign con tamaño inesperado',
    en: 'minisign signature has an unexpected size',
  },
  'otherKey': {
    es: ({ got, expected }) => `la firma fue hecha con otra clave (keyId ${got} != ${expected})`,
    en: ({ got, expected }) => `the signature was made with a different key (keyId ${got} != ${expected})`,
  },
  'badAlgorithm': {
    es: ({ got }) => `algoritmo de firma inesperado "${got}" (se esperaba "ED", minisign hashed)`,
    en: ({ got }) => `unexpected signature algorithm "${got}" (expected "ED", minisign hashed)`,
  },
  'wrongFile': {
    es: ({ signed, expected }) => `la firma es para "${signed}", no para "${expected}"`,
    en: ({ signed, expected }) => `the signature is for "${signed}", not for "${expected}"`,
  },
  'contentMismatch': {
    es: 'la firma del contenido no valida (archivo alterado o firma incorrecta)',
    en: 'the content signature does not validate (tampered file or wrong signature)',
  },
  'commentMismatch': {
    es: 'la firma del comentario de confianza no valida',
    en: 'the trusted comment signature does not validate',
  },
};

// `t('clave')` o `t('clave', { parámetros })`. Un mensaje puede ser un texto o
// una función de sus parámetros. Una clave que no existe es un error de quien
// escribe el código, no de quien ejecuta `npx`: falla ruidosamente.
export function t(key, params = {}) {
  const entry = MESSAGES[key];
  if (!entry) throw new Error(`mensaje sin definir: ${key}`);
  const message = entry[detectLocale()];
  return typeof message === 'function' ? message(params) : message;
}
