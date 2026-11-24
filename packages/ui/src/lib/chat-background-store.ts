import { createSignal } from "solid-js";
import { createPref } from "../../../session/src/prefs.ts";
import {
  fondoDe,
  VELO_DE_FONDO,
  VELO_DE_PESTANAS,
  VELO_DE_PESTANAS_MAX,
  VELO_DE_PESTANAS_MIN,
  VELO_DE_PANELES,
  VELO_DE_PANELES_MAX,
  VELO_DE_PANELES_MIN,
  type FondoDeChat,
} from "./chat-background.ts";

/**
 * Lo que pinta la ventana: el fondo y los velos elegidos, y la imagen del
 * workspace abierto. Guardarlos en el motor y leerlos al cambiar de workspace
 * es de `chat-background-engine.ts`, fuera de la carga inicial.
 */
const [guardado, setGuardado] = createPref<string>("chat-background", "neutro");
const [rutaPropia, setRutaPropia] = createPref<string | null>("chat-background-custom", null);
/** El workspace donde el motor copió `rutaPropia`: la copia de otro no se pinta ni se manda. `null`, de antes de los fondos por workspace. */
const [rutaDelWorkspace, setRutaDelWorkspace] = createPref<string | null>("chat-background-custom-workspace", null);
const [veloGuardado, setVeloGuardado] = createPref<number>("chat-background-veil", VELO_DE_FONDO);
const [veloDePestanasGuardado, setVeloDePestanasGuardado] = createPref<number>("tabs-veil", VELO_DE_PESTANAS);
const [veloDePanelesGuardado, setVeloDePanelesGuardado] = createPref<number>("panels-veil", VELO_DE_PANELES);
/** La imagen propia del workspace abierto, como `data:` URI, tal como la devuelve su motor. */
const [imagenDelWorkspace, setImagenDelWorkspace] = createSignal<string | null>(null);
/** El workspace abierto, según la última lectura de su fondo; `null` hasta la primera. */
const [workspaceAbierto, setWorkspaceAbierto] = createSignal<string | null>(null);

export { imagenDelWorkspace, setImagenDelWorkspace, workspaceAbierto, setWorkspaceAbierto };

function acotarVeloDePestanas(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor)
    ? Math.min(VELO_DE_PESTANAS_MAX, Math.max(VELO_DE_PESTANAS_MIN, valor))
    : VELO_DE_PESTANAS;
}

export function veloDePestanas(): number {
  return acotarVeloDePestanas(veloDePestanasGuardado());
}

export function elegirVeloDePestanas(valor: number): number {
  const siguiente = acotarVeloDePestanas(valor);
  setVeloDePestanasGuardado(siguiente);
  aplicarVeloDePestanas();
  return siguiente;
}

/** Pinta los velos guardados (pestañas y paneles). La llama el arranque, antes del primer pintado. */
export function aplicarVeloDePestanas() {
  document.documentElement.style.setProperty("--tab-veil", String(veloDePestanas()));
  document.documentElement.style.setProperty("--panel-veil", String(veloDePaneles()));
}

export function veloDePaneles(): number {
  const valor = veloDePanelesGuardado();
  return typeof valor === "number" && Number.isFinite(valor)
    ? Math.min(VELO_DE_PANELES_MAX, Math.max(VELO_DE_PANELES_MIN, valor))
    : VELO_DE_PANELES;
}

export function elegirVeloDePaneles(valor: number): number {
  setVeloDePanelesGuardado(Number.isFinite(valor) ? valor : VELO_DE_PANELES);
  aplicarVeloDePestanas();
  return veloDePaneles();
}

export function veloDeFondo(): number {
  const valor = veloGuardado();
  return typeof valor === "number" && Number.isFinite(valor)
    ? Math.min(1, Math.max(0, valor))
    : VELO_DE_FONDO;
}

export function elegirVeloDeFondo(valor: number): number {
  const siguiente = Number.isFinite(valor) ? Math.min(1, Math.max(0, valor)) : VELO_DE_FONDO;
  setVeloGuardado(siguiente);
  return siguiente;
}

export function fondoDeChat(): FondoDeChat {
  const fondo = fondoDe(guardado());
  return fondo === "propia" && !fondoPropio() && !imagenDelWorkspace() ? "neutro" : fondo;
}

export function elegirFondoDeChat(id: string): FondoDeChat {
  const siguiente = fondoDe(id);
  setGuardado(siguiente === "propia" && !fondoPropio() && !imagenDelWorkspace() ? "neutro" : siguiente);
  return fondoDeChat();
}

/** La copia de la imagen propia del workspace abierto, si se subió ahí. Vive en disco; aquí solo su ruta. */
export function fondoPropio(): string | null {
  return rutaDelWorkspace() === workspaceAbierto() ? rutaPropia() : null;
}

/** La copia que hizo el motor de la imagen elegida, en el workspace abierto, o `null` para quitarla. */
export function ponerFondoPropio(copia: string | null): FondoDeChat {
  setRutaPropia(copia);
  setRutaDelWorkspace(copia ? workspaceAbierto() : null);
  setImagenDelWorkspace(null);
  setGuardado(copia ? "propia" : "neutro");
  return fondoDeChat();
}

/** La copia guardada aquí ya no vale (es de otro workspace, o el motor ya no la tiene). */
export function olvidarFondoPropio() {
  setRutaPropia(null);
  setRutaDelWorkspace(null);
}
