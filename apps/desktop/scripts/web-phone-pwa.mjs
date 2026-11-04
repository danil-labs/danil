/**
 * Manifest, service worker y cabeceras de caché del teléfono (`<base>m/`).
 * Las etiquetas del `<head>`, los íconos y `sw.js` están en `apps/mobile/public/`.
 * El service worker solo muestra avisos push: sin `fetch` ni caché, así que
 * `index.html`, el manifest y `sw.js` se revalidan; lo que lleva hash, largo.
 *
 * `scope` es `/`: el inicio de sesión de Danil vive en `/` y, fuera del scope,
 * iOS lo abre en una vista de Safari aparte. `id` y `start_url` NO se cambian
 * (obliga a reinstalar); el `id` no es `/`, que es el de la app de Danil.
 */

export const PHONE_DIR = "m";

/** Íconos copiados de `apps/mobile/public/icons/`, rutas relativas a `<base>m/`. */
export const PHONE_ICONS = [
  { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

/** El manifest del teléfono para la base de la web (`/terminus/` por omisión). */
export function phoneManifest(base) {
  const phone = `${base}${PHONE_DIR}/`;
  return {
    id: phone,
    name: "Danil",
    short_name: "Danil",
    description: "Tus tareas de Danil desde el teléfono.",
    lang: "es",
    dir: "ltr",
    start_url: phone,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // `surface` de los temas de `@terminus/design`: el de la barra de arriba de la app.
    theme_color: "#ffffff",
    background_color: "#ffffff",
    icons: PHONE_ICONS.map((icon) => ({ ...icon, src: `${phone}${icon.src}` })),
  };
}

/**
 * Reglas de `_headers` para el teléfono (y los bundles de la web de escritorio).
 * Cloudflare suma las cabeceras de todas las reglas que coinciden; la de
 * `<base>*` (CSP) la escribe `vite.config.ts`.
 */
export function phoneHeaders(base) {
  const phone = `${base}${PHONE_DIR}/`;
  const fresh = "  Cache-Control: no-cache";
  const forever = "  Cache-Control: public, max-age=31536000, immutable";
  return [
    phone,
    fresh,
    `${phone}index.html`,
    fresh,
    `${phone}sw.js`,
    fresh,
    `${phone}manifest.webmanifest`,
    "  Content-Type: application/manifest+json",
    fresh,
    `${phone}_expo/static/*`,
    forever,
    `${base}assets/*`,
    forever,
    "",
  ];
}

/** `sw.js` con la entrada de este build: el aviso de inicio de sesión vuelve al teléfono. */
export function phoneWorker(source, login, base) {
  if (!source.includes('"__TERMINUS_SIGN_IN__"')) throw new Error("sw.js sin __TERMINUS_SIGN_IN__");
  const url = new URL(login, "https://danil.invalid");
  if (url.origin !== "https://danil.invalid") throw new Error(`la entrada ${login} no es del mismo origen`);
  url.searchParams.set("next", `${base}${PHONE_DIR}/`);
  return source.replace('"__TERMINUS_SIGN_IN__"', JSON.stringify(`${url.pathname}${url.search}`));
}
