// La clave selecciona la plataforma y la arquitectura en latest.json. Sin
// entrada soportada, el instalador informa que la plataforma no está soportada.

const LABELS = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
};

const ARCH_LABELS = {
  x64: 'x64',
  arm64: 'ARM64 (Apple Silicon)',
  ia32: 'x86 32-bit',
};

// process.platform x process.arch -> clave de plataforma de Tauri updater.
// Solo se publican Windows x64, macOS Apple Silicon (arm64) y Linux x64.
function tauriPlatformKey(platform, arch) {
  switch (platform) {
    case 'win32':
      return arch === 'x64' ? 'windows-x86_64' : null;
    case 'darwin':
      return arch === 'arm64' ? 'darwin-aarch64' : null;
    case 'linux':
      return arch === 'x64' ? 'linux-x86_64' : null;
    default:
      return null;
  }
}

export function detectPlatform() {
  const platform = process.platform;
  const arch = process.arch;
  const label = `${LABELS[platform] || platform} ${ARCH_LABELS[arch] || arch}`;
  const key = tauriPlatformKey(platform, arch);
  return {
    platform,
    arch,
    label,
    key,
    // Qué hay que hacer con lo que se baja, que no es lo mismo en las tres:
    // Windows recibe un instalador que se ejecuta, macOS el `.app` comprimido,
    // que se descomprime y se copia, y Linux un AppImage, que no se instala: se
    // deja en un lugar estable y se marca ejecutable.
    installerKind:
      !key
        ? 'unknown'
        : platform === 'win32'
          ? 'windows-nsis'
          : platform === 'darwin'
            ? 'macos'
            : platform === 'linux'
              ? 'linux-appimage'
              : 'unknown',
  };
}
