import { createSignal } from "solid-js";
import { belongsToBlock } from "./tabs-close.ts";
import { type FileTab, fileTabId, type Tab } from "./tabs-types.ts";

export function createTabFiles(deps: {
  openTabs: () => Tab[];
  setOpenTabs: (fn: (list: Tab[]) => Tab[]) => void;
  active: () => string | null;
  setActive: (id: string | null) => void;
  remapPinned: (pairs: [string, string][]) => void;
  save: () => void;
  options: { transient?: boolean };
  pin: (id: string) => void;
}) {
  const [dirty, setDirtyTabs] = createSignal<ReadonlySet<string>>(new Set());
  const savers = new Map<string, () => Promise<boolean>>();

  return {
    // El nuevo id debe propagarse a lib/panels.ts o la pestaña perdería su ventana.
    attachPreviewFiles(project: string, session: string, tree: string): [string, string][] {
      const changes: [string, string][] = [];
      deps.setOpenTabs((list) =>
        list.map((p) => {
          if (p.clase !== "archivo" || p.session !== "" || p.project !== project)
            return p;
          const { base: _base, ...remaining } = p;
          const next: FileTab = {
            ...remaining,
            session,
            arbol: tree,
            id: fileTabId({ project, session, arbol: tree, ruta: p.ruta }),
          };
          changes.push([p.id, next.id]);
          return next;
        }),
      );
      deps.remapPinned(changes);
      const move = new Map(changes);
      const currentTab = deps.active();
      if (currentTab !== null && move.has(currentTab)) deps.setActive(move.get(currentTab)!);
      deps.save();
      return changes;
    },
    renameFiles(session: string, tree: string, from: string, end: string): [string, string][] {
      const changes: [string, string][] = [];
      const nested = (path: string) => path === from || path.startsWith(`${from}/`);
      deps.setOpenTabs((list) =>
        list.map((p) => {
          if (p.clase !== "archivo" || p.session !== session || p.arbol !== tree || !nested(p.ruta))
            return p;
          const path = end + p.ruta.slice(from.length);
          const next: FileTab = {
            ...p,
            ruta: path,
            id: fileTabId({ project: p.project, session, arbol: tree, ruta: path }),
          };
          changes.push([p.id, next.id]);
          return next;
        }),
      );
      deps.remapPinned(changes);
      const move = new Map(changes);
      const currentTab = deps.active();
      if (currentTab !== null && move.has(currentTab)) deps.setActive(move.get(currentTab)!);
      deps.save();
      return changes;
    },
    markChanged(id: string) {
      deps.setOpenTabs((list) =>
        list.map((x) =>
          x.id === id && x.clase === "archivo" ? { ...x, cambiado: true } : x,
        ),
      );
    },
    dirty: dirty,
    setDirty(id: string, dirty: boolean) {
      if (dirty && deps.options.transient) deps.pin(id);
      setDirtyTabs((current) => {
        if (current.has(id) === dirty) return current;
        const copy = new Set(current);
        if (dirty) copy.add(id);
        else copy.delete(id);
        return copy;
      });
    },
    registerSaver(id: string, save: (() => Promise<boolean>) | null) {
      if (save) savers.set(id, save);
      else savers.delete(id);
    },
    dirtyTabsToClose(ids: string | readonly string[]): FileTab[] {
      const list = deps.openTabs();
      const removed = belongsToBlock(list, typeof ids === "string" ? [ids] : ids);
      return list.filter(
        (p): p is FileTab =>
          p.clase === "archivo" && removed(p) && dirty().has(p.id),
      );
    },
    async saveFiles(ids: string[]): Promise<boolean> {
      const saved = await Promise.all(
        ids.map((id) => savers.get(id)?.() ?? Promise.resolve(false)),
      );
      return saved.every(Boolean);
    },
  };
}
