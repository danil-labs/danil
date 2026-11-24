import { batch, createSignal } from "solid-js";
import { workspaceViewKey } from "../../../../apps/desktop/src/lib/workspace-view-scope.ts";
import { emptyGroup, type Layout, MAX_COLUMNS, MAX_ROWS, type PanelGroup, type PanelSite } from "./panels-types.ts";
import { saveLayout } from "./panels-storage.ts";
import { geometry, sameSite, siteIn } from "./panels-grid.ts";
import { createPanelSplits } from "./panels-split.ts";

export function createPanels(restorable?: () => readonly string[]) {
  const [columns, setColumns] = createSignal<PanelGroup[][]>([[emptyGroup()]]);
  const [widths, setWidths] = createSignal<number[]>([1]);
  const [heights, setHeights] = createSignal<number[]>([1]);
  const [activeSite, setActiveSite] = createSignal<PanelSite>({ col: 0, fila: 0 });

  let bound: { workspace: string; space: string } | null = null;

  const layout = (): Layout => ({
    columnas: columns(),
    anchos: widths(),
    altos: heights(),
    activo: activeSite(),
  });

  function persist() {
    if (!bound) return;
    const current = layout();
    if (!restorable) return saveLayout(bound.workspace, bound.space, current);
    const alive = new Set(restorable());
    saveLayout(bound.workspace, bound.space, {
      ...current,
      columnas: current.columnas.map((c) => c.map((g) => {
        const tabs = g.pestanas.filter((id) => alive.has(id));
        return { pestanas: tabs, activa: g.activa && alive.has(g.activa) ? g.activa : tabs.at(-1) ?? null };
      })),
    });
  }

  function oneWindow() {
    batch(() => {
      setColumns([[emptyGroup()]]);
      setWidths([1]);
      setHeights([1]);
      setActiveSite({ col: 0, fila: 0 });
    });
  }

  const rowCount = () => columns().reduce((n, c) => Math.max(n, c.length), 1);

  const groupAt = (site: PanelSite): PanelGroup | null =>
    columns()[site.col]?.[site.fila] ?? null;

  const groupCount = () => columns().reduce((n, c) => n + c.length, 0);

  // El recorrido por teclado usa panelReadingOrder; recorrer columnas cruza un 2×2 en diagonal.
  const sites = (): PanelSite[] =>
    columns().flatMap((c, col) => c.map((_, row) => ({ col, fila: row })));

  const siteOf = (id: string): PanelSite | null => {
    const cols = columns();
    for (let col = 0; col < cols.length; col++) {
      for (let row = 0; row < cols[col].length; row++) {
        if (cols[col][row].pestanas.includes(id)) return { col, fila: row };
      }
    }
    return null;
  };

  function updateGroup(site: PanelSite, fn: (g: PanelGroup) => PanelGroup) {
    setColumns((cs) =>
      cs.map((c, col) =>
        col !== site.col ? c : c.map((g, f) => (f !== site.fila ? g : fn(g))),
      ),
    );
  }

  function vacancy(): PanelSite | null {
    const cols = columns();
    if (cols.length < MAX_COLUMNS) return { col: cols.length, fila: 0 };
    for (let col = cols.length - 1; col >= 0; col--) {
      if (cols[col].length < MAX_ROWS) return { col, fila: cols[col].length };
    }
    return null;
  }

  // Ceder el ancho al vecino evita redistribuir todas las columnas al cerrar una ventana.
  function removeColumn(i: number) {
    setColumns((cs) => cs.filter((_, n) => n !== i));
    setWidths((ts) => {
      if (ts.length <= 1) return ts;
      const copy = [...ts];
      const [releasedWidth] = copy.splice(i, 1);
      copy[Math.min(i, copy.length - 1)] += releasedWidth;
      return copy;
    });
  }

  // Conservar dos pistas sin ventanas abajo dejaría media pantalla vacía.
  function collapseRows() {
    if (rowCount() === 1) setHeights([1]);
  }

  function fitActiveSite(site: PanelSite) {
    const cols = columns();
    const col = Math.min(site.col, cols.length - 1);
    const row = Math.min(site.fila, cols[col].length - 1);
    setActiveSite({ col, fila: row });
  }

  // La última ventana recibe las pestañas nuevas aunque esté vacía.
  function closeGroup(site: PanelSite) {
    if (groupCount() <= 1) return;
    const remaining = columns()[site.col].length - 1;
    if (remaining === 0) removeColumn(site.col);
    else
      setColumns((cs) =>
        cs.map((c, col) =>
          col !== site.col ? c : c.filter((_, f) => f !== site.fila),
        ),
      );
    collapseRows();
    fitActiveSite(site);
  }

  function removeTab(id: string): PanelSite | null {
    const site = siteOf(id);
    if (!site) return null;
    const g = groupAt(site)!;
    const i = g.pestanas.indexOf(id);
    const remaining = g.pestanas.filter((x) => x !== id);
    if (remaining.length === 0) {
      // closeGroup conserva la última ventana; hay que vaciarla para no mostrar una pestaña cerrada.
      if (groupCount() <= 1) updateGroup(site, () => emptyGroup());
      else closeGroup(site);
      return site;
    }
    updateGroup(site, (g) => ({
      pestanas: remaining,
      activa:
        g.activa === id ? (remaining[Math.min(i, remaining.length - 1)] ?? null) : g.activa,
    }));
    return site;
  }

  const splits = createPanelSplits({
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
  });

  return {
    columns: columns,
    widths: widths,
    heights: heights,
    rowCount: rowCount,
    activeSite: activeSite,
    sites: sites,
    siteOf: siteOf,
    groupAt: groupAt,
    groupCount: groupCount,
    rowsPerColumn: () => columns().map((c) => c.length),
    isSplit: () => groupCount() > 1,
    canSplit: () => vacancy() !== null,
    tabsAt: (site: PanelSite) => groupAt(site)?.pestanas ?? [],
    activeTabAt: (site: PanelSite) => groupAt(site)?.activa ?? null,
    isVisible: (id: string) => {
      const site = siteOf(id);
      return site !== null && groupAt(site)?.activa === id;
    },
    focus(site: PanelSite) {
      if (groupAt(site)) setActiveSite(site);
      persist();
    },
    // Conservar la activa pintaría su conversación debajo del borrador de tarea nueva.
    showDraft() {
      updateGroup(activeSite(), (g) => ({ ...g, activa: null }));
      persist();
    },
    activate(id: string) {
      const site = siteOf(id);
      if (!site || (sameSite(site, activeSite()) && groupAt(site)?.activa === id)) return;
      batch(() => {
        updateGroup(site, (g) => ({ ...g, activa: id }));
        setActiveSite(site);
      });
      persist();
    },
    // El cambio de id debe conservar el reparto; sync lo movería a la ventana activa.
    renameTabs(pairs: [string, string][]) {
      if (pairs.length === 0) return;
      const next = new Map(pairs);
      const changed = (id: string) => next.get(id) ?? id;
      setColumns((cs) =>
        cs.map((c) =>
          c.map((g) => ({
            pestanas: g.pestanas.map(changed),
            activa: g.activa === null ? null : changed(g.activa),
          })),
        ),
      );
      persist();
    },
    // Lo reabierto vuelve tras su vecina izquierda de la tira; sync lo deja al final de la ventana.
    placeLikeStrip(ids: string[], strip: string[]) {
      const placed = new Set(ids);
      for (const id of strip.filter((x) => placed.has(x))) {
        const site = siteOf(id);
        if (!site) continue;
        updateGroup(site, (g) => {
          const rest = g.pestanas.filter((x) => x !== id);
          let at = 0;
          for (let n = strip.indexOf(id) - 1; n >= 0; n--) {
            const i = rest.indexOf(strip[n]);
            if (i >= 0) {
              at = i + 1;
              break;
            }
          }
          return { ...g, pestanas: [...rest.slice(0, at), id, ...rest.slice(at)] };
        });
      }
      persist();
    },
    sync(ids: string[]): boolean {
      const liveIds = new Set(ids);
      const assigned = new Set(columns().flatMap((c) => c.flatMap((g) => g.pestanas)));
      const removed = [...assigned].filter((id) => !liveIds.has(id));
      const missing = ids.filter((id) => !assigned.has(id));
      if (removed.length === 0 && missing.length === 0) return false;
      // Sin batch se pintaría una tira vacía antes de retirar su ventana.
      batch(() => {
        for (const id of removed) removeTab(id);
        if (missing.length > 0) {
          const position = activeSite();
          updateGroup(position, (g) => ({
            pestanas: [...g.pestanas, ...missing],
            activa: g.activa ?? missing[missing.length - 1],
          }));
        }
      });
      persist();
      return true;
    },
    close(id: string): string | null {
      const site = removeTab(id);
      if (!site) return null;
      const g = groupAt(activeSite()) ?? groupAt(site);
      persist();
      return g?.activa ?? null;
    },
    move: splits.move,
    split: splits.split,
    canSplitAt: splits.canSplitAt,
    splitAt: splits.splitAt,
    join: splits.join,
    resizeColumns(i: number, a: number, b: number) {
      setWidths((ts) =>
        i < 0 || i + 1 >= ts.length
          ? ts
          : ts.map((t, n) => (n === i ? a : n === i + 1 ? b : t)),
      );
      persist();
    },
    resizeRows(i: number, a: number, b: number) {
      setHeights((ts) =>
        i < 0 || i + 1 >= ts.length
          ? ts
          : ts.map((t, n) => (n === i ? a : n === i + 1 ? b : t)),
      );
      persist();
    },
    layout,
    // Un reparto guardado puede apuntar a pestañas borradas o contener tamaños inválidos.
    restore(layout: Layout | null, live: readonly string[]) {
      const alive = new Set(live);
      const seen = new Set<string>();
      const cols: PanelGroup[][] = [];
      // Con una sola ventana, un reparto guardado de antes junta sus pestañas en ella en vez de perderlas.
      const all: string[] = [];
      let front: string | null = null;
      (layout?.columnas ?? []).forEach((col, c) => {
        if (!Array.isArray(col)) return;
        col.forEach((g, f) => {
          if (!Array.isArray(g?.pestanas)) return;
          for (const id of g.pestanas) {
            if (typeof id !== "string" || !alive.has(id) || seen.has(id)) continue;
            seen.add(id);
            all.push(id);
          }
          const isActive = layout?.activo?.col === c && layout?.activo?.fila === f;
          if (typeof g.activa === "string" && seen.has(g.activa) && (isActive || front === null)) front = g.activa;
        });
      });
      if (all.length > 0) cols.push([{ pestanas: all, activa: front ?? all[all.length - 1] }]);
      if (cols.length === 0) {
        oneWindow();
        persist();
        return;
      }
      const rows = cols.reduce((n, c) => Math.max(n, c.length), 1);
      const nextWidths = geometry(layout?.anchos, cols.length);
      const nextHeights = geometry(layout?.altos, rows);
      const site = siteIn(cols, layout?.activo) ?? { col: 0, fila: 0 };
      batch(() => {
        setColumns(cols);
        setWidths(nextWidths);
        setHeights(nextHeights);
        setActiveSite(site);
      });
      persist();
    },
    // Cambiar de workspace sin soltar el encuadre guardaría la rejilla bajo el cliente anterior.
    bindTo(workspace: string | null, space: string | null) {
      bound = workspace && space ? { workspace: workspaceViewKey(workspace), space } : null;
      persist();
    },
    reset() {
      oneWindow();
      persist();
    },
  };
}
