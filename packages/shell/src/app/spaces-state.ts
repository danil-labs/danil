import { batch, createEffect, createMemo, createSignal, onCleanup, type Accessor, type Setter } from "solid-js";
import { callShellEngine } from "../../../session/src/shell-queries.ts";
import { t } from "../../../ui/src/lib/i18n";
import { type Project } from "../../../ui/src/lib/model.ts";
import { readShellCache, shellCacheWriter } from "../../../session/src/shellCache";
import { createSpaceNavigationOrder } from "../../../session/src/space-navigation-order";
import { createSpaceCatalog } from "./space-catalog";
import { type Space } from "../../../ui/src/lib/spaces";
import { isContentTab, type createTabs } from "../../../ui/src/lib/tabs";
import { createWorkspaces } from "../../../features/settings/src/queries/workspaces-store";
import { type SessionRow } from "../../../features/projects/src/screens/Sessions";
import { type SearchFilter } from "../shell/GlobalSearch";
import type { Frase } from "../../../ui/src/lib/prose";
import type { SidebarFilterProps } from "../shell/SidebarFilter";

export type SpacesStateDeps = { bloqueo: Accessor<Frase | null>; pestanas: ReturnType<typeof createTabs>; projectCatalog: { fromCache: (projects: Project[]) => void }; projectList: Accessor<Project[]>; proyectoAbierto: Accessor<string | null>; sesiones: Accessor<Record<string, SessionRow[]>>; setError: (msg: string) => void; setSesiones: Setter<Record<string, SessionRow[]>>; workspaceActivo: Accessor<string | null>; onCatalogSync?: () => void; };

export function createSpacesState(deps: SpacesStateDeps) {
  const { bloqueo, pestanas, projectCatalog, projectList, proyectoAbierto, sesiones: rawSesiones, setError, setSesiones, workspaceActivo } = deps;

  const pestanaActiva = () => (proyectoAbierto() ? null : pestanas.active());
  // Los escritorios del workspace (`lib/spaces.ts`). Sin lista —un servicio
  // que no los conoce— la ventana se pinta como antes de los espacios.
  const [rawSpaces, setSpaces] = createSignal<Space[]>([]);
  const onOrderFailure = () => setError(t("spaces.order.error"));
  const localOrder = createSpaceNavigationOrder(() => workspaceActivo() ?? "", onOrderFailure);
  const spaceCatalog = createSpaceCatalog(workspaceActivo, deps.onCatalogSync, onOrderFailure);
  const spaceOrder = {
    saving: () => spaceCatalog.saving(localOrder),
    arrange: <T extends { id: string }>(items: readonly T[]) => localOrder.arrange(items),
    save: (ids: string[]) => spaceCatalog.saveOrder(ids, localOrder),
  };
  const spaces = createMemo(() => spaceCatalog.arrange(rawSpaces(), localOrder));
  const sesiones = createMemo(() => spaceCatalog.projectSessions(rawSesiones()));
  const [escritorio, setEscritorio] = createSignal<string | null>(null);
  const [sidebarFilter, setSidebarFilter] = createSignal<SidebarFilterProps | null>(null);
  // El nombre del workspace abierto rotula el menú de espacios de la franja.
  const workspacesDeLaFranja = createWorkspaces();
  const workspaceActual = () => workspacesDeLaFranja.actual();
  // Dónde empieza el chat, ya pasada la línea de la barra lateral: la primera pestaña nace ahí.
  const [bordeDeLaBarra, setBordeDeLaBarra] = createSignal<number | null>(null);
  const medirBordeDeLaBarra = (el: HTMLDivElement) => {
    const medir = () => setBordeDeLaBarra(el.getBoundingClientRect().left || null);
    const ojo = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(medir);
    // Con la conversación en su ancho base, la barra se encoge y este borde se mueve sin que cambie su tamaño.
    queueMicrotask(() => {
      const caja = el.parentElement;
      for (const parte of caja ? [caja, ...caja.children] : [el]) ojo?.observe(parte);
      medir();
    });
    onCleanup(() => ojo?.disconnect());
  };
  const activeSpace = () => spaces().find((i) => i.id === escritorio()) ?? null;
  const multipleSpaces = () => spaces().length > 1;
  // El sidebar de la vez anterior, pintado antes del primer IPC e inerte hasta que el motor lo confirma.
  const shellCache = readShellCache();
  const [enCache, setEnCache] = createSignal(shellCache !== null);
  if (shellCache) {
    batch(() => {
      projectCatalog.fromCache(shellCache.projects);
      setSesiones(shellCache.sessions);
      setSpaces(shellCache.spaces);
      setEscritorio(shellCache.desk);
    });
  }
  createEffect(() => {
    const rows = rawSpaces();
    const catalog = spaceCatalog.catalog();
    const currentSessions = rawSesiones();
    if (enCache() || bloqueo() || !catalog) return;
    if (rows.length > 0 && catalog.version === 0 && catalog.spaces.length === 0) {
      void spaceCatalog.sync(rows, currentSessions);
      return;
    }
    if (catalog.spaces.length > 0) {
      spaceCatalog.scheduleBackfill(currentSessions);
    }
  });
  const guardarCache = shellCacheWriter();
  createEffect(() => {
    const workspace = workspaceActivo();
    const snapshot = { workspace, projects: projectList(), sessions: sesiones(), spaces: spaces(), desk: escritorio() };
    if (enCache() || bloqueo() || !workspace) return;
    // A mitad de un cambio de workspace las filas aún son del anterior: esa foto no se guarda.
    const carpetas = ["", ...snapshot.projects.map((p) => p.id)];
    const leidas = Object.keys(snapshot.sessions);
    if (leidas.length !== carpetas.length || !carpetas.every((c) => c in snapshot.sessions)) {
      guardarCache.cancel();
      return;
    }
    guardarCache.save({ ...snapshot, workspace });
  });
  window.addEventListener("pagehide", guardarCache.flush);
  onCleanup(() => window.removeEventListener("pagehide", guardarCache.flush));
  // Cuándo enseña tareas el sidebar, en `window.log`: el arranque se mide desde aquí.
  const pintadoDesde = new Set<string>();
  createEffect(() => {
    const source = enCache() ? "cache" : "engine";
    if (pintadoDesde.has(source) || !Object.values(sesiones()).some((filas) => filas.length > 0)) return;
    pintadoDesde.add(source);
    requestAnimationFrame(() =>
      void callShellEngine("window_painted", { at: Math.round(performance.now()), source }).catch(() => {}));
  });
  // `null` cerrado; si no, el chip con el que abre el buscador global.
  const [buscando, setBuscando] = createSignal<SearchFilter | null>(null);
  // Los visores se recorren por id y no por el objeto abierto: `For`
  // compara por referencia, y marcar un archivo como cambiado —al
  // guardarlo— crea un objeto nuevo. Eso desmontaría y volvería a montar
  // su visor, tirando el desplazamiento y pidiendo el archivo otra vez.
  const idsDeContenido = createMemo(() =>
    pestanas.open().filter(isContentTab).map((p) => p.id),
  );

  return { activeSpace, bordeDeLaBarra, buscando, enCache, escritorio, guardarCache, idsDeContenido, medirBordeDeLaBarra, multipleSpaces, pestanaActiva, rawSpaces, sesiones, setBuscando, setEnCache, setEscritorio, setSidebarFilter, setSpaces, shellCache, sidebarFilter, spaceCatalog, spaceOrder, spaces, workspaceActual, workspacesDeLaFranja };
}
