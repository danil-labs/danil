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

/* -------------------------------------------------------------- el runtime */

/* Tipografía y ritmo base para que un documento se lea como documento aunque el
   agente no traiga CSS. Va ANTES del suyo: lo que él escriba gana. Los valores
   siguen el sistema visual (sólido, hairline, radios 4/6/8, cero gradientes) pero no
   pueden leer sus tokens: el marco es opaco y no hereda las variables de la app.

   El modo presentación es CSS, no JavaScript: una diapositiva a la vez, la
   activa la marca el runtime. Si el script no corriera, se ven todas seguidas
   —degradado feo pero legible— en vez de una pantalla en blanco. La tabla se
   degrada igual: sin script sigue siendo una tabla, solo que no se ordena. */
const CSS_BASE = String.raw`
:root { color-scheme: light; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; padding: 24px 28px;
  font: 15px/1.65 ui-sans-serif, -apple-system, "Geist", system-ui, sans-serif;
  color: #18181b; background: #ffffff;
}

/* Quién le da al documento su medida, que ya no es esta hoja de estilos.

   El tope anterior era max-width 68ch solo sobre p y li: en un panel ancho
   los títulos, tablas, pre y hr llegaban al borde y la prosa se cortaba a
   media caja —944 px contra 627 px, medidos en una columna de 1000 px—, un
   documento desigual.

   La medida la pone ahora el marco, desde la app (.preview-frame.hoja): es lo
   único que el CSS del agente no puede pisar, y el margin:0 con el que casi
   todos abren su hoja dejaría cualquier columna nuestra pegada a un lado.

   Lo de abajo es la red para cuando no hay marco —abrir afuera, la copia para
   imprimir—, en una clase que pone el runtime al ver que nadie lo embebe. La
   medida es la de la página que va a salir: la caja de texto de un A4 con los
   márgenes de la hoja (21 cm menos 2+2); si esos márgenes
   cambian, esta medida cambia con ellos.

   content-box explícito: la caja de texto mide los 17 cm de verdad, el
   relleno queda fuera, y gana por especificidad al reset de box-sizing del
   agente. */
body.harness-suelto {
  box-sizing: content-box; max-width: 17cm; margin-inline: auto;
}
h1, h2, h3 { line-height: 1.25; letter-spacing: -0.01em; margin: 1.6em 0 0.5em; }
h1 { font-size: 26px; margin-top: 0; }
h2 { font-size: 20px; }
h3 { font-size: 16px; }
a { color: #6539f5; }
code, pre, .mono { font-family: "Geist Mono", ui-monospace, SFMono-Regular, monospace; font-size: 13px; }
pre { padding: 10px 12px; background: #f7f7f8; border: 1px solid #e4e4e7; border-radius: 6px; overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #e4e4e7; }
th { font-weight: 600; }
img { max-width: 100%; height: auto; }
blockquote { margin: 1em 0; padding-left: 14px; border-left: 2px solid #e4e4e7; color: #52525b; }
hr { border: 0; border-top: 1px solid #e4e4e7; margin: 2em 0; }

/* Una página web no es nada de lo de arriba: es la ventana entera, y la
   maqueta entera la escribe el agente. Lo único que hay que quitarle es el
   relleno con el que abre este archivo — un sitio que empieza con un
   encabezado a sangre y una franja de 24 px alrededor se lee como un
   documento mal maquetado. El resto de esta hoja son selectores de etiqueta
   pelada: el CSS del propio artefacto los pisa por orden. */
body.harness-web { padding: 0; max-width: none; }

/* Una presentación no es una hoja: es una pantalla, y ocupa la que haya. */
body.harness-presentacion { padding: 0; max-width: none; }
body.harness-presentacion section.slide { display: none; }
/* "safe center" y no "center" a secas: una diapositiva más alta que la
   columna —angosta— se centraría desbordando por arriba y por abajo, con lo
   que sobra inalcanzable para el scroll. Con "safe", en cuanto no cabe se
   alinea al inicio y se puede leer entera. */
body.harness-presentacion section.slide.harness-active {
  display: flex; flex-direction: column; justify-content: safe center;
  box-sizing: border-box; min-height: 100vh; padding: 32px 28px;
  /* Una rejilla de tres columnas escrita por el agente no cabe en una columna
     angosta. Que se pueda desplazar es peor que que quepa y mucho mejor que
     que se corte: lo que no cabe se puede alcanzar, y ensanchar la columna
     sigue siendo la salida buena. */
  overflow-x: auto;
}
body.harness-presentacion section.slide h1 { font-size: 30px; }
body.harness-presentacion section.slide li { margin: 0.35em 0; }

/* ------------------------------------------------------------------ tabla */

/* La caja la pone el runtime alrededor de cada tabla, y es lo que hace que una
   tabla de nueve columnas se pueda leer en una columna angosta: se desplaza,
   no se corta ni desborda la página. */
.harness-caja-tabla { overflow-x: auto; }

/* Cuando el artefacto ES la tabla, la que se desplaza es la caja y no la
   página: es la única forma de que la cabecera se quede pegada arriba, y
   pegar algo exige que quien haga scroll sea su contenedor.

   Tampoco es una hoja: cuanto más ancha, más columnas se comparan de un
   vistazo. Estrecharla a la medida de un párrafo cambiaría eso por
   desplazamiento horizontal, una lectura que nadie hace ahí. */
body.harness-tabla { padding: 0; max-width: none; }
body.harness-tabla .harness-caja-tabla { max-height: 100vh; overflow: auto; }
body.harness-tabla .harness-caja-tabla table { font-size: 13.5px; }
body.harness-tabla .harness-caja-tabla th {
  position: sticky; top: 0; z-index: 1;
  background: #ffffff;
  box-shadow: inset 0 -1px 0 #e4e4e7;
}

/* Ordenar es de la app, no del agente: la cabecera se comporta como un
   control por lo que el runtime le añade, no por cómo la escribió el
   agente. */
th[data-harness-th] { cursor: pointer; user-select: none; white-space: nowrap; }
th[data-harness-th]:hover { color: #6539f5; }
th[data-harness-th]:focus-visible { outline: 2px solid #6539f5; outline-offset: -2px; }
.harness-orden { display: inline-block; width: 1em; margin-left: 4px; font-size: 0.85em; opacity: 0.35; }
th[aria-sort="none"] .harness-orden::after { content: "\2195"; }
th[aria-sort="ascending"] .harness-orden::after { content: "\25B2"; }
th[aria-sort="descending"] .harness-orden::after { content: "\25BC"; }
th[aria-sort="ascending"] .harness-orden,
th[aria-sort="descending"] .harness-orden { opacity: 0.85; }

.harness-caja-tabla tbody tr:nth-child(even) { background: #fafafa; }
/* Una columna de números se lee alineada a la derecha y con cifras de ancho
   fijo; con ancho variable las unidades no se apilan y comparar de un vistazo
   deja de funcionar. */
.harness-num { text-align: right; font-variant-numeric: tabular-nums; }

/* Tematizar el marco desde aqui gana por especificidad sobre el body del
   documento y le cambia el fondo a un HTML con su propia paleta.
   (Sin acentos graves aqui dentro: uno solo cierra la plantilla.) */

/* Impresión: cada diapositiva es una página, y se imprimen todas, no solo la
   que está a la vista. Es lo que hace que el PDF exportado tenga las
   diapositivas paginadas en vez de una sola hoja con la activa. */
@media print {
  body { padding: 0; background: #fff; color: #000; }
  body.harness-presentacion section.slide,
  body.harness-presentacion section.slide.harness-active {
    display: flex !important; min-height: auto; height: 100vh;
    break-after: page; page-break-after: always;
  }
  body.harness-presentacion section.slide:last-of-type { break-after: auto; page-break-after: auto; }
  /* Una tabla larga se imprime entera: la caja que la desplaza en pantalla la
     cortaría en la primera página. Y la cabecera se repite en cada hoja. */
  body.harness-tabla .harness-caja-tabla { max-height: none; overflow: visible; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .harness-orden { display: none; }
}
`;

const JS_RUNTIME = String.raw`
(function () {
  var FORMA = "__FORMA__";
  var slides = Array.prototype.slice.call(document.querySelectorAll("section.slide"));
  var presentacion = FORMA === "presentacion" && slides.length > 0;
  var i = 0;
  var filas = 0;
  var zoom = 1;
  if (presentacion) document.body.classList.add("harness-presentacion");
  if (FORMA === "tabla") document.body.classList.add("harness-tabla");
  if (FORMA === "web") document.body.classList.add("harness-web");

  /* Nadie lo embebe: esto es «abrir afuera» o la copia para imprimir, y ahí no
     hay marco que le dé al documento la medida de una hoja. Se la da él. */
  try { if (window.parent === window && FORMA !== "web") document.body.classList.add("harness-suelto"); } catch (e) {}

  /* ------------------------------------------------------------- tablas */

  function texto(c) { return c ? (c.textContent || "").replace(/\s+/g, " ").trim() : ""; }


  function aNumero(s) {
    var t = s.replace(/[^0-9,.+\-]/g, "");
    if (!/[0-9]/.test(t)) return null;
    var coma = t.lastIndexOf(","), punto = t.lastIndexOf(".");
    if (coma > -1 && punto > -1) {
      t = coma > punto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
    } else if (coma > -1) {
      t = /,[0-9]{1,2}$/.test(t) ? t.replace(",", ".") : t.replace(/,/g, "");
    }
    if (!/^[+-]?[0-9]+(\.[0-9]+)?$/.test(t)) return null;
    var n = parseFloat(t);
    return isFinite(n) ? n : null;
  }

  /* Un porcentaje no es su número. "18,4 %" vale 0,184, y meter 18,4 en una
     hoja de cálculo hace que la media de la columna esté cien veces mal. Se
     marca para que salga con formato de porcentaje y siga significando lo
     mismo que en el documento. */
  function esPorcentaje(s) { return /%/.test(s); }

  function prepararTabla(tabla, n) {
    var cabecera = tabla.tHead && tabla.tHead.rows.length ? tabla.tHead.rows[0] : null;
    var cuerpo = tabla.tBodies.length ? tabla.tBodies[0] : null;
    if (!cabecera || !cuerpo || !cuerpo.rows.length) return 0;


    var caja = document.createElement("div");
    caja.className = "harness-caja-tabla";
    caja.setAttribute("data-harness", "caja");
    caja.setAttribute("data-t", String(n));
    tabla.parentNode.insertBefore(caja, tabla);
    caja.appendChild(tabla);

    var originales = Array.prototype.slice.call(cuerpo.rows);
    originales.forEach(function (tr, k) { tr.setAttribute("data-harness-fila", String(k)); });

    var ths = Array.prototype.slice.call(cabecera.cells);
    ths.forEach(function (th, col) {
      var valores = originales.map(function (tr) { return texto(tr.cells[col]); });
      var llenos = valores.filter(function (v) { return v !== ""; });
      var numerica = llenos.length > 0 && llenos.every(function (v) { return aNumero(v) !== null; });

      if (numerica) {
        th.classList.add("harness-num");
        originales.forEach(function (tr) {
          if (tr.cells[col]) tr.cells[col].classList.add("harness-num");
        });
      }

      th.setAttribute("data-harness-th", "1");
      th.setAttribute("role", "button");
      th.setAttribute("tabindex", "0");
      th.setAttribute("aria-sort", "none");
      var flecha = document.createElement("span");
      flecha.className = "harness-orden";
      flecha.setAttribute("data-harness", "quitar");
      flecha.setAttribute("aria-hidden", "true");
      th.appendChild(flecha);

      function ordenar() {
        var desc = th.getAttribute("aria-sort") === "ascending";
        ths.forEach(function (o) { o.setAttribute("aria-sort", "none"); });
        th.setAttribute("aria-sort", desc ? "descending" : "ascending");
        Array.prototype.slice.call(cuerpo.rows).sort(function (a, b) {
          var ta = texto(a.cells[col]), tb = texto(b.cells[col]);
          /* Las celdas vacías al final en los dos sentidos: un hueco no es "lo
             más chico", es un dato que falta, y llevarlo arriba al ordenar
             descendente esconde justo lo que se estaba buscando. */
          if (ta === "" || tb === "") return ta === tb ? 0 : (ta === "" ? 1 : -1);
          var r;
          if (numerica) {
            r = aNumero(ta) - aNumero(tb);
          } else {
            r = ta.localeCompare(tb, undefined, { numeric: true, sensitivity: "base" });
          }
          return desc ? -r : r;
        }).forEach(function (tr) { cuerpo.appendChild(tr); });
      }

      th.addEventListener("click", function () { if (!document.body.isContentEditable) ordenar(); });
      th.addEventListener("keydown", function (e) {
        if (document.body.isContentEditable) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ordenar(); }
      });
    });

    return originales.length;
  }

  /* En una página web no se toca ninguna tabla: es lo único que el runtime
     deja de hacer por ella. En un sitio o mockup la tabla es parte de la
     maqueta, y meterle la caja de desplazamiento, la flecha de orden y un
     role="button" cambia lo que el agente diseñó sin que nada falle. */
  if (FORMA !== "web") {
    Array.prototype.slice.call(document.querySelectorAll("table")).forEach(function (t, n) {
      filas += prepararTabla(t, n);
    });
  }

  /* ------------------------------------------------- diapositivas y puente */

  function pintar() {
    slides.forEach(function (s, n) { s.classList.toggle("harness-active", n === i); });
    announce();
  }
  function announce() {
    try {
      parent.postMessage({ harness: "estado", i: i, total: slides.length, filas: filas, zoom: zoom }, "*");
    } catch (e) {}
  }
  // El zoom va en el documento: así el texto se reacomoda a lo ancho.
  function acercar(z) {
    zoom = Math.max(0.25, Math.min(4, Number(z) || 1));
    document.documentElement.style.zoom = String(zoom);
    announce();
  }
  function ir(n) {
    if (!presentacion) return;
    i = Math.max(0, Math.min(slides.length - 1, n));
    pintar();
    window.scrollTo(0, 0);
  }

  window.addEventListener("message", function (e) {
    var m = e.data;
    if (!m || m.harness !== "control") return;
    if (m.accion === "ir") ir(m.i);
    if (m.accion === "siguiente") ir(i + 1);
    if (m.accion === "anterior") ir(i - 1);
    if (m.accion === "zoom") acercar(m.valor);
  });

  // Con el foco aquí dentro, la app no recibe ⌘+ ⌘− ⌘0: los atiende el documento.
  window.addEventListener("keydown", function (e) {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    if (e.key === "=" || e.key === "+") acercar(zoom * 1.25);
    else if (e.key === "-") acercar(zoom / 1.25);
    else if (e.key === "0") acercar(1);
    else return;
    e.preventDefault();
  });

  // Las flechas funcionan con el foco dentro del documento; la app maneja las
  // mismas teclas cuando el foco está afuera. Las dos: un clic en la
  // diapositiva mueve el foco aquí, y desde afuera no se puede saber cuál.
  window.addEventListener("keydown", function (e) {
    if (!presentacion || document.body.isContentEditable) return;
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { ir(i + 1); e.preventDefault(); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { ir(i - 1); e.preventDefault(); }
    else if (e.key === "Home") { ir(0); e.preventDefault(); }
    else if (e.key === "End") { ir(slides.length - 1); e.preventDefault(); }
  });

  if (presentacion) pintar(); else announce();
})();
`;

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
