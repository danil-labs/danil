/**
 * Qué Terminus abre el navegador: el de escritorio (`/terminus/`) o el del
 * teléfono (`/terminus/m/`, la app de Expo compilada para web). Un teléfono
 * abre el del teléfono; cada uno tiene un enlace al otro y lo que la persona
 * elige se recuerda en este navegador.
 */
export type WebLayout = "desktop" | "mobile";

export const WEB_LAYOUT_KEY = "terminus.web.layout";
/** La carpeta de la versión del teléfono bajo la base de la web. */
export const MOBILE_WEB_DIR = "m";

type Browser = { matchMedia(query: string): { matches: boolean }; localStorage: { getItem(key: string): string | null } };

/** Pantalla chica y táctil: no basta el `User-Agent`, que un iPad o un navegador de escritorio pueden fingir. */
export const PHONE_QUERY = "(pointer: coarse) and (max-width: 820px)";

export function chosenWebLayout(browser: Browser): WebLayout {
  let saved: string | null = null;
  try {
    saved = browser.localStorage.getItem(WEB_LAYOUT_KEY);
  } catch {
    // Almacenamiento bloqueado: decide la pantalla.
  }
  if (saved === "desktop" || saved === "mobile") return saved;
  return browser.matchMedia(PHONE_QUERY).matches ? "mobile" : "desktop";
}
