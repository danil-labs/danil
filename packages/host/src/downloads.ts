/**
 * Las descargas estables del escritorio en danil.ai/download/
 * (docs/download-urls.md). El nombre de cada archivo es contrato con la página.
 */
export const DOWNLOAD_PAGE = "https://danil.ai/download/";

export type DesktopPlatform = "macos" | "windows" | "linux";

export type DesktopDownload = { platform: DesktopPlatform; file: string; url: string };

const file = (platform: DesktopPlatform, name: string): DesktopDownload => ({ platform, file: name, url: `${DOWNLOAD_PAGE}${name}` });

export const DESKTOP_DOWNLOADS: readonly DesktopDownload[] = [
  file("macos", "Danil-macOS.dmg"),
  file("windows", "Danil-Windows-Setup.exe"),
  file("linux", "Danil-Linux-x86_64.AppImage"),
];

/** La plataforma de quien navega, para poner su descarga primero; `null` si no se sabe. */
export function platformOf(userAgent: string): DesktopPlatform | null {
  if (/iPhone|iPad|iPod|Android/i.test(userAgent)) return null;
  if (/Windows/i.test(userAgent)) return "windows";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "macos";
  if (/Linux|X11/i.test(userAgent)) return "linux";
  return null;
}

/** Las descargas con la de esta computadora primero. */
export function downloadsFor(userAgent: string): DesktopDownload[] {
  const mine = platformOf(userAgent);
  return [...DESKTOP_DOWNLOADS].sort((a, b) => Number(b.platform === mine) - Number(a.platform === mine));
}
