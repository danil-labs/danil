// Por debajo de este ancho no caben los selectores del compositor en una línea.
export const MIN_PANEL_WIDTH = 320;

// El mínimo suma tira, compositor y transcripción; falta comprobarlo en una rejilla 2×2 real.
export const MIN_PANEL_HEIGHT = 240;

export const MAX_COLUMNS = 1;
export const MAX_ROWS = 1;

export type PanelGroup = {
  pestanas: string[];
  activa: string | null;
};

export type PanelSite = { col: number; fila: number };

export type Side = "left" | "right" | "up" | "down";

export const emptyGroup = (): PanelGroup => ({ pestanas: [], activa: null });

// El contenido se restaura desde lib/tabs.ts; duplicarlo aquí haría divergir las pestañas.
export type Layout = {
  columnas: PanelGroup[][];
  anchos: number[];
  altos: number[];
  activo: PanelSite;
};
