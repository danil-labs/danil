import { isMac } from "../../../host/src/window.ts";

const ATAJOS = {
  findInTask: { mac: "⌘F", windows: "Ctrl+F", ariaMac: "Meta+F", ariaWindows: "Control+F" },
  search: { mac: "⌘K", windows: "Ctrl+K", ariaMac: "Meta+K", ariaWindows: "Control+K" },
  sidebar: { mac: "⌘B", windows: "Ctrl+B", ariaMac: "Meta+B", ariaWindows: "Control+B" },
  workTree: { mac: "⌘⌥B", windows: "Ctrl+Alt+B", ariaMac: "Meta+Alt+B", ariaWindows: "Control+Alt+B" },
  newTask: { mac: "⌘T", windows: "Ctrl+T", ariaMac: "Meta+T", ariaWindows: "Control+T" },
  closeTab: { mac: "⌘W", windows: "Ctrl+W", ariaMac: "Meta+W", ariaWindows: "Control+W" },
  reopenTab: { mac: "⌘⇧T", windows: "Ctrl+Shift+T", ariaMac: "Meta+Shift+T", ariaWindows: "Control+Shift+T" },
  // Solo rótulo: lo atiende el editor (`CodeEditor.tsx`, `Mod-s`).
  saveFile: { mac: "⌘S", windows: "Ctrl+S", ariaMac: "Meta+S", ariaWindows: "Control+S" },
  // Solo rótulos: los atiende la tarjeta de preguntas, no `accionDeAtajo`.
  advanceQuestion: { mac: "⌘↵", windows: "Ctrl+↵", ariaMac: "Meta+Enter", ariaWindows: "Control+Enter" },
  skipQuestion: { mac: "Esc", windows: "Esc", ariaMac: "Escape", ariaWindows: "Escape" },
  // Solo rótulo: lo atiende la caja (`Chat.tsx`), antes que detener el turno.
  closeSideQuestion: { mac: "Esc", windows: "Esc", ariaMac: "Escape", ariaWindows: "Escape" },
} as const;

export type AccionDeAtajo = keyof typeof ATAJOS;
export const textoDeAtajo = (accion: AccionDeAtajo) =>
  ATAJOS[accion][isMac() ? "mac" : "windows"];
export const ariaDeAtajo = (accion: AccionDeAtajo) =>
  ATAJOS[accion][isMac() ? "ariaMac" : "ariaWindows"];

export function accionDeAtajo(e: KeyboardEvent): AccionDeAtajo | null {
  if (!(e.metaKey || e.ctrlKey) || e.defaultPrevented) return null;
  const tecla = e.key.toLowerCase();
  if (e.shiftKey) return !e.altKey && tecla === "t" ? "reopenTab" : null;
  // Option puede producir «∫» en macOS: con Alt se reconoce la tecla física.
  if (e.altKey) return tecla === "b" || e.code === "KeyB" ? "workTree" : null;
  if (tecla === "b") return "sidebar";
  if (tecla === "k") return "search";
  if (tecla === "t") return "newTask";
  if (tecla === "w") return "closeTab";
  return null;
}

/**
 * Ir a otra pestaña de la ventana activa, al estilo del navegador.
 *
 * Vive fuera de `ATAJOS`, que es el catálogo de rótulos: estas nueve teclas y
 * dos flechas no se pintan en ninguno.
 */
export type NavegacionDePestanas =
  | { tipo: "indice"; n: number }
  | { tipo: "ultima" }
  | { tipo: "ciclo"; delta: 1 | -1 };

export function navegacionDePestanas(
  e: KeyboardEvent,
): NavegacionDePestanas | null {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.defaultPrevented) return null;
  if (e.altKey) {
    if (e.key === "ArrowRight") return { tipo: "ciclo", delta: 1 };
    if (e.key === "ArrowLeft") return { tipo: "ciclo", delta: -1 };
    return null;
  }
  if (e.key === "PageDown") return { tipo: "ciclo", delta: 1 };
  if (e.key === "PageUp") return { tipo: "ciclo", delta: -1 };
  // La tecla física, no la que escribe: en AZERTY el 1 pide Shift y `key`
  // daría «&», dejando la app sin atajo en ese teclado.
  const digito = /^Digit([1-9])$/.exec(e.code);
  if (!digito) return null;
  const n = Number(digito[1]);
  return n === 9 ? { tipo: "ultima" } : { tipo: "indice", n: n - 1 };
}

/**
 * La ventana siguiente o la anterior del recorrido, o `null`.
 *
 * Horizontal recorre la tira y vertical recorre las ventanas: son el mismo
 * gesto sobre las dos cosas que se apilan en el espacio principal.
 */
export function ventanaVecina(e: KeyboardEvent): 1 | -1 | null {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || !e.altKey) return null;
  if (e.defaultPrevented) return null;
  if (e.key === "ArrowDown") return 1;
  if (e.key === "ArrowUp") return -1;
  return null;
}

/**
 * Una flecha con modificador es un atajo de la app, no navegación de lista.
 *
 * Lo preguntan los `tablist` y las diapositivas: sin esto, `⌘⌥→` pasa de
 * pestaña y además adelanta la presentación que haya abierta.
 */
export const flechaDeLista = (e: KeyboardEvent) =>
  !e.metaKey && !e.ctrlKey && !e.altKey;

/**
 * Qué pestaña queda delante, sobre la tira de una sola ventana.
 *
 * `null` cuando el número no cae en ninguna: con cuatro pestañas, la quinta
 * no hace nada en vez de saltar a la última.
 */
export function destinoDePestana(
  nav: NavegacionDePestanas,
  tira: readonly string[],
  activa: string | null,
): string | null {
  if (tira.length === 0) return null;
  if (nav.tipo === "ultima") return tira[tira.length - 1];
  if (nav.tipo === "indice") return tira[nav.n] ?? null;
  const i = activa === null ? -1 : tira.indexOf(activa);
  // Sin nada delante —una tarea nueva— el ciclo entra por el extremo que
  // le toca a su sentido.
  const desde = i < 0 ? (nav.delta > 0 ? -1 : 0) : i;
  return tira[(desde + nav.delta + tira.length) % tira.length];
}
