/**
 * Dónde va la capa nativa de un sitio, y cuándo se la puede enseñar.
 *
 * **Un webview nativo no es un `div`: flota sobre la ventana.** No participa
 * del layout, nadie lo mueve al mover lo de al lado, y **se pinta encima de
 * todo lo que el DOM ponga en ese rectángulo** — un diálogo, un menú, un globo.
 * Las dos mitades del problema viven aquí para que no se resuelvan dos veces
 * con dos criterios distintos:
 *
 * | | Qué contesta |
 * |---|---|
 * | [`seguirHueco`] | Dónde está el hueco de la pestaña, ahora y cada vez que cambia |
 * | [`hayCapaEncima`] | Si el DOM tiene algo abierto que la capa taparía en su hueco |
 *
 * **El hueco se mide en píxeles CSS y no se toca.** `getBoundingClientRect()` da
 * píxeles CSS, que son los puntos lógicos que `sites::site_place` espera: Rust
 * convierte con el factor de escala de la ventana. Multiplicar aquí por
 * `devicePixelRatio` pone la capa al doble de lejos en un Mac Retina y acierta
 * en una pantalla normal — la misma trampa que `scripts/guards/drop.mjs` caza al revés,
 * y por la que **ni una máquina verifica por la otra**.
 *
 * Un `ResizeObserver` sobre el hueco alcanza para todo lo que lo mueve: plegar
 * el historial, abrir la columna de artefactos, arrastrar el separador y
 * redimensionar la ventana **cambian su tamaño**, no solo su posición; mover la
 * ventana por la pantalla no cambia nada, porque la posición es relativa a ella.
 * Las medidas se juntan en un `requestAnimationFrame`: arrastrar el separador
 * dispara el observador decenas de veces por segundo y cada una es un `invoke`.
 *
 * **Lo que hay encima es «cualquier cosa fuera de la app», y no una lista.** Los
 * diálogos, los menús, los globos y Configuración salen a `<body>` por un portal
 * —`Kobalte.Portal` y el `Portal` de Solid—, así que un hijo de `<body>` **que
 * pinte algo** y no sea `#root` es algo abierto encima. Mirarlo por `role=` se
 * queda corto en silencio el día que se monte un átomo con un rol que nadie
 * apuntó, y el síntoma sería un menú abierto **detrás** de un sitio web sin que
 * nada falle.
 *
 * **«Que pinte algo» es la mitad que no da error.** Contar hijos y pedir uno
 * solo da 2 desde el primer instante —`index.html` tiene `#root` y el
 * `<script type="module">` que arranca la app—, así que la respuesta es «siempre
 * hay algo encima» y la capa no se enseña nunca: el webview carga la página y se
 * queda en 1×1 y oculto, sin que nada falle. Por eso `PINTAN_NADA` es una lista
 * de etiquetas y no de roles — equivocarse hacia el lado de esconder solo
 * esconde de más, y hacia el otro tapa la interfaz.
 */

import { createSignal, onCleanup } from "solid-js";

/**
 * Cómo se lee una dirección en pantalla: `localhost:3000`.
 *
 * Vive aquí y no en cada sitio que la pinta porque son dos —la pestaña de la
 * tira y la propia vista— y dos recortes distintos de la misma URL es cómo se
 * acaba con una pestaña que dice `localhost:3000` y un mensaje que dice
 * `http://localhost:3000/`.
 */
export const corta = (url: string) =>
  url.replace(/^https?:\/\//, "").replace(/\/$/, "");

/**
 * Lo tecleado en la barra de una pestaña de navegador, como dirección.
 *
 * Con esquema se respeta tal cual —`abrible` en Rust decide si pasa—. Sin él,
 * algo con forma de host (`github.com`, `localhost:3000`) gana `https://`, o
 * `http://` si es de esta computadora: un servidor de desarrollo casi nunca
 * tiene certificado. Lo demás es una búsqueda.
 */
export function aDireccion(texto: string): string | null {
  const t = texto.trim();
  if (!t) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return t;
  if (!/\s/.test(t)) {
    if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(t)) return `http://${t}`;
    if (/^[^/]+\.[a-z]{2,}(:\d+)?(\/|$)/i.test(t) || /^[^/]+:\d+(\/|$)/.test(t)) return `https://${t}`;
  }
  return `https://duckduckgo.com/?q=${encodeURIComponent(t)}`;
}

/** El rectángulo del hueco, en píxeles CSS. Es lo que viaja a `site_place`. */
export type Hueco = { x: number; y: number; width: number; height: number };

const mismasZonas = (a: readonly Hueco[], b: readonly Hueco[]) =>
  a.length === b.length &&
  a.every((z, i) => z.x === b[i].x && z.y === b[i].y && z.width === b[i].width && z.height === b[i].height);
/** Lo que pinta cada portal abierto en `<body>`, en píxeles CSS. */
const [zonas, setZonas] = createSignal<readonly Hueco[]>([], { equals: mismasZonas });
const [nativeModals, setNativeModals] = createSignal(0);

// La capa modal del navegador conserva su nodo bajo #root, sin un portal en body.
export function suspendSiteLayers(): () => void {
  setNativeModals((count) => count + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    setNativeModals((count) => count - 1);
  };
}

/** Mientras se arrastra un separador las capas se esconden: una capa nativa sigue al DOM con retraso y se montaría encima. */
const [moviendoHueco, setMoviendoHueco] = createSignal(false);
export { moviendoHueco, setMoviendoHueco };

/** La capa modal nativa no tiene rectángulo que medir: tapa la ventana entera. */
const TODA: Hueco = { x: -1e9, y: -1e9, width: 3e9, height: 3e9 };

/**
 * Lo abierto encima de la app, en rectángulos: la señal que siguen los efectos que colocan capas.
 * Sobre `<body>` se observa `childList` sin `subtree`, que despertaría con cada token del chat;
 * dentro de cada portal se mira todo: un menú se coloca un cuadro después de montarse.
 */
export function zonasEncima(): readonly Hueco[] {
  encender();
  return nativeModals() > 0 ? [TODA] : zonas();
}

const seCruzan = (a: Hueco, b: Hueco) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Si algo abierto en el DOM se cruza con `hueco`. Tocarse por el borde no cuenta. */
export function hayCapaEncima(hueco: Hueco) {
  return zonasEncima().some((z) => seCruzan(z, hueco));
}

const area = (h: Hueco) => h.width * h.height;

/** Las franjas de `h` a cada lado de `z`: izquierda, derecha, arriba y abajo. */
function alrededor(h: Hueco, z: Hueco): Hueco[] {
  const derecha = h.x + h.width;
  const abajo = h.y + h.height;
  return [
    { x: h.x, y: h.y, width: z.x - h.x, height: h.height },
    { x: z.x + z.width, y: h.y, width: derecha - (z.x + z.width), height: h.height },
    { x: h.x, y: h.y, width: h.width, height: z.y - h.y },
    { x: h.x, y: z.y + z.height, width: h.width, height: abajo - (z.y + z.height) },
  ].filter((f) => f.width >= 1 && f.height >= 1);
}

/**
 * El rectángulo más grande de `hueco` que no tapa nada abierto, o `null` si deja menos de la mitad.
 * Un globo que asoma por un borde encoge la capa en vez de esconderla.
 */
export function huecoLibre(hueco: Hueco): Hueco | null {
  let libres = [hueco];
  for (const z of zonasEncima()) libres = libres.flatMap((h) => (seCruzan(h, z) ? alrededor(h, z) : [h]));
  const mayor = libres.reduce<Hueco | null>((m, h) => (!m || area(h) > area(m) ? h : m), null);
  return mayor && area(mayor) * 2 >= area(hueco) ? mayor : null;
}

let observando: MutationObserver | null = null;
let dentro: MutationObserver | null = null;
let pedida = 0;

/** Etiquetas que están en `<body>` y no ocupan un píxel. */
const PINTAN_NADA = new Set([
  "SCRIPT",
  "LINK",
  "STYLE",
  "TEMPLATE",
  "META",
  "NOSCRIPT",
  "TITLE",
]);

const portales = () =>
  Array.from(document.body.children).filter((el) => el.id !== "root" && !PINTAN_NADA.has(el.tagName));

/** El envoltorio de un portal mide 0×0 y lo que pinta va `fixed` dentro: se baja hasta lo que ocupa algo. */
function rectangulos(el: Element): Hueco[] {
  const r = el.getBoundingClientRect();
  if (r.width > 0 && r.height > 0) return [{ x: r.x, y: r.y, width: r.width, height: r.height }];
  return Array.from(el.children).flatMap(rectangulos);
}

const medirZonas = () => setZonas(portales().flatMap(rectangulos));

function pedirMedida() {
  if (pedida || typeof requestAnimationFrame === "undefined") return;
  pedida = requestAnimationFrame(() => {
    pedida = 0;
    medirZonas();
  });
}

function encender() {
  if (observando || typeof MutationObserver === "undefined") return;
  dentro = new MutationObserver(pedirMedida);
  const mirar = () => {
    dentro?.disconnect();
    for (const el of portales()) {
      dentro?.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class"] });
    }
    // Ya, para esconder antes de que la capa pinte encima; y otra vez cuando el portal se haya colocado.
    medirZonas();
    pedirMedida();
  };
  observando = new MutationObserver(mirar);
  observando.observe(document.body, { childList: true });
  if (typeof window !== "undefined") window.addEventListener("resize", pedirMedida);
  mirar();
}

/**
 * Llama a `cuando` con el hueco de `el`, ahora y cada vez que cambie.
 *
 * Devuelve la baja, y además se da de baja sola con el componente que la montó
 * (`onCleanup`): una capa nativa que sobrevive a su pestaña se queda flotando
 * sobre la interfaz sin nada que la esconda.
 */
export function seguirHueco(el: HTMLElement, cuando: (h: Hueco) => void) {
  let pedido = 0;
  const medir = () => {
    pedido = 0;
    const r = el.getBoundingClientRect();
    cuando({ x: r.x, y: r.y, width: r.width, height: r.height });
  };
  const pedir = () => {
    if (pedido) return;
    pedido = requestAnimationFrame(medir);
  };

  // `ResizeObserver` no existe en jsdom, donde corre el guarda `mount-frontend`. Sin esta
  // pregunta, montar la app ahí lanzaría en el primer sitio abierto — que es
  // justo la clase de fallo que ese guarda existe para cazar, y no puede ser él
  // quien lo cause.
  const ro =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(pedir);
  ro?.observe(el);
  const mo = typeof MutationObserver === "undefined"
    ? null
    : new MutationObserver(pedir);
  for (let parent = el.parentElement; parent; parent = parent.parentElement) {
    mo?.observe(parent, {
      attributes: true,
      attributeFilter: ["style", "class", "data-ventana"],
    });
  }
  window.addEventListener("resize", pedir);
  const baja = () => {
    if (pedido) cancelAnimationFrame(pedido);
    ro?.disconnect();
    mo?.disconnect();
    window.removeEventListener("resize", pedir);
  };
  onCleanup(baja);
  medir();
  return baja;
}
