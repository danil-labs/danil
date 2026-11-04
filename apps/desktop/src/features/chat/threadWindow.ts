/**
 * Qué tramos del hilo están montados. Un tramo son `CHUNK` bloques contados
 * desde el principio: su id no cambia cuando el hilo crece por el final, y
 * anteponer uno no mueve lo que ya está pintado. Abrir monta los dos últimos.
 */

export const CHUNK = 10;

// `origin` son los bloques antepuestos por páginas anteriores del historial: el tramo 0
// sigue empezando en el bloque que encabezaba, y los de antes tienen id negativo.

/** El primer tramo del hilo, a medias si `origin` no es múltiplo de `CHUNK`. */
export function headChunk(origin = 0): number {
  return Math.floor(-origin / CHUNK);
}

/** El bloque con que empieza lo montado desde el tramo `id`. */
export function chunkStart(id: number, origin = 0): number {
  return Math.max(0, id * CHUNK + origin);
}

export function chunkAt(block: number, origin = 0): number {
  return Math.floor((block - origin) / CHUNK);
}

/** El tramo en el que empieza lo montado al abrir un hilo de `total` bloques. */
export function tailChunk(total: number, origin = 0): number {
  return Math.max(headChunk(origin), chunkAt(total - 1, origin) - 1);
}

/** Los ids de tramo montados, del primero al último que tiene bloques. */
export function chunkIds(total: number, first: number, origin = 0): number[] {
  if (total <= 0) return [];
  const last = chunkAt(total - 1, origin);
  const ids: number[] = [];
  for (let id = Math.max(headChunk(origin), Math.min(first, last)); id <= last; id++) ids.push(id);
  return ids;
}

export function chunkOf<T>(blocks: T[], id: number, origin = 0): T[] {
  return blocks.slice(chunkStart(id, origin), Math.max(0, (id + 1) * CHUNK + origin));
}

/**
 * Dónde se quedó leyendo alguien: la clave del bloque y su distancia al borde de
 * arriba. Un índice de bloque cambia al plegarse un turno o al anteponer una página.
 */
export type Lectura = { clave: string; desfase: number };
