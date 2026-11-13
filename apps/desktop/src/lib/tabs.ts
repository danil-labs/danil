import { batch, createSignal } from "solid-js";
// Node con strip-types necesita la extensión para resolver este import.
import { borrarPref, escribirPref, hayPref, leerPref, prefsQueEmpiezan } from "./prefs.ts";
import { esProvisional } from "./taskDraft.ts";

// Pestañas por workspace y espacio; cerrar una vista no termina su tarea.
// Solo se guardan las de tarea: documentos y sitios dependen de recursos de la ejecución.
// La pestaña activa distingue conversación y contenido de una misma sesión.

type CommonTab = {
  id: string;
  project: string;
  session: string;
};

export type TaskTab = CommonTab & {
  clase: "tarea";
  // El historial puede llegar después del primer render; mientras tanto se usa el título guardado.
  titulo: string;
};

export type FileTab = CommonTab & {
  clase: "archivo";
  // Sin tarea se lee el commit base; con tarea debe leerse su copia de trabajo.
  base?: string;
  arbol: string;
  ruta: string;
  cambiado: boolean;
};

export type ArtifactTab = CommonTab & {
  clase: "artefacto";
  rel: string;
  path: string;
  kind: "output" | "input" | "external";
  codigo?: boolean;
};

// Site.tsx posee la capa nativa; guardar su estado aquí crearía una segunda fuente de verdad.
export type SiteTab = CommonTab & {
  clase: "sitio";
  url: string;
  navegador?: true;
};

export type ObservabilityTab = CommonTab & {
  clase: "observabilidad";
  titulo: string;
};

// Una por máquina: la pantalla es de la computadora, no de una tarea.
export type ScreenTab = CommonTab & {
  clase: "pantalla";
  machine: string;
  titulo: string;
};

export type Tab =
  | TaskTab
  | FileTab
  | ArtifactTab
  | SiteTab
  | ObservabilityTab
  | ScreenTab;
export type ContentTab =
  | FileTab
  | ArtifactTab
  | SiteTab;

// La ruta no basta: tareas y árboles distintos pueden tener el mismo archivo.
// El byte nulo separa campos sin colisionar con nombres de archivo.
export const fileTabId = (a: {
  project: string;
  session: string;
  arbol: string;
  ruta: string;
}) =>
  a.session
    ? `archivo\u0000${a.session}\u0000${a.arbol}\u0000${a.ruta}`
    : `archivo-previo\u0000${a.project}\u0000${a.arbol}\u0000${a.ruta}`;

export const artifactTabId = (a: { session: string; rel: string }) =>
  `artefacto\u0000${a.session}\u0000${a.rel}`;

export const siteTabId = (a: { session: string; url: string }) =>
  `sitio\u0000${a.session}\u0000${a.url}`;

let browserSequence = 0;
export const browserTabId = () => `navegador\u0000${Date.now()}\u0000${browserSequence++}`;


export const OBSERVABILITY_TAB_ID = "observabilidad";

export const screenTabId = (machine: string) => `pantalla\u0000${machine}`;

export const isTaskTab = (p: Tab): p is TaskTab => p.clase === "tarea";
export const isContentTab = (p: Tab): p is ContentTab =>
  p.clase === "archivo" || p.clase === "artefacto" || p.clase === "sitio";

export type BatchCloseAction = "esta" | "demas" | "derecha" | "todas";

export function tabsToClose(
  strip: readonly Tab[],
  id: string,
  action: BatchCloseAction,
): string[] {
  const i = strip.findIndex((p) => p.id === id);
  if (i < 0) return [];
  if (action === "esta") return [id];
  if (action === "todas") return strip.map((p) => p.id);
  const selected = strip[i];
  const isPreserved = (p: Tab) =>
    p.id === id ||
    (isTaskTab(selected)
      ? p.session === selected.session
      : selected.session !== "" && isTaskTab(p) && p.session === selected.session);
  let from = 0;
  if (action === "derecha") {
    from = i + 1;
    if (isTaskTab(selected)) {
      strip.forEach((p, n) => {
        if (p.session === selected.session) from = Math.max(from, n + 1);
      });
    }
  }
  return strip
    .slice(from)
    .filter((p) => !isPreserved(p))
    .map((p) => p.id);
}

// La confirmación de borradores y el cierre deben incluir el mismo bloque de pestañas.
function belongsToBlock(list: readonly Tab[], ids: readonly string[]): (p: Tab) => boolean {
  const requested = new Set(ids);
  const tasks = new Set(
    list.filter((p) => requested.has(p.id) && isTaskTab(p)).map((p) => p.session),
  );
  return (p) => requested.has(p.id) || tasks.has(p.session);
}

// Las temporales vuelven temporales: el siguiente clic las sigue sustituyendo.
type StoredTabs = { abiertas: TaskTab[]; activa: string | null; temporales?: string[] };

// El índice es el de la tira al cerrar; reinsertar en orden ascendente la reconstruye.
type ClosedBlock = { tabs: { tab: Tab; index: number }[]; active: string | null };

const MAX_CLOSED_BLOCKS = 20;

const key = (workspace: string, space: string | null) =>
  space ? `pestanas.${workspace}.${space}` : `pestanas.${workspace}`;

const readStoredTabs = (k: string): StoredTabs => {
  const g = leerPref<StoredTabs | null>(k, null);
  const openTabs = Array.isArray(g?.abiertas)
    ? g.abiertas.map(asTask).filter((p): p is TaskTab => p !== null)
    : [];
  const temporales = Array.isArray(g?.temporales)
    ? g.temporales.filter((id) => openTabs.some((p) => p.id === id))
    : [];
  return { abiertas: openTabs, activa: g && openTabs.some((p) => p.id === g.activa) ? g.activa : null, temporales };
};

// La clave anterior se conserva para que un build anterior pueda restaurar su tira.
export function migrateLegacyStrip(ws: string, firstSpace: string) {
  if (hayPref(key(ws, null)) && !hayPref(key(ws, firstSpace))) {
    escribirPref(key(ws, firstSpace), readStoredTabs(key(ws, null)));
  }
}

export const storedStrip = (ws: string, space: string) =>
  readStoredTabs(key(ws, space)).abiertas;

export const deleteStoredStrip = (ws: string, space: string) => borrarPref(key(ws, space));

export const spacesWithStoredStrip = (ws: string) =>
  prefsQueEmpiezan(`pestanas.${ws}.`).map((k) => k.slice(`pestanas.${ws}.`.length));

export function appendToStoredStrip(ws: string, space: string, p: { id: string; project: string; titulo: string }) {
  const g = readStoredTabs(key(ws, space));
  if (g.abiertas.some((x) => x.id === p.id)) return;
  g.abiertas.push({ ...p, clase: "tarea", session: p.id });
  escribirPref(key(ws, space), g);
}

// Las tiras antiguas no tienen clase ni session; descartarlas borraría las pestañas al actualizar.
function asTask(p: unknown): TaskTab | null {
  if (!p || typeof p !== "object") return null;
  const x = p as Record<string, unknown>;
  if (typeof x.id !== "string" || typeof x.project !== "string") return null;
  if (x.clase !== undefined && x.clase !== "tarea") return null;
  return {
    clase: "tarea",
    id: x.id,
    project: x.project,
    session: x.id,
    titulo: typeof x.titulo === "string" ? x.titulo : "",
  };
}

export function createTabs(options: { transient?: boolean } = {}) {
  const [pinned, setPinned] = createSignal<ReadonlySet<string>>(new Set());
  const isPinned = (id: string) => pinned().has(id);
  const remapPinned = (pairs: [string, string][]) => {
    const next = new Set(pinned());
    for (const [from, to] of pairs) if (next.delete(from)) next.add(to);
    setPinned(next);
  };
  const [openTabs, setOpenTabs] = createSignal<Tab[]>([]);
  const [dirty, setDirtyTabs] = createSignal<ReadonlySet<string>>(new Set());
  const savers = new Map<string, () => Promise<boolean>>();
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
    const abiertas = openTabs().filter(isTaskTab).filter((p) => !esProvisional(p.session));
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
      workspace = ws;
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
      const next: TaskTab = { ...p, clase: "tarea", session: p.id };
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
        copy[i] = { ...next, titulo: p.titulo || (current as TaskTab).titulo };
        return copy;
      });
      if (!options.transient || openTabs().some((x) => x.session === p.id && isPinned(x.id))) pin(p.id);
      save();
    },
    // Cerrar y reabrir la pestaña provisional la movería al final de la tira.
    commitDraft(draft: string, p: { id: string; project: string; titulo: string }) {
      setOpenTabs((list) => {
        const i = list.findIndex((x) => x.id === draft);
        if (i < 0) return list;
        const copy = [...list];
        copy[i] = { ...p, clase: "tarea", session: p.id };
        return copy;
      });
      remapPinned([[draft, p.id]]);
      if (active() === draft) setActive(p.id);
      save();
    },
    openObservability(title: string) {
      const next: ObservabilityTab = {
        clase: "observabilidad",
        id: OBSERVABILITY_TAB_ID,
        project: "",
        session: "",
        titulo: title,
      };
      setOpenTabs((list) =>
        list.some((p) => p.id === next.id) ? list : [...list, next],
      );
      if (!options.transient) pin(next.id);
      activateAndPersist(next.id);
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
    // El nuevo id debe propagarse a lib/panels.ts o la pestaña perdería su ventana.
    attachPreviewFiles(project: string, session: string, tree: string): [string, string][] {
      const changes: [string, string][] = [];
      setOpenTabs((list) =>
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
      remapPinned(changes);
      const move = new Map(changes);
      const currentTab = active();
      if (currentTab !== null && move.has(currentTab)) setActive(move.get(currentTab)!);
      save();
      return changes;
    },
    renameFiles(session: string, tree: string, from: string, end: string): [string, string][] {
      const changes: [string, string][] = [];
      const nested = (path: string) => path === from || path.startsWith(`${from}/`);
      setOpenTabs((list) =>
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
      remapPinned(changes);
      const move = new Map(changes);
      const currentTab = active();
      if (currentTab !== null && move.has(currentTab)) setActive(move.get(currentTab)!);
      save();
      return changes;
    },
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
    markChanged(id: string) {
      setOpenTabs((list) =>
        list.map((x) =>
          x.id === id && x.clase === "archivo" ? { ...x, cambiado: true } : x,
        ),
      );
    },
    dirty: dirty,
    setDirty(id: string, dirty: boolean) {
      if (dirty && options.transient) pin(id);
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
      const list = openTabs();
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
          p.clase === "observabilidad" ||
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
