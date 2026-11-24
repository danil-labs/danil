import type { PanelGroup, PanelSite } from "./panels-types.ts";

export function geometry(ts: unknown, n: number): number[] {
  if (
    Array.isArray(ts) &&
    ts.length === n &&
    ts.every((t) => typeof t === "number" && Number.isFinite(t) && t > 0) &&
    Math.abs(ts.reduce((a, b) => a + b, 0) - 1) < 1e-6
  )
    return [...(ts as number[])];
  return Array.from({ length: n }, () => 1 / n);
}

export function siteIn(cols: PanelGroup[][], s: unknown): PanelSite | null {
  if (!s || typeof s !== "object") return null;
  const { col, fila: row } = s as PanelSite;
  return Number.isInteger(col) && Number.isInteger(row) && cols[col]?.[row]
    ? { col, fila: row }
    : null;
}

export const sameSite = (a: PanelSite | null, b: PanelSite | null) =>
  a !== null && b !== null && a.col === b.col && a.fila === b.fila;

// El tirador necesita área de agarre más ancha que el filete de 1 px.
const DIVIDER_WIDTH = 12;

export function panelReadingOrder(
  rowsPerColumn: readonly number[],
): PanelSite[] {
  const height = rowsPerColumn.reduce((n, f) => Math.max(n, f), 0);
  const out: PanelSite[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < rowsPerColumn.length; col++) {
      if (row < rowsPerColumn[col]) out.push({ col, fila: row });
    }
  }
  return out;
}

// Los divisores ocupan pistas propias; las fracciones reparten el espacio restante.
export function gridTracks(sizes: number[]) {
  return sizes
    .flatMap((t, i) => (i === 0 ? [`${t}fr`] : [`${DIVIDER_WIDTH}px`, `${t}fr`]))
    .join(" ");
}

// La última ventana llega al fondo de su columna aunque la vecina esté partida.
// Los valores CSS deben ser cadenas; números sin convertir dejan las celdas apiladas.
export function gridCell(site: PanelSite, columnRows: number) {
  const last = site.fila >= columnRows - 1;
  return {
    "grid-column": `${site.col * 2 + 1}`,
    "grid-row": last ? `${site.fila * 2 + 1} / -1` : `${site.fila * 2 + 1}`,
  };
}

// Con más de dos columnas haría falta un divisor por tramo para no cruzar columnas sin partir.
export function dividerSpan(
  i: number,
  vertical: boolean,
  rowsPerColumn: number[],
) {
  if (!vertical) return { "grid-column": `${i * 2 + 2}`, "grid-row": "1 / -1" };
  const splitColumns = rowsPerColumn
    .map((n, c) => (n > i + 1 ? c : -1))
    .filter((c) => c >= 0);
  const from = splitColumns.length ? splitColumns[0] : 0;
  const end = splitColumns.length
    ? splitColumns[splitColumns.length - 1]
    : rowsPerColumn.length - 1;
  return {
    "grid-row": `${i * 2 + 2}`,
    "grid-column": `${from * 2 + 1} / ${end * 2 + 2}`,
  };
}
