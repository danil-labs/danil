import { createEffect, createRoot, createSignal, on } from "solid-js";
import { invoke } from "../../../../engine-client/src/client.ts";
import { huecoLibre, moviendoHueco, zonasEncima, type Hueco } from "../../../../ui/src/lib/sites";

const claveDe = (session: string, arbol: string) => `${session}\n${arbol}`;

/** Lo que se añade a la página de Tinymist: el texto no cambia de color al pasar el ratón. */
const ESTILO_DE_LA_VISTA =
  "html .typst-text:hover, html .hover .typst-text { --glyph_fill: initial; --glyph_stroke: initial; }";

/**
 * La capa nativa de la vista de cada árbol. Es una sola y pasa de una pestaña a otra
 * sin volver a dibujarse: se coloca en el hueco del visor visible y se esconde si no hay ninguno.
 */
/** `cola`: las órdenes a la capa salen en fila; una vieja que llegara tarde la dejaría donde no va. */
type Capa = { label: string | null; puerto: number; cola: Promise<unknown>; ultima: string };
const capas = new Map<string, Capa>();
type Ocupante = { visible: boolean; hueco: Hueco };
const ocupantes = new Map<string, Map<number, Ocupante>>();
let siguienteOcupante = 0;
const [capasListas, setCapasListas] = createSignal<Record<string, boolean>>({});
const [zooms, setZooms] = createSignal<Record<string, number>>({});

export const capaLista = (session: string, arbol: string) => capasListas()[claveDe(session, arbol)] === true;
export const zoomDe = (session: string, arbol: string) => zooms()[claveDe(session, arbol)] ?? 1;

let reaccionando = false;
function reaccionar() {
  if (reaccionando) return;
  reaccionando = true;
  createRoot(() => createEffect(on([zonasEncima, moviendoHueco], () => capas.forEach((_, clave) => colocarCapa(clave)))));
}

// Cambiar de pestaña esconde un visor y enseña otro en el mismo cuadro: se junta todo y sale
// solo el estado final, sin esconder la capa por medio.
const porColocar = new Set<string>();
let cuadro = 0;
function colocarCapa(clave: string) {
  porColocar.add(clave);
  if (cuadro) return;
  cuadro = requestAnimationFrame(() => {
    cuadro = 0;
    const claves = [...porColocar];
    porColocar.clear();
    for (const c of claves) colocarAhora(c);
  });
}

function colocarAhora(clave: string) {
  const capa = capas.get(clave);
  if (!capa?.label) return;
  const label = capa.label;
  const visible = [...(ocupantes.get(clave)?.values() ?? [])].find((o) => o.visible && o.hueco.width >= 1);
  const libre = visible && !moviendoHueco() ? huecoLibre(visible.hueco) : null;
  const destino = libre ? JSON.stringify(libre) : "escondida";
  if (destino === capa.ultima) return;
  capa.ultima = destino;
  const orden = libre ? () => invoke("site_place", { label, ...libre }) : () => invoke("site_hide", { label });
  capa.cola = capa.cola.then(orden).catch(() => {});
}

function cerrarCapa(clave: string) {
  const capa = capas.get(clave);
  capas.delete(clave);
  setCapasListas(({ [clave]: _, ...resto }) => resto);
  if (capa?.label) void invoke("site_close", { label: capa.label }).catch(() => {});
}

export function ocuparCapa(session: string, arbol: string): number {
  reaccionar();
  const clave = claveDe(session, arbol);
  const id = ++siguienteOcupante;
  if (!ocupantes.has(clave)) ocupantes.set(clave, new Map());
  ocupantes.get(clave)?.set(id, { visible: false, hueco: { x: 0, y: 0, width: 0, height: 0 } });
  return id;
}

export function moverOcupante(session: string, arbol: string, id: number, ocupante: Ocupante) {
  const clave = claveDe(session, arbol);
  ocupantes.get(clave)?.set(id, ocupante);
  colocarCapa(clave);
}

export function desocuparCapa(session: string, arbol: string, id: number) {
  const clave = claveDe(session, arbol);
  ocupantes.get(clave)?.delete(id);
  colocarCapa(clave);
}

/** Abre la capa del árbol en `puerto`, o deja la que ya lo enseña. Otro puerto la rehace. */
export async function asegurarCapa(session: string, arbol: string, puerto: number, hueco: Hueco) {
  const clave = claveDe(session, arbol);
  const actual = capas.get(clave);
  if (actual?.puerto === puerto) return;
  if (actual) cerrarCapa(clave);
  const capa: Capa = { label: null, puerto, cola: Promise.resolve(), ultima: "" };
  capas.set(clave, capa);
  const s = await invoke<{ label: string }>("site_open_local", { port: puerto, css: ESTILO_DE_LA_VISTA, ...hueco });
  if (capas.get(clave) !== capa) return void invoke("site_close", { label: s.label }).catch(() => {});
  capa.label = s.label;
  setCapasListas((l) => ({ ...l, [clave]: true }));
  const zoom = zooms()[clave];
  if (zoom && zoom !== 1) void invoke("site_zoom", { label: s.label, factor: zoom }).catch(() => {});
  colocarCapa(clave);
}

export function cerrarCapaDe(session: string, arbol: string) {
  cerrarCapa(claveDe(session, arbol));
}

export function fijarZoom(session: string, arbol: string, zoom: number) {
  const clave = claveDe(session, arbol);
  setZooms((z) => ({ ...z, [clave]: zoom }));
  const label = capas.get(clave)?.label;
  if (label) void invoke("site_zoom", { label, factor: zoom }).catch(() => {});
}

/** La vista ocupa todo el archivo, por tarea: sigue así al cambiar de archivo. */
const [ampliadas, setAmpliadas] = createSignal<Record<string, boolean>>({});

export const ampliadaDe = (session: string, arbol: string) => ampliadas()[claveDe(session, arbol)] === true;

export function ampliarVista(session: string, arbol: string, ampliada: boolean) {
  setAmpliadas((a) => ({ ...a, [claveDe(session, arbol)]: ampliada }));
}

export { capas, cerrarCapa, claveDe };
