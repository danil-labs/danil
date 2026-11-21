import { createEffect, createMemo, createSignal, onCleanup, type JSX } from "solid-js";

/**
 * Lo que envuelve no puede encoger mientras `vivo`; al terminar, se suelta.
 *
 * El markdown de una respuesta se re-parsea con cada token y no crece de forma
 * monótona: `**neg` se pinta literal y al cerrarse en `**negrita**` la línea se
 * re-envuelve y el bloque encoge. Con el hilo pegado al final, el texto ya
 * leído salta — y el scroll no lo arregla: medido, pegar al borde añadió
 * 608 px de movimiento en 240 cuadros. Aquí se quita el ruido en origen: el
 * bloque conserva el alto máximo alcanzado mientras el turno vive.
 *
 * Se suelta en cuanto `vivo` es falso: el texto ya está completo, mínimo y alto
 * real coinciden y soltarlo no mueve nada. Sin soltar, un turno terminado se
 * queda con un mínimo de más para siempre.
 *
 * Dos elementos, y hacen falta los dos: el de fuera lleva el `min-height` y el
 * de dentro se mide. En uno solo, escribir el mínimo cambia el alto observado y
 * el observador se re-dispara por su propia escritura.
 *
 * El guarda de existencia es por los dos entornos sin layout de este repo:
 * `node --test` y el jsdom de `scripts/guards/mount-frontend.mjs` no implementan
 * `ResizeObserver`.
 */
export function AltoMonotono(props: { vivo: boolean; children: JSX.Element; searchBlock?: number }) {
  const [minimo, setMinimo] = createSignal(0);
  // El observador la lee sin dueño: leída directo, una prop con condición dejaría un memo vivo por medida.
  const vivo = createMemo(() => props.vivo);

  const medir = (el: HTMLElement) => {
    if (typeof ResizeObserver === "undefined") return;
    let anchoPrevio: number | undefined;
    const ojo = new ResizeObserver(([entrada]) => {
      const { width: ancho, height: alto } = entrada.contentRect;
      // Con otro ancho el texto se re-envuelve de verdad y el máximo anterior no
      // vale: minimizada en Windows la ventana mide 144 px, y conservarlo deja
      // miles de píxeles en blanco al restaurar.
      const otroAncho = anchoPrevio !== undefined && ancho !== anchoPrevio;
      anchoPrevio = ancho;
      // `vivo` se lee aquí dentro y no se captura: el observador es uno
      // solo para toda la vida del componente, y el turno se cierra mientras
      // sigue mirando.
      setMinimo((previo) => (!vivo() ? 0 : otroAncho ? alto : Math.max(previo, alto)));
    });
    ojo.observe(el);
    onCleanup(() => ojo.disconnect());
  };

  // Soltar al cerrarse el turno no puede esperar a la siguiente medida: si el
  // bloque ya no cambia de alto, el observador no vuelve a hablar nunca.
  createEffect(() => {
    if (!vivo()) setMinimo(0);
  });

  return (
    <div style={minimo() ? { "min-height": `${minimo()}px` } : undefined}>
      <div ref={medir} data-thread-search-text={props.searchBlock}>{props.children}</div>
    </div>
  );
}
