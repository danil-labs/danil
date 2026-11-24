/**
 * Cuánto se agranda la letra de la ventana: ⌘+ / ⌘− / ⌘0, Ctrl en Windows.
 *
 * Escala la raíz del documento. La siguen los `rem` de Tailwind —tipografía,
 * alturas, separaciones— y no la sigue lo escrito en px, que es lo que mantiene
 * la reserva del semáforo de macOS donde el sistema la puso (`lib/window.ts`).
 *
 * Se aplica antes de montar, como el tema: leída después, la ventana abre al
 * 100 % y cambia de tamaño delante de quien mira.
 */
import { createPref } from "../../../session/src/prefs.ts";

/** Los saltos. ⌘0 vuelve al 1 exacto: sumar y restar deja resto. */
const PASOS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;

const [escala, guardar] = createPref("ui.scale", 1);


function fijar(valor: number) {
  guardar(valor);
  document.documentElement.style.setProperty("--escala-ui", String(valor));
}

/** Pinta la escala guardada. La llama el arranque, antes del primer pintado. */
export function aplicarEscala() {
  fijar(PASOS.includes(escala() as (typeof PASOS)[number]) ? escala() : 1);
}

function mover(pasos: number) {
  const guardada = PASOS.indexOf(escala() as (typeof PASOS)[number]);
  // Una escala fuera de la lista arranca desde el 100 %: `indexOf` da -1 y
  // sumarle 1 saltaría al primer paso.
  const desde = guardada === -1 ? PASOS.indexOf(1) : guardada;
  fijar(PASOS[Math.min(Math.max(desde + pasos, 0), PASOS.length - 1)]);
}

function agrandar() {
  mover(1);
}

function achicar() {
  mover(-1);
}

function escalaNormal() {
  fijar(1);
}

export function atajoDeEscala(e: KeyboardEvent) {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.defaultPrevented) return;
  const tecla = e.key;
  if (tecla === "+" || tecla === "=" || e.code === "NumpadAdd") {
    e.preventDefault();
    agrandar();
  } else if (tecla === "-" || tecla === "_" || e.code === "NumpadSubtract") {
    e.preventDefault();
    achicar();
  } else if (tecla === "0") {
    e.preventDefault();
    escalaNormal();
  }
}
