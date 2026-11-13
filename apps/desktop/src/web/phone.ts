/**
 * La web y su versión del teléfono (`<base>m/`, la app de Expo compilada para web) comparten
 * origen y borde. Un teléfono que abre la web va a la del teléfono, como antes de W1: también al
 * volver de identity, cuya vuelta exacta es la raíz. Cada una enlaza a la otra y lo que la persona
 * elige se recuerda (`chosenWebLayout`). Sin APIs del DOM: el navegador se inyecta.
 */
import { MOBILE_WEB_DIR, chosenWebLayout } from "@terminus/design";

type Place = { pathname: string; search: string };

/** Adónde mandar este navegador, o `null` si se queda en la web. */
export function phoneRoute(place: Place, base: string, browser: Parameters<typeof chosenWebLayout>[0]): string | null {
  const phone = `${base}${MOBILE_WEB_DIR}/`;
  // Una ruta del teléfono que sirvió la web (recarga, enlace): su raíz la abre con `?to=`.
  if (place.pathname.startsWith(phone) && place.pathname !== phone) return `${phone}?to=${encodeURIComponent(place.pathname.slice(phone.length - 1) + place.search)}`;
  // Su raíz misma solo llega aquí si no está publicada: se queda, sin bucle.
  if (place.pathname.startsWith(phone) || chosenWebLayout(browser) !== "mobile") return null;
  return `${phone}${place.search}`;
}
