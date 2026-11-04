/**
 * Anchos de columna de una tabla markdown, como el `table-layout: auto` de un
 * navegador: cada columna pide lo que mide su celda más larga y no baja de su
 * palabra más larga. Si todo cabe en `available`, cada columna toma lo suyo; si
 * no, el espacio se reparte en proporción a lo que a cada una le falta, y solo
 * cuando ni los mínimos caben la tabla se desplaza de lado.
 *
 * React Native no tiene tablas: sin un ancho común por columna, cada fila mide
 * sus celdas por su cuenta y las columnas no se alinean.
 */
export type ColumnText = { header: string; cells: string[] };

const MIN = 56;
const MIN_CAP = 150;
const MAX = 480;

export function columnWidths(columns: ColumnText[], available: number, size: number, pad: number): number[] {
  const char = size * 0.6;
  const measure = (text: string, bold: boolean) => Math.ceil(plain(text).length * char * (bold ? 1.1 : 1)) + pad;
  const word = (text: string, bold: boolean) =>
    Math.max(0, ...plain(text).split(/\s+/).map((w) => w.length)) * char * (bold ? 1.1 : 1) + pad;
  const mins = columns.map((c) =>
    clamp(Math.ceil(Math.max(word(c.header, true), ...c.cells.map((t) => word(t, false)))), MIN, MIN_CAP),
  );
  const wants = columns.map((c, i) =>
    clamp(Math.max(measure(c.header, true), ...c.cells.map((t) => measure(t, false))), mins[i], MAX),
  );
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  if (sum(wants) <= available) return wants;
  const room = available - sum(mins);
  if (room <= 0) return mins;
  const short = sum(wants) - sum(mins);
  return mins.map((m, i) => Math.floor(m + (room * (wants[i] - m)) / short));
}

/** El texto que se ve: sin las marcas de énfasis, código ni enlaces. */
function plain(text: string): string {
  return text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`~]/g, "");
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
