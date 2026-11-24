/**
 * Arrastrar una tarea del historial hasta un proyecto.
 *
 * **Va con eventos de puntero y NO con el arrastre de HTML5**, y eso es una
 * decisión de plataforma, no de gusto. La app depende del arrastre nativo del
 * webview para adjuntar archivos: `Chat.tsx` escucha `onDragDropEvent` de Tauri
 * porque el `drop` del webview entrega un `File` sin ruta en disco, y sin ruta
 * no hay nada que copiar a la carpeta de trabajo. Ese manejador exige
 * `dragDropEnabled` en `tauri.conf.json`, y con él encendido **WebView2 no
 * entrega los eventos de HTML5 al frontend**: un `draggable` funcionaría en
 * macOS y sería un renglón muerto en Windows, sin error y sin aviso. Los
 * eventos de puntero no pasan por esa cañería: los aplica el DOM igual en las
 * tres plataformas.
 *
 * **El teclado no depende de esto.** Mover una tarea sigue estando en el menú
 * de su fila (`Sessions.tsx`); el arrastre es el atajo, no el camino.
 *
 * **Las dos mitades se hablan por el DOM.** Quien se arrastra y quien recibe son
 * componentes sin relación de props —la fila vive en `Sessions.tsx` y el
 * proyecto en `Sidebar.tsx`—, así que **el destino se marca con
 * `data-destino="<id de proyecto>"`** y aquí se resuelve con `elementFromPoint`.
 * Pasarlo por props obligaría a que el sidebar supiera de antemano qué fila se
 * está arrastrando, que es lo que no se sabe hasta que ocurre.
 *
 * `data-destino=""` es legítimo: la cadena vacía es como el backend nombra a
 * «sin proyecto» (`sessions::move_session`), así que la fila de «Recientes» la
 * lleva vacía y `dataset.destino` la devuelve tal cual.
 */
import { createSignal } from "solid-js";

/** La tarea que va en la mano. */
export type Arrastrada = {
  id: string;
  /** De qué proyecto sale. `""` es «no está en ninguno». */
  de: string;
  titulo: string;
};

const [enVuelo, setEnVuelo] = createSignal<Arrastrada | null>(null);
const [destino, setDestino] = createSignal<string | null>(null);
const [punto, setPunto] = createSignal<{ x: number; y: number }>({ x: 0, y: 0 });

/** Qué tarea se está arrastrando ahora mismo, si alguna. */
export const tareaEnVuelo = enVuelo;
/** Sobre qué proyecto está el puntero, cuando soltarlo movería algo. */
export const destinoEnVuelo = destino;
/** Dónde está el puntero, para pintar lo que lo sigue. */
export const puntoDelArrastre = punto;

/**
 * Cuántos píxeles hay que recorrer antes de que esto deje de ser un clic.
 *
 * **Sin umbral no se puede abrir una tarea**: el temblor de la mano entre
 * `pointerdown` y `pointerup` empieza un arrastre, y entonces el clic que abre
 * la conversación se cancela. Cinco píxeles es lo que usa el arrastre nativo de
 * los navegadores.
 */
const UMBRAL = 5;

/** A qué distancia del borde del panel el arrastre lo desplaza, y cuánto. */
const MARGEN = 36;
const PASO = 10;

/**
 * Si el gesto que acaba de terminar fue un arrastre.
 *
 * La fila abre la conversación con `click`, y el navegador lo dispara igual
 * después de soltar. Sin esta marca, mover una tarea a otro proyecto abriría
 * además la tarea movida.
 */
let recien = false;
export const fueArrastre = () => recien;

function bajoElPuntero(x: number, y: number, de: string): string | null {
  const el = document.elementFromPoint(x, y);
  const destino = el?.closest<HTMLElement>("[data-destino]");
  if (!destino) return null;
  const id = destino.dataset.destino ?? "";
  // Su propio grupo no es destino: soltar ahí no movería nada, y encenderlo
  // prometería un cambio que no ocurre.
  return id === de ? null : id;
}

/**
 * Empieza a arrastrar `tarea`. Se llama desde `pointerdown` de la fila.
 *
 * `soltar` recibe el id del proyecto de destino, y solo se llama si el puntero
 * terminó sobre uno distinto del suyo.
 */
export function arrastrar(
  inicio: PointerEvent,
  tarea: Arrastrada,
  soltar: (destino: string) => void,
) {
  // Solo el botón principal: con el secundario el menú contextual del sistema
  // se come el `pointerup` y la tarea se queda pegada al puntero.
  if (inicio.button !== 0) return;

  const x0 = inicio.clientX;
  const y0 = inicio.clientY;
  let activo = false;
  let cuadro = 0;
  const cursorAnterior = document.body.style.cursor;
  const seleccionAnterior = document.body.style.userSelect;

  const limpiar = () => {
    window.removeEventListener("pointermove", mover);
    window.removeEventListener("pointerup", soltarlo);
    window.removeEventListener("pointercancel", cancelar);
    window.removeEventListener("keydown", alTeclear, true);
    cancelAnimationFrame(cuadro);
    setEnVuelo(null);
    setDestino(null);
    if (activo) {
      document.body.style.cursor = cursorAnterior;
      document.body.style.userSelect = seleccionAnterior;
    }
  };

  /**
   * Desplaza la lista cuando el puntero llega a sus bordes.
   *
   * **Va en un bucle de animación y no en `pointermove`**: con el puntero
   * quieto sobre el borde no llegan más eventos, así que la lista se pararía a
   * un proyecto de distancia del que se quería alcanzar.
   */
  const desplazar = () => {
    cuadro = requestAnimationFrame(desplazar);
    if (!activo) return;
    const { y } = punto();
    const panel = document
      .elementFromPoint(punto().x, y)
      ?.closest<HTMLElement>("[data-arrastre-scroll]");
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    if (y < r.top + MARGEN) panel.scrollTop -= PASO;
    else if (y > r.bottom - MARGEN) panel.scrollTop += PASO;
  };

  const mover = (e: PointerEvent) => {
    if (!activo) {
      if (Math.hypot(e.clientX - x0, e.clientY - y0) < UMBRAL) return;
      activo = true;
      setEnVuelo(tarea);
      // El cursor y la supresión de la selección van en el `body`: el puntero
      // sale de la fila en cuanto empieza el gesto.
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      cuadro = requestAnimationFrame(desplazar);
    }
    setPunto({ x: e.clientX, y: e.clientY });
    setDestino(bajoElPuntero(e.clientX, e.clientY, tarea.de));
  };

  const soltarlo = (e: PointerEvent) => {
    const eraArrastre = activo;
    const a = activo ? bajoElPuntero(e.clientX, e.clientY, tarea.de) : null;
    limpiar();
    if (!eraArrastre) return;
    // Se marca aunque no haya destino: el gesto no era un clic, así que la
    // tarea tampoco debe abrirse cuando se suelta en el vacío.
    recien = true;
    setTimeout(() => (recien = false));
    if (a !== null) soltar(a);
  };

  const cancelar = () => {
    const eraArrastre = activo;
    limpiar();
    if (eraArrastre) {
      recien = true;
      setTimeout(() => (recien = false));
    }
  };

  // Escape suelta la tarea donde estaba. Va en captura para que no lo consuma
  // antes quien cierre paneles con la misma tecla.
  const alTeclear = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !activo) return;
    e.stopPropagation();
    cancelar();
  };

  window.addEventListener("pointermove", mover);
  window.addEventListener("pointerup", soltarlo);
  window.addEventListener("pointercancel", cancelar);
  window.addEventListener("keydown", alTeclear, true);
}
