/**
 * Cajas que el compositor reserva antes de tener la ruta.
 * Cada una ocupa el índice en el que va a aterrizar el archivo. Cuando la
 * lista llega a ese índice, la caja se apaga en el mismo pintado: no hay un
 * segundo cuadro al lado del archivo que acaba de aparecer.
 */

export type FormaDeCaja = "imagen" | "archivo";

export type CajaEnCamino = {
  id: number;
  forma: FormaDeCaja;
  /** Índice que ocupará el archivo cuando entre en la lista. */
  orden: number;
  cancelada: boolean;
};

export function reservar(
  cajas: CajaEnCamino[],
  formas: FormaDeCaja[],
  yaEnLaCaja: number,
  siguienteId: () => number,
): { cajas: CajaEnCamino[]; ids: number[] } {
  const quedan = cajas.filter((c) => c.cancelada || yaEnLaCaja <= c.orden);
  const esperando = quedan.filter((c) => yaEnLaCaja <= c.orden).length;
  const inicio = yaEnLaCaja + esperando;
  const ids: number[] = [];
  const nuevas = formas.map((forma, i) => {
    const id = siguienteId();
    ids.push(id);
    return { id, forma, orden: inicio + i, cancelada: false };
  });
  return { cajas: [...quedan, ...nuevas], ids };
}

/** Las que todavía no tienen archivo en la lista. Una cancelada no se pinta. */
export function visibles(cajas: CajaEnCamino[], yaEnLaCaja: number): CajaEnCamino[] {
  return cajas.filter((c) => !c.cancelada && yaEnLaCaja <= c.orden);
}

export function cancelar(cajas: CajaEnCamino[], id: number): CajaEnCamino[] {
  return cajas.map((c) => (c.id === id ? { ...c, cancelada: true } : c));
}

/** Índices de este vuelo que la persona quitó antes de que el archivo entrara. */
export function ordenesCanceladas(cajas: CajaEnCamino[], ids: number[]): number[] {
  const mias = new Set(ids);
  return cajas.filter((c) => mias.has(c.id) && c.cancelada).map((c) => c.orden);
}

/**
 * Cierra el vuelo. `noLlegaron` son las que no se quedaron en la lista: las
 * cajas posteriores bajan su índice esa cantidad.
 */
export function cerrar(cajas: CajaEnCamino[], ids: number[], noLlegaron: number): CajaEnCamino[] {
  const mias = new Set(ids);
  const tope = cajas.reduce((max, c) => (mias.has(c.id) ? Math.max(max, c.orden) : max), -1);
  return cajas.flatMap((c) => {
    if (mias.has(c.id)) return [];
    if (noLlegaron > 0 && c.orden > tope) return [{ ...c, orden: c.orden - noLlegaron }];
    return [c];
  });
}
