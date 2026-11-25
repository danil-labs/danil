import { batch, createSignal } from "solid-js";
import { escribirPref } from "../../../session/src/prefs.ts";
import { esProvisional } from "./taskDraft.ts";
import { tabViewKey as key, workspaceViewKey } from "../../../session/src/workspace-view-scope.ts";
import { belongsToBlock } from "./tabs-close.ts";
import { createTabFiles } from "./tabs-files.ts";
import {
  type ClosedBlock,
  MAX_CLOSED_BLOCKS,
  readStoredTabs,
  type StoredTabs,
} from "./tabs-storage.ts";
import {
  type ContentTab,
  isTaskTab,
  type ScreenTab,
  screenTabId,
  type Tab,
  type TaskTab,
} from "./tabs-types.ts";

export function createTabs(options: { transient?: boolean } = {}) {
  const [pinned, setPinned] = createSignal<ReadonlySet<string>>(new Set());
  const isPinned = (id: string) => pinned().has(id);
  const remapPinned = (pairs: [string, string][]) => {
    const next = new Set(pinned());
    for (const [from, to] of pairs) if (next.delete(from)) next.add(to);
    setPinned(next);
  };
  const [openTabs, setOpenTabs] = createSignal<Tab[]>([]);
  const [active, setActive] = createSignal<string | null>(null);
  // Solo en memoria y por tira: al arrancar ya vuelven las pestañas de tarea.
  const closedByStrip = new Map<string, ClosedBlock[]>();
  const [closed, setClosed] = createSignal<ClosedBlock[]>([]);
  let workspace: string | null = null;
  let space: string | null = null;

  const setClosedStack = (stack: ClosedBlock[]) => {
    if (workspace) closedByStrip.set(key(workspace, space), stack);
    setClosed(stack);
  };

  const taskOf = (id: string | null) =>
    openTabs().find((p) => p.id === id)?.session ?? null;

  const save = () => {
    if (!workspace) return;
    // Los ids provisionales no existen en disco y no pueden restaurarse al arrancar.
    const activeTask = taskOf(active());
    const abiertas = openTabs()
      .filter(isTaskTab)
      .filter((p) => !esProvisional(p.session))
      .map(({ clase, id, project, session, titulo }) => ({ clase, id, project, session, titulo }));
    const g: StoredTabs = {
      abiertas,
      activa: activeTask && !esProvisional(activeTask) ? activeTask : null,
      temporales: abiertas.filter((p) => !isPinned(p.id)).map((p) => p.id),
    };
    escribirPref(key(workspace, space), g);
  };

  // Solo recuerda el cierre que pide la persona; mover o borrar una tarea no se deshace así.
  function closeMany(ids: readonly string[], opts: { remember?: boolean } = {}): Tab | null {
    const list = openTabs();
    const removed = belongsToBlock(list, ids);
    const currentTab = active();
    let i = list.findIndex((p) => p.id === currentTab && removed(p));
    if (i < 0) i = list.findIndex(removed);
    if (i < 0) return null;
    if (opts.remember && workspace) {
      const tabs = list.flatMap((tab, index) =>
        removed(tab) && !esProvisional(tab.session) ? [{ tab, index }] : [],
      );
      const back = tabs.find((x) => x.tab.id === currentTab) ?? tabs.find((x) => ids.includes(x.tab.id));
      if (tabs.length > 0) {
        setClosedStack([...closed(), { tabs, active: back?.tab.id ?? null }].slice(-MAX_CLOSED_BLOCKS));
      }
    }
    const remaining = list.filter((p) => !removed(p));
    // El índice pertenece a la lista original; usarlo en quedan elegiría otra vecina.
    let after: Tab | null = null;
    for (let n = i + 1; n < list.length; n++) {
      if (!removed(list[n])) {
        after = list[n];
        break;
      }
    }
    let before: Tab | null = null;
    for (let n = i - 1; n >= 0; n--) {
      if (!removed(list[n])) {
        before = list[n];
        break;
      }
    }
    const neighbor = after ?? before;
    setPinned(new Set([...pinned()].filter((id) => remaining.some((p) => p.id === id))));
    setOpenTabs(remaining);
    if (currentTab !== null && !remaining.some((p) => p.id === currentTab)) {
      setActive(neighbor?.id ?? null);
    }
    save();
    return neighbor;
  }

  const activateAndPersist = (id: string | null) => {
    setActive(id);
    save();
  };

  const pin = (id: string) => {
    const tab = openTabs().find((p) => p.id === id);
    if (!tab || isPinned(id)) return;
    batch(() => {
      const next = new Set(pinned());
      next.add(id);
      if (tab.session) {
        if (!openTabs().some((p) => isTaskTab(p) && p.id === tab.session)) {
          setOpenTabs((list) => [...list, { clase: "tarea", id: tab.session, session: tab.session, project: tab.project, titulo: "" }]);
        }
        next.add(tab.session);
      }
      setPinned(next);
      save();
    });
  };

  const files = createTabFiles({
    openTabs,
    setOpenTabs,
    active,
    setActive,
    remapPinned,
    save,
    options,
    pin,
  });

  return {
    pinned,
    isPinned,
    pin,
    restorable: () => openTabs().filter((p) => isTaskTab(p) && !esProvisional(p.session)).map((p) => p.id),
    // Sustituir una vista no cierra su tarea ni el bloque de documentos asociado.
    replacePreviews(groups: readonly (readonly string[])[], visible: readonly (string | null)[]) {
      const remove = new Set<string>();
      groups.forEach((ids, i) => {
        const active = visible[i];
        if (!active) return;
        for (const id of ids) if (id !== active && !isPinned(id)) remove.add(id);
      });
      if (remove.size === 0) return;
      setOpenTabs((list) => list.filter((p) => !remove.has(p.id)));
      save();
    },
    open: openTabs,
    active: active,
    activeTab: () => openTabs().find((p) => p.id === active()) ?? null,
    load(ws: string | null, desk: string | null = null): string | null {
      workspace = ws = ws ? workspaceViewKey(ws) : null;
      space = desk;
      setActive(null);
      setPinned(new Set<string>());
      setClosed(ws ? (closedByStrip.get(key(ws, desk)) ?? []) : []);
      if (!ws) {
        setOpenTabs([]);
        return null;
      }
      const g = readStoredTabs(key(ws, desk));
      const temporales = new Set(g.temporales);
      setPinned(new Set(g.abiertas.map((p) => p.id).filter((id) => !temporales.has(id))));
      setOpenTabs(g.abiertas);
      return g.activa;
    },
    ensure(p: { id: string; project: string; titulo: string }) {
      const next: TaskTab = { ...p, clase: "tarea", session: p.id, mountKey: p.id };
      setOpenTabs((list) => {
        const i = list.findIndex((x) => x.id === p.id);
        if (i < 0) return [...list, next];
        const current = list[i];
        if (
          isTaskTab(current) &&
          current.project === p.project &&
          current.titulo === p.titulo
        )
          return list;
        const copy = [...list];
        copy[i] = { ...next, mountKey: isTaskTab(current) ? (current.mountKey ?? current.id) : p.id, titulo: p.titulo || (current as TaskTab).titulo };
        return copy;
      });
      if (!options.transient || openTabs().some((x) => x.session === p.id && isPinned(x.id))) pin(p.id);
      save();
    },
    // Cerrar y reabrir la pestaña provisional la movería al final de la tira.
    commitDraft(draft: string, p: { id: string; project: string; titulo: string }) {
      batch(() => {
        setOpenTabs((list) => {
          const i = list.findIndex((x) => x.id === draft);
          if (i < 0) return list;
          const current = list[i];
          const mountKey = isTaskTab(current) ? (current.mountKey ?? draft) : draft;
          const copy = [...list];
          copy[i] = { ...p, clase: "tarea", session: p.id, mountKey };
          return copy;
        });
        remapPinned([[draft, p.id]]);
        if (active() === draft) setActive(p.id);
      });
      save();
    },
    openScreen(machine: string, title: string) {
      const next: ScreenTab = {
        clase: "pantalla",
        id: screenTabId(machine),
        project: "",
        session: "",
        machine,
        titulo: title,
      };
      setOpenTabs((list) =>
        list.some((p) => p.id === next.id) ? list : [...list, next],
      );
      // Provisional, sustituiría a la tarea provisional de su ventana antes de abrirse al lado.
      pin(next.id);
      activateAndPersist(next.id);
    },
    openContent(p: ContentTab) {
      setOpenTabs((list) => {
        const i = list.findIndex((x) => x.id === p.id);
        if (i >= 0) {
          const copy = [...list];
          const preview = list[i];
          // El árbol de kn no comunica cambios; su false no debe quitar la vista de cambios.
          copy[i] =
            p.clase === "archivo" && preview.clase === "archivo" && preview.cambiado
              ? { ...p, cambiado: true }
              : p;
          return copy;
        }
        // Un navegador sin sesión no debe agruparse con archivos de una tarea aún sin crear.
        if (p.clase === "sitio" && p.navegador) return [...list, p];
        let end = -1;
        for (let n = 0; n < list.length; n++) {
          if (list[n].session === p.session) end = n;
        }
        if (end < 0) return [...list, p];
        return [...list.slice(0, end + 1), p, ...list.slice(end + 1)];
      });
      if (!options.transient) pin(p.id);
      activateAndPersist(p.id);
    },
    activate: activateAndPersist,
    close: (id: string): Tab | null => closeMany([id]),
    closeMany: closeMany,
    canReopen: () => closed().length > 0,
    /**
     * Vuelve el último bloque cerrado a mano, en su sitio de la tira, y
     * devuelve la pestaña que debe quedar delante. Lo que ya está abierto o
     * dejó de existir se salta; un bloque sin nada que volver cede al anterior.
     */
    reopen(alive: (p: Tab) => boolean): Tab | null {
      let stack = closed();
      while (stack.length > 0) {
        const block = stack[stack.length - 1];
        stack = stack.slice(0, -1);
        const open = new Set(openTabs().map((p) => p.id));
        const back = block.tabs.filter(({ tab }) => !open.has(tab.id) && alive(tab));
        if (back.length === 0) continue;
        const list = [...openTabs()];
        for (const { tab, index } of back) list.splice(Math.min(index, list.length), 0, tab);
        setOpenTabs(list);
        setPinned(new Set([...pinned(), ...back.map(({ tab }) => tab.id)]));
        setClosedStack(stack);
        save();
        return back.find((x) => x.tab.id === block.active)?.tab ?? back[0].tab;
      }
      setClosedStack(stack);
      return null;
    },
    attachPreviewFiles: files.attachPreviewFiles,
    renameFiles: files.renameFiles,
    navigate(id: string, url: string) {
      setOpenTabs((list) =>
        list.map((x) =>
          x.id === id && x.clase === "sitio" && x.navegador && x.url !== url ? { ...x, url } : x,
        ),
      );
    },
    moveToProject(session: string, project: string) {
      setOpenTabs((list) =>
        list.map((x) => (x.session === session ? { ...x, project } : x)),
      );
      save();
    },
    markChanged: files.markChanged,
    dirty: files.dirty,
    setDirty: files.setDirty,
    registerSaver: files.registerSaver,
    dirtyTabsToClose: files.dirtyTabsToClose,
    saveFiles: files.saveFiles,
    sync(
      find: (id: string) => { project: string; titulo: string } | null,
    ): string[] {
      const list = openTabs();
      const removed: string[] = [];
      let change = false;
      const next: Tab[] = [];
      for (const p of list) {
        // Las vistas sin sesión y las tareas provisionales no tienen fila en el historial.
        // Validarlas contra él cerraría sus pestañas durante la sincronización.
        if (
          p.clase === "pantalla" ||
          p.session === "" ||
          esProvisional(p.session)
        ) {
          next.push(p);
          continue;
        }
        const row = find(p.session);
        if (!row) {
          if (isTaskTab(p)) removed.push(p.id);
          change = true;
          continue;
        }
        if (
          row.project !== p.project ||
          (isTaskTab(p) && row.titulo && row.titulo !== p.titulo)
        ) {
          next.push({
            ...p,
            project: row.project,
            ...(isTaskTab(p) ? { titulo: row.titulo || p.titulo } : {}),
          });
          change = true;
        } else next.push(p);
      }
      if (change) {
        setPinned(new Set([...pinned()].filter((id) => next.some((p) => p.id === id))));
        setOpenTabs(next);
        if (active() !== null && !next.some((p) => p.id === active())) {
          setActive(null);
        }
        save();
      }
      return removed;
    },
  };
}
