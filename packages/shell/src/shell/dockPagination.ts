import type { DockAgent } from "./dockLayout";

export const DOCK_PAGE_SIZE = 5;
/** Lado fijo de cada agente y hueco entre ellos. El ancho que sobra no se reparte. */
export const DOCK_CELL = 40;
export const DOCK_CELL_GAP = 4;

/**
 * Cuántos agentes de `DOCK_CELL` caben en `width` sin estirar el hueco.
 * Sin medida todavía se asumen los cinco de siempre, para no parpadear.
 */
export function dockColumns(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return DOCK_PAGE_SIZE;
  return Math.max(1, Math.floor((width + DOCK_CELL_GAP) / (DOCK_CELL + DOCK_CELL_GAP)));
}

/** Página acotada al catálogo actual, incluso si desaparece su última fila. */
export function pageDock<T extends DockAgent>(ordered: readonly T[], requested: number, pageSize = DOCK_PAGE_SIZE) {
  const size = Math.max(1, Math.trunc(pageSize) || DOCK_PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(ordered.length / size));
  const page = Math.max(0, Math.min(pages - 1, Math.trunc(requested)));
  const start = page * size;
  const end = start + size;
  return {
    page,
    pages,
    shown: ordered.slice(start, end),
    workingBefore: ordered.slice(0, start).some(agent => agent.status === "working"),
    workingAfter: ordered.slice(end).some(agent => agent.status === "working"),
  };
}
