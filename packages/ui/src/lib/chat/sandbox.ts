/**
 * El contenedor de un artefacto HTML: qué puede y qué no puede hacer el código
 * que escribió el agente cuando la app lo pinta. Enforcement, no asistencia:
 * la forma correcta se le pide (`artifact_guidance` en `runtime/chat/`); que no pueda
 * hacer red se le impone aquí. La vía de salida que importa es la red, no el
 * sistema de archivos — solo lectura impide modificar, no exfiltrar
 * (`ARCHITECTURE.md` § 3).
 *
 * Tres candados, y hacen falta los tres; este archivo solo tiene dos:
 *
 * 1. `sandbox` sin `allow-same-origin`: origen opaco. No alcanza el DOM del
 *    padre, ni sus cookies, ni su `localStorage`, ni los comandos de Tauri.
 * 2. La CSP de abajo, inyectada como primer elemento del documento: corta
 *    toda salida de red. Un origen opaco puede hacer `fetch` igual que
 *    cualquier otro, y el sandbox solo no basta.
 * 3. `frame-src 'self'` en `index.html`, la ventana que embebe el marco: un
 *    marco puede navegarse a sí mismo, y eso lo para la política del padre,
 *    no el sandbox ni su propia política. La contención no vive toda aquí.
 *
 * Una forma nueva no afloja ninguno de los tres: la tabla entra con el mismo
 * `envolver`, misma política, mismo sandbox. Atacado con su control negativo:
 * `tests/security/README.md`.
 */
// Con la extensión, y es lo que deja probar este módulo: `scripts/*.test.ts`
// corre en Node con `--experimental-strip-types`, y ahí un especificador
// relativo sin extensión no resuelve —es una resolución de bundler, no de
// Node—. Vite y `tsc` la aceptan igual. Ver la misma nota en `lib/tabs.ts`.

/**
 * Toda la red, cerrada. `default-src 'none'` ya niega por omisión; las demás
 * están escritas una por una: una lista explícita es lo que se revisa en un PR
 * contra los vectores probados.
 *
 * Lo que se permite:
 * - `script-src 'unsafe-inline'`: el artefacto es HTML que corre — una
 *   presentación navega, una tabla ordena. Se corta la salida, no la
 *   ejecución: un script sin red no exfiltra nada.
 * - `style-src 'unsafe-inline'`: el agente escribe su CSS en el documento.
 * - `img-src`/`font-src`/`media-src data:`: embebido, nunca remoto. Obliga a
 *   que el artefacto sea autocontenido de verdad.
 */
import { CSS_INLINE, inlineVisualStyles, JS_INLINE, type VisualTheme } from "./inlineVisual.ts";
import { CSS_BASE, JS_RUNTIME } from "./sandbox-runtime.ts";

/** Lo que comparten el artefacto y los visores MCP (draw.io y el proxy): nada sale del marco. */
const CSP_BASE = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "media-src data:",
  // Las cuatro que cierran la salida: XHR/fetch/WebSocket/EventSource/beacon,
  // el envío de formularios, cargar otro marco dentro, y reescribir a dónde
  // apuntan las rutas relativas.
  "connect-src 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "worker-src 'none'",
];

/** La política de los visores MCP: la del artefacto sin `manifest-src`. */
export const CSP_VISOR = CSP_BASE.join("; ");

export const CSP_ARTEFACTO = [...CSP_BASE, "manifest-src 'none'"].join("; ");

/**
 * Lo único que se le concede al marco. Sin `allow-same-origin` (origen opaco),
 * sin `allow-top-navigation` (no puede arrastrar la ventana de la app a otro
 * lado), sin `allow-popups`, sin `allow-forms`, sin `allow-modals` — un
 * `alert()` que congele la app no es una funcionalidad —, sin
 * `allow-downloads`.
 */
export const SANDBOX_ARTEFACTO = "allow-scripts";

export type Forma = "documento" | "presentacion" | "tabla" | "web";

const METAS = /<meta\b[^>]*>/gi;

/** La forma que el agente declaró, si la declaró, venga en el orden que venga. */
function declarada(html: string): Forma | null {
  for (const tag of html.match(METAS) || []) {
    if (!/name\s*=\s*["']?harness-artefacto["']?/i.test(tag)) continue;
    const c = /content\s*=\s*["']?([a-z]+)/i.exec(tag)?.[1]?.toLowerCase();
    if (c === "documento" || c === "presentacion" || c === "tabla" || c === "web")
      return c;
  }
  return null;
}

/**
 * Cuánto texto puede haber fuera de las tablas para que el documento siga
 * siendo «una tabla». Da para un título y un pie; no para prosa.
 */
const SOBRA_FUERA_DE_LA_TABLA = 200;

/**
 * Un documento que es una tabla y casi nada más, aunque no lo diga. Se mide
 * por lo que sobra: sin comentarios, scripts, estilos ni tablas, el texto
 * visible que queda tiene que caber en un título. Un informe con una tabla en
 * medio tiene párrafos alrededor y se queda como documento.
 */
function esCasiSoloTabla(html: string): boolean {
  if (!/<table\b/i.test(html)) return false;
  const resto = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<table\b[\s\S]*?<\/table>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return resto.length <= SOBRA_FUERA_DE_LA_TABLA;
}

/**
 * Qué forma tiene lo que el agente escribió.
 *
 * Se lee del texto crudo y no del DOM del marco: el marco es opaco a
 * propósito, y el mismo aislamiento que impide exfiltrar impide
 * inspeccionarlo. Es el precio del candado.
 *
 * La declaración explícita gana; si no está, basta con secciones de
 * diapositiva o con que lo único que traiga sea una tabla. Sin ninguna de las
 * tres, documento es la forma por omisión: el agente no está obligado a
 * acertar, se degrada, no se rompe.
 *
 * `web` solo se reconoce declarada, y no se adivina: una landing y un informe
 * se escriben con las mismas etiquetas, y fallar hacia `web` le quita a un
 * informe su barra —su cadena de versiones y sus cuatro salidas—. Sin
 * declarar es documento. Quién se lo pide al agente: `runtime/chat/` ·
 * `artifact_guidance`.
 */
export function formaDe(html: string): Forma {
  const dicha = declarada(html);
  if (dicha) return dicha;
  if (/<section[^>]+class=["'][^"']*\bslide\b/i.test(html)) return "presentacion";
  if (esCasiSoloTabla(html)) return "tabla";
  return "documento";
}

/* ---------------------------------------------------------------- el puente */

/**
 * Lo que la app acepta de vuelta del marco.
 *
 * `postMessage` es el agujero que la política de contenido no ve: no es red,
 * y mandar un mensaje al padre es lo único que un origen opaco tiene
 * permitido. Lo que cruza se decide aquí, a mano, y no dentro de un
 * componente: es el contrato del contenedor, y `tests/security/` lo ataca usando
 * estas mismas funciones.
 *
 * La regla: del marco solo entran números y banderas. Todo lo que llega se
 * reduce a un tipo de aquí; ninguna cadena que escribió el agente se pinta en
 * el DOM de la app.
 */
export type Estado = { i: number; total: number; filas: number; zoom: number };

/**
 * Posición, total y filas. `Number(...) || 0` no es descuido: convierte
 * cualquier cosa —una cadena con etiquetas, un objeto, `NaN`— en un número o en
 * cero. Un contador equivocado es un contador equivocado; no es una vía.
 */
export function leerEstado(m: unknown): Estado | null {
  const d = m as Record<string, unknown> | null;
  if (!d || d.harness !== "estado") return null;
  return {
    i: Number(d.i) || 0,
    total: Number(d.total) || 0,
    filas: Number(d.filas) || 0,
    zoom: Number(d.zoom) || 1,
  };
}

export function envolver(
  html: string,
  opciones?: { impresion?: boolean; inline?: { font: string; theme: VisualTheme } },
): string {
  const forma = opciones?.inline ? "web" : formaDe(html);
  const runtime = JS_RUNTIME.replace('"__FORMA__"', JSON.stringify(forma));
  const inline = opciones?.inline;
  const styles = inline ? inlineVisualStyles(inline.font, inline.theme) : "";
  const imprimir = opciones?.impresion
    ? `<script data-harness="quitar">window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 250); });</script>`
    : "";

  // El atributo va en nuestro `<html>`, que es el primero: el analizador
  // fusiona las cabeceras conservando los atributos del primero, y un
  // `<html>` del agente no lo pisa.
  //

  return (
    `<!doctype html><html${inline ? ` data-theme="${inline.theme.mode}"` : ""}><head><meta charset="utf-8" data-harness="quitar">` +
    `<meta http-equiv="Content-Security-Policy" content="${CSP_ARTEFACTO}" data-harness="quitar">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1" data-harness="quitar">` +
    `<style data-harness="quitar">${CSS_BASE}${styles}</style></head><body>` +
    html +
    (inline ? `<style data-harness="quitar">${CSS_INLINE}</style>` : "") +
    `<script data-harness="quitar">${runtime}${inline ? JS_INLINE : ""}</script>${imprimir}</body></html>`
  );
}
