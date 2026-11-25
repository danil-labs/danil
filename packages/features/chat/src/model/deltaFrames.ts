/**
 * Junta los fragmentos de respuesta que llegan entre dos cuadros y los aplica
 * de una vez: un turno rápido manda decenas de deltas por cuadro, y aplicar
 * cada uno copia el hilo, recalcula sus memos y toca el DOM sin que nadie
 * alcance a ver el paso intermedio.
 */

import type { Author } from "./messageTypes.ts";
import type { Delta } from "./transcript.ts";

export type StreamChunk =
  | ({ kind: "delta" } & Delta)
  | { kind: "reasoning"; text: string; messageId?: string; segmentId?: string; author: Author | null };

type Lote = { session: string; workspace: string | undefined; chunks: StreamChunk[] };

/** Pide `run` para el próximo cuadro y devuelve con qué cancelarlo. */
export type Programar = (run: () => void) => () => void;

/**
 * El próximo cuadro, o un reloj si no va a haberlo: `requestAnimationFrame`
 * no corre con la ventana oculta, y el reloj de respaldo cubre la que se oculta
 * con el cuadro ya pedido.
 */
const porCuadro: Programar = (run) => {
  const visible = typeof requestAnimationFrame === "function" && document.visibilityState !== "hidden";
  const cuadro = visible ? requestAnimationFrame(run) : null;
  const reloj = setTimeout(run, visible ? 1000 : 50);
  return () => {
    if (cuadro !== null) cancelAnimationFrame(cuadro);
    clearTimeout(reloj);
  };
};

/**
 * `meter` guarda un fragmento (`delta` o `reasoning`); `vaciar` aplica lo guardado ya.
 * Quien vaya a tocar un hilo por otro camino vacía antes, o el orden de lo que se pinta cambia.
 */
export function lotesDeDeltas(
  aplicar: (session: string, workspace: string | undefined, chunks: StreamChunk[]) => void,
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
    for (const l of lotes) aplicar(l.session, l.workspace, l.chunks);
  };
  return {
    meter(session: string, workspace: string | undefined, chunk: StreamChunk | Delta) {
      const normalized: StreamChunk = "kind" in chunk ? chunk : { kind: "delta", ...chunk };
      const clave = `${workspace ?? ""}\u0000${session}`;
      const lote = pendientes.get(clave);
      if (lote) lote.chunks.push(normalized);
      else pendientes.set(clave, { session, workspace, chunks: [normalized] });
      cancelar ??= programar(vaciar);
    },
    vaciar,
  };
}
