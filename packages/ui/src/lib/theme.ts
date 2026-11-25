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

const [themeRev, setThemeRev] = createSignal(0);
const bumpTheme = () => setThemeRev((n) => n + 1);

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // En contextos con almacenamiento bloqueado el tema sigue aplicando en memoria.
  }
}

export function apariencia(): Apariencia {
  themeRev();
  const v = readPref(CLAVE);
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
  themeRev();
  return readPref(DARK_STYLE_KEY) === "navy" ? "navy" : "graphite";
}

export function lightStyle(): LightStyle {
  themeRev();
  return readPref(LIGHT_STYLE_KEY) === "graphite" ? "graphite" : "violet";
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
  writePref(DARK_STYLE_KEY, style === "graphite" ? null : style);
  paintDarkStyle(style);
  bumpTheme();
  return style;
}

export function chooseLightStyle(style: LightStyle): LightStyle {
  writePref(LIGHT_STYLE_KEY, style === "violet" ? null : style);
  paintLightStyle(style);
  bumpTheme();
  return style;
}

let siguiendo = false;

/**
 * Aplica la preferencia y se queda escuchando al sistema. El oyente no se quita
 * al elegir claro u oscuro: sigue registrado sin efecto, y volver a «sistema»
 * funciona sin volver a suscribirse.
 */
export function seguirElTema() {
  const media = window.matchMedia(OSCURO);
  const aplicarTodo = () => {
    paintDarkStyle(darkStyle());
    paintLightStyle(lightStyle());
    pintar(apariencia(), media);
  };
  aplicarTodo();
  if (siguiendo) return;
  siguiendo = true;
  media.addEventListener("change", () => pintar(apariencia(), media));
  window.addEventListener("storage", (e) => {
    if (e.key !== null && e.key !== CLAVE && e.key !== DARK_STYLE_KEY && e.key !== LIGHT_STYLE_KEY) return;
    bumpTheme();
    aplicarTodo();
  });
}

/** La cambia y la pinta. Devuelve la elegida, para que quien la llame no tenga
 *  que releerla del almacenamiento. */
export function elegirApariencia(a: Apariencia): Apariencia {
  writePref(CLAVE, a === "sistema" ? null : a);
  pintar(a, window.matchMedia(OSCURO));
  bumpTheme();
  return a;
}
