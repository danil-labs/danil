import { batch, type Setter } from "solid-js";
import { emptyGroup, MAX_COLUMNS, MAX_ROWS, type PanelGroup, type PanelSite, type Side } from "./panels-types.ts";
import { sameSite } from "./panels-grid.ts";

export function createPanelSplits(deps: {
  columns: () => PanelGroup[][];
  setColumns: Setter<PanelGroup[][]>;
  setWidths: Setter<number[]>;
  heights: () => number[];
  setHeights: Setter<number[]>;
  activeSite: () => PanelSite;
  setActiveSite: Setter<PanelSite>;
  siteOf: (id: string) => PanelSite | null;
  groupAt: (site: PanelSite) => PanelGroup | null;
  groupCount: () => number;
  sites: () => PanelSite[];
  updateGroup: (site: PanelSite, fn: (g: PanelGroup) => PanelGroup) => void;
  vacancy: () => PanelSite | null;
  removeTab: (id: string) => PanelSite | null;
  closeGroup: (site: PanelSite) => void;
  rowCount: () => number;
  persist: () => void;
}) {
  const {
    columns,
    setColumns,
    setWidths,
    heights,
    setHeights,
    activeSite,
    setActiveSite,
    siteOf,
    groupAt,
    groupCount,
    sites,
    updateGroup,
    vacancy,
    removeTab,
    closeGroup,
    rowCount,
    persist,
  } = deps;

  function canSplitAt(id: string, reference: PanelSite, side: Side, unplaced = false): boolean {
    const from = siteOf(id);
    if ((!from && !unplaced) || !groupAt(reference)) return false;
    if (side === "left" || side === "right")
      return columns().length < MAX_COLUMNS;
    return columns()[reference.col].length < MAX_ROWS;
  }

  function splitAt(id: string, reference: PanelSite, side: Side): boolean {
    if (!canSplitAt(id, reference, side)) return false;
    batch(() => {
      // La celda de origen queda disponible para abrir otra vista.
      updateGroup(siteOf(id)!, (g) => {
        const tabs = g.pestanas.filter((x) => x !== id);
        return { pestanas: tabs, activa: g.activa === id ? tabs.at(-1) ?? null : g.activa };
      });
      let target: PanelSite;
      if (side === "left" || side === "right") {
        const at = reference.col + (side === "right" ? 1 : 0);
        setColumns((cs) => [...cs.slice(0, at), [emptyGroup()], ...cs.slice(at)]);
        setWidths((ts) => {
          const copy = [...ts];
          const half = (copy[reference.col] ?? 1) / 2;
          copy[reference.col] = half;
          copy.splice(at, 0, half);
          return copy;
        });
        target = { col: at, fila: 0 };
      } else {
        const row = side === "up" ? 0 : columns()[reference.col].length;
        setColumns((cs) =>
          cs.map((c, i) =>
            i === reference.col
              ? [...c.slice(0, row), emptyGroup(), ...c.slice(row)]
              : c,
          ),
        );
        const f = rowCount();
        if (heights().length < f)
          setHeights(Array.from({ length: f }, () => 1 / f));
        target = { col: reference.col, fila: row };
      }
      updateGroup(target, () => ({ pestanas: [id], activa: id }));
      setActiveSite(target);
    });
    persist();
    return true;
  }

  function move(id: string, a: PanelSite, index?: number): boolean {
    const from = siteOf(id);
    if (!from || !groupAt(a)) return false;
    if (sameSite(from, a)) {
      const g = groupAt(a)!;
      const withoutTab = g.pestanas.filter((x) => x !== id);
      const position = Math.max(0, Math.min(index ?? withoutTab.length, withoutTab.length));
      if (g.pestanas[position] === id) return false;
      batch(() => {
        updateGroup(a, () => ({
          pestanas: [...withoutTab.slice(0, position), id, ...withoutTab.slice(position)],
          activa: id,
        }));
        setActiveSite(a);
      });
      persist();
      return true;
    }
    // Cerrar la ventana de origen desplaza las coordenadas del destino; se conserva su identidad.
    const destination = groupAt(a)!;
    batch(() => {
      removeTab(id);
      const current = sites().find((s) => groupAt(s) === destination) ?? a;
      updateGroup(current, (g) => {
        const position = Math.max(
          0,
          Math.min(index ?? g.pestanas.length, g.pestanas.length),
        );
        return {
          pestanas: [...g.pestanas.slice(0, position), id, ...g.pestanas.slice(position)],
          activa: id,
        };
      });
      // updateGroup sustituye el objeto de destino; buscarlo otra vez por identidad no lo encontraría.
      setActiveSite(current);
    });
    persist();
    return true;
  }

  function split(id: string): boolean {
    const from = siteOf(id);
    if (!from) return false;
    const position = vacancy();
    if (!position) return false;
    batch(() => {
      if (position.col >= columns().length) {
        setColumns((cs) => [...cs, [emptyGroup()]]);
        setWidths((ts) => {
          const copy = [...ts];
          const half = copy[copy.length - 1] / 2;
          copy[copy.length - 1] = half;
          copy.push(half);
          return copy;
        });
      } else {
        setColumns((cs) =>
          cs.map((c, n) => (n === position.col ? [...c, emptyGroup()] : c)),
        );
        // Solo la primera fila nueva debe dividir el alto; las siguientes comparten esa pista.
        setHeights((ts) => (ts.length === 1 ? [0.5, 0.5] : ts));
      }
      updateGroup(from, (g) => {
        const tabs = g.pestanas.filter((x) => x !== id);
        return { pestanas: tabs, activa: g.activa === id ? tabs.at(-1) ?? null : g.activa };
      });
      updateGroup(position, () => ({ pestanas: [id], activa: id }));
      setActiveSite(position);
    });
    persist();
    return true;
  }

  function join(): boolean {
    if (groupCount() <= 1) return false;
    const from = activeSite();
    const g = groupAt(from);
    if (!g) return false;
    const other = sites().find((s) => !sameSite(s, from));
    if (!other) return false;
    const destination = groupAt(other)!;
    batch(() => {
      closeGroup(from);
      const current = sites().find((s) => groupAt(s) === destination);
      if (!current) return;
      updateGroup(current, (d) => ({
        pestanas: [...d.pestanas, ...g.pestanas],
        activa: g.activa ?? d.activa,
      }));
      setActiveSite(current);
    });
    persist();
    return true;
  }

  return {
    canSplitAt,
    splitAt,
    move,
    split,
    join,
  };
}
