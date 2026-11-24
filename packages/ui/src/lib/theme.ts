/**
 * Qué tema pinta la ventana: el del sistema, claro, u oscuro.
 *
 * El oscuro se activa por atributo y no por media query, y este archivo es
 * quien decide. «Sistema» es un tercer estado, no la ausencia de elección: con
 * solo claro/oscuro no se puede seguir al Mac en automático.
 *
 * Se aplica antes de montar la app (`main.tsx`) para que el primer pintado
 * salga en el tema bueno; sin eso la ventana abre en claro y parpadea. Por eso
 * la preferencia vive en `localStorage` y no en disco: leerla tiene que ser
 * síncrono, y un comando de Tauri no lo es.
 */
import { createSignal } from "solid-js";

export type Apariencia = "sistema" | "claro" | "oscuro";

const CLAVE = "harness:apariencia";
const OSCURO = "(prefers-color-scheme: dark)";

export function apariencia(): Apariencia {
  const v = localStorage.getItem(CLAVE);
  return v === "claro" || v === "oscuro" ? v : "sistema";
}

/**
 * El tema ya resuelto: `"light"` o `"dark"`, nunca «sistema». Para el
 * contenedor de artefactos: el marco no hereda las variables de la app y hay
 * que estampárselo al envolver el documento (`lib/sandbox.ts`). Es señal y no
 * lectura del DOM porque el `srcdoc` se calcula en un `createMemo`: leer
 * `dataset.theme` a pelo dejaría el artefacto en el tema del primer pintado,
 * sin error.
 */
const [temaPintado, setTemaPintado] = createSignal<"light" | "dark">(
  document.documentElement.dataset.theme === "dark" ? "dark" : "light",
);
export { temaPintado };

function pintar(a: Apariencia, media: MediaQueryList) {
  const oscuro = a === "oscuro" || (a === "sistema" && media.matches);
  document.documentElement.dataset.theme = oscuro ? "dark" : "light";
  setTemaPintado(oscuro ? "dark" : "light");
}

/** Cuál de los dos oscuros; grafito si no se eligió. En claro el atributo queda sin efecto: el CSS pide los dos. */
export type DarkStyle = "navy" | "graphite";
/** Cuál de los dos claros; violeta si no se eligió. */
export type LightStyle = "violet" | "graphite";

const DARK_STYLE_KEY = "harness:dark-style";
const LIGHT_STYLE_KEY = "harness:light-style";

export function darkStyle(): DarkStyle {
  return localStorage.getItem(DARK_STYLE_KEY) === "navy" ? "navy" : "graphite";
}

export function lightStyle(): LightStyle {
  return localStorage.getItem(LIGHT_STYLE_KEY) === "graphite" ? "graphite" : "violet";
}

function paintDarkStyle(style: DarkStyle) {
  if (style === "navy") delete document.documentElement.dataset.darkStyle;
  else document.documentElement.dataset.darkStyle = style;
}

function paintLightStyle(style: LightStyle) {
  if (style === "violet") delete document.documentElement.dataset.lightStyle;
  else document.documentElement.dataset.lightStyle = style;
}

export function chooseDarkStyle(style: DarkStyle): DarkStyle {
  if (style === "graphite") localStorage.removeItem(DARK_STYLE_KEY);
  else localStorage.setItem(DARK_STYLE_KEY, style);
  paintDarkStyle(style);
  return style;
}

export function chooseLightStyle(style: LightStyle): LightStyle {
  if (style === "violet") localStorage.removeItem(LIGHT_STYLE_KEY);
  else localStorage.setItem(LIGHT_STYLE_KEY, style);
  paintLightStyle(style);
  return style;
}

/**
 * Aplica la preferencia y se queda escuchando al sistema. El oyente no se quita
 * al elegir claro u oscuro: sigue registrado sin efecto, y volver a «sistema»
 * funciona sin volver a suscribirse.
 */
export function seguirElTema() {
  const media = window.matchMedia(OSCURO);
  paintDarkStyle(darkStyle());
  paintLightStyle(lightStyle());
  pintar(apariencia(), media);
  media.addEventListener("change", () => pintar(apariencia(), media));
}

/** La cambia y la pinta. Devuelve la elegida, para que quien la llame no tenga
 *  que releerla del almacenamiento. */
export function elegirApariencia(a: Apariencia): Apariencia {
  if (a === "sistema") localStorage.removeItem(CLAVE);
  else localStorage.setItem(CLAVE, a);
  pintar(a, window.matchMedia(OSCURO));
  return a;
}
