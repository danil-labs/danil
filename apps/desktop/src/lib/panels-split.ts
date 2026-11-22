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
  function canSplitAt(id: string, reference: PanelSite, side: Side, unplaced = false): boolean {
    const from = deps.siteOf(id);
    if ((!from && !unplaced) || !deps.groupAt(reference)) return false;
    if (side === "left" || side === "right")
      return deps.columns().length < MAX_COLUMNS;
    return deps.columns()[reference.col].length < MAX_ROWS;
  }

  function splitAt(id: string, reference: PanelSite, side: Side): boolean {
    if (!canSplitAt(id, reference, side)) return false;
    batch(() => {
      // La celda de origen queda disponible para abrir otra vista.
      deps.updateGroup(deps.siteOf(id)!, (g) => {
        const tabs = g.pestanas.filter((x) => x !== id);
        return { pestanas: tabs, activa: g.activa === id ? tabs.at(-1) ?? null : g.activa };
      });
      let target: PanelSite;
      if (side === "left" || side === "right") {
        const at = reference.col + (side === "right" ? 1 : 0);
        deps.setColumns((cs) => [...cs.slice(0, at), [emptyGroup()], ...cs.slice(at)]);
        deps.setWidths((ts) => {
          const copy = [...ts];
          const half = (copy[reference.col] ?? 1) / 2;
          copy[reference.col] = half;
          copy.splice(at, 0, half);
          return copy;
        });
        target = { col: at, fila: 0 };
      } else {
        const row = side === "up" ? 0 : deps.columns()[reference.col].length;
        deps.setColumns((cs) =>
          cs.map((c, i) =>
            i === reference.col
              ? [...c.slice(0, row), emptyGroup(), ...c.slice(row)]
              : c,
          ),
        );
        const f = deps.rowCount();
        if (deps.heights().length < f)
          deps.setHeights(Array.from({ length: f }, () => 1 / f));
        target = { col: reference.col, fila: row };
      }
      deps.updateGroup(target, () => ({ pestanas: [id], activa: id }));
      deps.setActiveSite(target);
    });
    deps.persist();
    return true;
  }

  function move(id: string, a: PanelSite, index?: number): boolean {
    const from = deps.siteOf(id);
    if (!from || !deps.groupAt(a)) return false;
    if (sameSite(from, a)) {
      const g = deps.groupAt(a)!;
      const withoutTab = g.pestanas.filter((x) => x !== id);
      const position = Math.max(0, Math.min(index ?? withoutTab.length, withoutTab.length));
      if (g.pestanas[position] === id) return false;
      batch(() => {
        deps.updateGroup(a, () => ({
          pestanas: [...withoutTab.slice(0, position), id, ...withoutTab.slice(position)],
          activa: id,
        }));
        deps.setActiveSite(a);
      });
      deps.persist();
      return true;
    }
    // Cerrar la ventana de origen desplaza las coordenadas del destino; se conserva su identidad.
    const destination = deps.groupAt(a)!;
    batch(() => {
      deps.removeTab(id);
      const current = deps.sites().find((s) => deps.groupAt(s) === destination) ?? a;
      deps.updateGroup(current, (g) => {
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
      deps.setActiveSite(current);
    });
    deps.persist();
    return true;
  }

  function split(id: string): boolean {
    const from = deps.siteOf(id);
    if (!from) return false;
    const position = deps.vacancy();
    if (!position) return false;
    batch(() => {
      if (position.col >= deps.columns().length) {
        deps.setColumns((cs) => [...cs, [emptyGroup()]]);
        deps.setWidths((ts) => {
          const copy = [...ts];
          const half = copy[copy.length - 1] / 2;
          copy[copy.length - 1] = half;
          copy.push(half);
          return copy;
        });
      } else {
        deps.setColumns((cs) =>
          cs.map((c, n) => (n === position.col ? [...c, emptyGroup()] : c)),
        );
        // Solo la primera fila nueva debe dividir el alto; las siguientes comparten esa pista.
        deps.setHeights((ts) => (ts.length === 1 ? [0.5, 0.5] : ts));
      }
      deps.updateGroup(from, (g) => {
        const tabs = g.pestanas.filter((x) => x !== id);
        return { pestanas: tabs, activa: g.activa === id ? tabs.at(-1) ?? null : g.activa };
      });
      deps.updateGroup(position, () => ({ pestanas: [id], activa: id }));
      deps.setActiveSite(position);
    });
    deps.persist();
    return true;
  }

  function join(): boolean {
    if (deps.groupCount() <= 1) return false;
    const from = deps.activeSite();
    const g = deps.groupAt(from);
    if (!g) return false;
    const other = deps.sites().find((s) => !sameSite(s, from));
    if (!other) return false;
    const destination = deps.groupAt(other)!;
    batch(() => {
      deps.closeGroup(from);
      const current = deps.sites().find((s) => deps.groupAt(s) === destination);
      if (!current) return;
      deps.updateGroup(current, (d) => ({
        pestanas: [...d.pestanas, ...g.pestanas],
        activa: g.activa ?? d.activa,
      }));
      deps.setActiveSite(current);
    });
    deps.persist();
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
