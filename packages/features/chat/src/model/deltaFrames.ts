/**
 * Junta los fragmentos de respuesta que llegan entre dos cuadros y los aplica
 * de una vez: un turno rápido manda decenas de deltas por cuadro, y aplicar
 * cada uno copia el hilo, recalcula sus memos y toca el DOM sin que nadie
 * alcance a ver el paso intermedio.
 */

import type { Delta } from "./transcript.ts";

type Lote = { session: string; workspace: string | undefined; deltas: Delta[] };

/** Pide `run` para el próximo cuadro y devuelve con qué cancelarlo. */
export type Programar = (run: () => void) => () => void;

/**
 * El próximo cuadro, o un reloj si no va a haberlo: `requestAnimationFrame`
 * no corre con la ventana oculta, y el reloj de respaldo cubre la que se oculta
 * con el cuadro ya pedido.
 */
export const porCuadro: Programar = (run) => {
  const visible = typeof requestAnimationFrame === "function" && document.visibilityState !== "hidden";
  const cuadro = visible ? requestAnimationFrame(run) : null;
  const reloj = setTimeout(run, visible ? 1000 : 50);
  return () => {
    if (cuadro !== null) cancelAnimationFrame(cuadro);
    clearTimeout(reloj);
  };
};

/**
 * `meter` guarda un delta; `vaciar` aplica lo guardado ya. Quien vaya a tocar
 * un hilo por otro camino vacía antes, o el orden de lo que se pinta cambia.
 */
export function lotesDeDeltas(
  aplicar: (session: string, workspace: string | undefined, deltas: Delta[]) => void,
  programar: Programar = porCuadro,
) {
  const pendientes = new Map<string, Lote>();
  let cancelar: (() => void) | null = null;
  const vaciar = () => {
    cancelar?.();
    cancelar = null;
    if (pendientes.size === 0) return;
    const lotes = [...pendientes.values()];
    pendientes.clear();
    for (const l of lotes) aplicar(l.session, l.workspace, l.deltas);
  };
  return {
    meter(session: string, workspace: string | undefined, delta: Delta) {
      const clave = `${workspace ?? ""}\u0000${session}`;
      const lote = pendientes.get(clave);
      if (lote) lote.deltas.push(delta);
      else pendientes.set(clave, { session, workspace, deltas: [delta] });
      cancelar ??= programar(vaciar);
    },
    vaciar,
  };
}
