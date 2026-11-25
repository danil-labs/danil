import { t } from "../../../ui/src/lib/i18n";
import { type Project, type Source } from "../../../ui/src/lib/model.ts";
import { sameSite, type PanelSite as SitioDePanel, type Side as PanelSide } from "../../../ui/src/lib/panels";
import { type Layout, type PanelGroup } from "../../../ui/src/lib/panels-types.ts";
import { createPointerDrag } from "../../../ui/src/lib/pointer-drag";
import { type Space } from "../../../ui/src/lib/spaces.ts";
import { isTaskTab } from "../../../ui/src/lib/tabs";
import { type ContentTab, type FileTab, type Tab } from "../../../ui/src/lib/tabs-types.ts";
import { esProvisional } from "../../../ui/src/lib/taskDraft";
import { type TaskFiles } from "../../../ui/src/lib/taskFiles.ts";
import { arbolesDe, contiene, ubicar } from "../../../features/code/src/queries/treeKind";
import { machineName, machineOf, machines, senderTaskId, setRunOn } from "../../../features/machines/src/queries/store";
import { createSessionMutations, type createDeskStrip as T_createDeskStrip, type createWorkspaceSession as T_createWorkspaceSession } from "../../../features/projects/src";
import { type SessionRow } from "../../../features/projects/src/screens/Sessions";
import { NewTabButton } from "../../../features/projects/src/screens/Tabs";
import { type WorkspaceStore } from "../../../features/projects/src/screens/workspace-session.ts";
import { capabilities } from "../../../host/src/platform";
import { esDeCodigo } from "../../../ui/src/lib/workdirKind";
import { type Accessor, type Setter } from "solid-js";


/** Lo que el bloque usaba del cuerpo de App. */
export type TabDragDeps = { abrirBorradorDeAgente: (enProyecto: string, name: string) => void; abrirSesion: (proyecto: string, id: string, activar?: string, propagateError?: boolean) => Promise<void>; activarPestana: (p: Tab) => Promise<void>; activeSpace: () => Space | null; archivosDeTarea: TaskFiles; cerrarPestana: (id: string) => void; claveAbierta: () => string; contextConfirmed: Accessor<boolean>; deLaTarea: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; draftBases: Accessor<Record<string, string>>; draftOptions: () => { headers: { "x-terminus-machine": string; }; } | undefined; drafts: ReturnType<typeof T_createDeskStrip>["drafts"]; escritorio: Accessor<string | null>; filaDe: (id: string) => SessionRow | undefined; folder: Accessor<string | null>; irAlBlanco: (enProyecto?: string) => void; maquinaDeLaVentana: () => string; nuevaSesion: (enProyecto?: string) => void; olvidarPestana: (session: string) => void; opcionesDeLaTarea: (id: string | null | undefined, workspace: string | null | undefined) => { headers: { [k: string]: string; }; }; paneles: { columns: Accessor<PanelGroup[][]>; widths: Accessor<number[]>; heights: Accessor<number[]>; rowCount: () => number; activeSite: Accessor<SitioDePanel>; sites: () => SitioDePanel[]; siteOf: (id: string) => SitioDePanel | null; groupAt: (site: SitioDePanel) => PanelGroup | null; groupCount: () => number; rowsPerColumn: () => number[]; isSplit: () => boolean; canSplit: () => boolean; tabsAt: (site: SitioDePanel) => string[]; activeTabAt: (site: SitioDePanel) => string | null; isVisible: (id: string) => boolean; focus(site: SitioDePanel): void; showDraft(): void; activate(id: string): void; renameTabs(pairs: [string, string][]): void; placeLikeStrip(ids: string[], strip: string[]): void; sync(ids: string[]): boolean; close(id: string): string | null; move: (id: string, a: SitioDePanel, index?: number) => boolean; split: (id: string) => boolean; canSplitAt: (id: string, reference: SitioDePanel, side: PanelSide, unplaced?: boolean) => boolean; splitAt: (id: string, reference: SitioDePanel, side: PanelSide) => boolean; join: () => boolean; resizeColumns(i: number, a: number, b: number): void; resizeRows(i: number, a: number, b: number): void; layout: () => Layout; restore(layout: Layout | null, live: readonly string[]): void; bindTo(workspace: string | null, space: string | null): void; reset(): void; }; pestanas: { pinned: Accessor<ReadonlySet<string>>; isPinned: (id: string) => boolean; pin: (id: string) => void; restorable: () => string[]; replacePreviews(groups: readonly (readonly string[])[], visible: readonly (string | null)[]): void; open: Accessor<Tab[]>; active: Accessor<string | null>; activeTab: () => Tab | null; load(ws: string | null, desk?: string | null): string | null; ensure(p: { id: string; project: string; titulo: string; }): void; commitDraft(draft: string, p: { id: string; project: string; titulo: string; }): void; openScreen(machine: string, title: string): void; openContent(p: ContentTab): void; activate: (id: string | null) => void; close: (id: string) => Tab | null; closeMany: (ids: readonly string[], opts?: { remember?: boolean; }) => Tab | null; canReopen: () => boolean; reopen(alive: (p: Tab) => boolean): Tab | null; attachPreviewFiles: (project: string, session: string, tree: string) => [string, string][]; renameFiles: (session: string, tree: string, from: string, end: string) => [string, string][]; navigate(id: string, url: string): void; moveToProject(session: string, project: string): void; markChanged: (id: string) => void; dirty: Accessor<ReadonlySet<string>>; setDirty: (id: string, dirty: boolean) => void; registerSaver: (id: string, save: (() => Promise<boolean>) | null) => void; dirtyTabsToClose: (ids: string | readonly string[]) => FileTab[]; saveFiles: (ids: string[]) => Promise<boolean>; sync(find: (id: string) => { project: string; titulo: string; } | null): string[]; }; pestanasEnPantalla: Accessor<Tab[]>; project: Accessor<string>; projectCatalog: ReturnType<typeof T_createWorkspaceSession>["projectCatalog"]; projectList: Accessor<Project[]>; proyectoAbierto: Accessor<string | null>; readRevision: Accessor<number>; refreshSessions: (proyectos: string[]) => Promise<void>; retirarNaciendo?: (id: string) => void; sesiones: Accessor<Record<string, SessionRow[]>>; sessionId: Accessor<string | null>; setError: Setter<string | null>; setProject: Setter<string>; setProyectoAbierto: Setter<string | null>; setRetoques: Setter<Record<string, { cambio: Partial<SessionRow>; n: number; }>>; setSesiones?: Setter<Record<string, SessionRow[]>>; setTaskSources: Setter<Source[] | null>; setTaskSourcesError: Setter<string | null>; soltarHilo: (session: string) => void; sources: Accessor<Source[]>; threads: ReturnType<typeof T_createDeskStrip>["threads"]; workspaceActivo: Accessor<string | null>; workspaceContext: WorkspaceStore };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 669–847, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createTabDrag(deps: TabDragDeps) {
  const { abrirBorradorDeAgente, abrirSesion, activarPestana, activeSpace, archivosDeTarea, cerrarPestana, claveAbierta, contextConfirmed, deLaTarea, draftBases, draftOptions, drafts, escritorio, filaDe, folder, irAlBlanco, nuevaSesion, opcionesDeLaTarea, paneles, pestanas, pestanasEnPantalla, project, projectCatalog, projectList, proyectoAbierto, readRevision, refreshSessions, retirarNaciendo, sesiones, sessionId, setError, setProject, setProyectoAbierto, setRetoques, setSesiones, setTaskSources, setTaskSourcesError, soltarHilo, sources, threads, workspaceActivo, workspaceContext } = deps;
  const maquinaDeLaVentana: TabDragDeps["maquinaDeLaVentana"] = (...a: Parameters<TabDragDeps["maquinaDeLaVentana"]>) => deps.maquinaDeLaVentana(...a);
  const olvidarPestana: TabDragDeps["olvidarPestana"] = (...a: Parameters<TabDragDeps["olvidarPestana"]>) => deps.olvidarPestana(...a);
  /**
   * Qué zona del cuerpo de una ventana hay bajo el cursor: sus cuatro bordes
   * parten hacia ahí y el medio mueve. Se mide contra el rectángulo real y no
   * contra un tamaño fijo: un panel repartido es más estrecho que su vecino.
   */
  function edgeZone(el: Element, x: number, y: number) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return "center" as const;
    const qx = (x - r.left) / r.width;
    const qy = (y - r.top) / r.height;
    const m = 0.25;
    if (qx > m && qx < 1 - m && qy > m && qy < 1 - m) return "center" as const;
    const sides: [PanelSide, number][] = [
      ["left", qx],
      ["right", 1 - qx],
      ["up", qy],
      ["down", 1 - qy],
    ];
    return sides.reduce((best, c) => (c[1] < best[1] ? c : best))[0];
  }

  /**
   * Qué ventana hay bajo el cursor, y en qué hueco de su tira o en qué zona de
   * su cuerpo. Se pregunta al documento y no a un `dragover` por elemento: el
   * gesto lo conduce `window`, y `elementFromPoint` hace que soltar valga tanto
   * sobre la tira como sobre el cuerpo del cuadrante.
   */
  function ventanaBajo(x: number, y: number) {
    const leer = (el: Element) => {
      const [col, fila] = (el.getAttribute("data-ventana") ?? "")
        .split(",")
        .map(Number);
      return Number.isFinite(col) && Number.isFinite(fila)
        ? { col, fila }
        : null;
    };
    const el = document.elementFromPoint(x, y);
    const tira = el?.closest?.("[data-tira]");
    if (tira) {
      const sitio = leer(tira);
      if (!sitio) return null;
      // Antes de qué pestaña cae, según de qué lado de ella esté el cursor.
      const tabs = [...tira.querySelectorAll("[data-pestana]")];
      let indice = tabs.length;
      for (let n = 0; n < tabs.length; n++) {
        const r = tabs[n].getBoundingClientRect();
        if (x < r.left + r.width / 2) {
          indice = n;
          break;
        }
      }
      return { sitio, indice };
    }
    const panel = el?.closest?.("[data-ventana]");
    if (!panel) return null;
    const sitio = leer(panel);
    return sitio ? { sitio, zone: edgeZone(panel, x, y) } : null;
  }

  let railDrag: { project: string; row: SessionRow } | null = null;
  const tabDrag = createPointerDrag({
    scope: () => `${workspaceActivo()}\u0000${escritorio()}`,
    canStart: id => pestanas.open().some(tab => tab.id === id) || (railDrag?.row.id === id && !!filaDe(id)),
    locate: point => {
      const panel = ventanaBajo(point.x, point.y);
      if (panel) return { ...panel, folder: undefined as string | undefined };
      const folder = railDrag && !railDrag.row.parent && !railDrag.row.chat_de_agente
        ? document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>("[data-destino]")?.dataset.destino
        : undefined;
      return folder !== undefined && folder !== railDrag?.project
        ? { sitio: paneles.activeSite(), indice: undefined, zone: undefined, folder }
        : null;
    },
    scroll(point) {
      const element = document.elementFromPoint(point.x, point.y)
        ?.closest("[data-tira]")?.querySelector<HTMLElement>("[data-tab-scroll]");
      if (element) return { element, axis: "x" };
      const rail = railDrag ? document.elementFromPoint(point.x, point.y)
        ?.closest<HTMLElement>("[data-arrastre-scroll]") : null;
      return rail ? { element: rail, axis: "y" } : null;
    },
    drop(id, destino) {
      if (destino.folder !== undefined && railDrag) {
        void moverSesion(railDrag.project, id, destino.folder);
        return;
      }
      if (railDrag && !pestanas.open().some(tab => tab.id === id)) {
        pestanas.ensure({ id, project: railDrag.project, titulo: railDrag.row.title });
        paneles.sync(pestanas.open().map(tab => tab.id));
      }
      if (destino.zone && destino.zone !== "center" && paneles.splitAt(id, destino.sitio, destino.zone)) {
        pestanas.pin(id);
        const p = pestanas.open().find(tab => tab.id === id);
        if (p) void activarPestana(p);
        return;
      }
      const from = paneles.siteOf(id);
      const index = destino.indice;
      const strip = paneles.tabsAt(destino.sitio).filter(pestanas.isPinned);
      const origin = strip.indexOf(id);
      const insertion = index !== undefined && sameSite(from, destino.sitio) && origin >= 0 && origin < index
        ? index - 1
        : index;
      soltarPestana(id, destino.sitio, insertion);
    },
  });
  const arrastrando = tabDrag.source;
  const cursor = tabDrag.cursor;
  const donde = () => {
    const destination = tabDrag.destination();
    return destination?.folder === undefined ? destination : null;
  };
  const arrastrarPestana = (id: string, event: PointerEvent) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    railDrag = null;
    tabDrag.start(id, event);
  };
  const arrastrarTarea = (project: string, row: SessionRow, event: PointerEvent) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    if (esProvisional(row.id) || (row.workspace && row.workspace !== workspaceActivo())) return;
    railDrag = { project, row };
    tabDrag.start(row.id, event);
  };

  /**
   * Cómo se llama una pestaña, para el fantasma del arrastre. La tira
   * compone el suyo con la carpeta cuando dos archivos se llaman igual;
   * aquí basta el nombre: solo hay que reconocer qué se está moviendo.
   */
  const tituloDePestana = (id: string) => {
    const p = pestanasEnPantalla().find((x) => x.id === id);
    if (!p) return railDrag?.row.id === id ? railDrag.row.title : "";
    if (isTaskTab(p)) return p.titulo;
    if (p.clase === "pantalla" || p.clase === "plugin") return p.titulo;
    if (p.clase === "sitio" && !p.url) return t("sites.new_tab");
    const r = p.clase === "archivo" ? p.ruta : p.clase === "artefacto" ? p.rel : p.url;
    return r.slice(r.lastIndexOf("/") + 1);
  };

  /** Dónde cae la marca dentro de la tira de `sitio`, o `null`. */
  const marcaDe = (sitio: SitioDePanel) => {
    const d = donde();
    return d && sameSite(d.sitio, sitio) ? (d.indice ?? null) : null;
  };

  /**
   * El lado por el que caería la pestaña arrastrada, o `null` si cae dentro o
   * sobre una tira. Solo hay lado si la rejilla lo admite: cuando no cabe, el
   * marco de siempre dice «entra aquí» y soltar mueve.
   */
  const dropSide = () => {
    const d = donde();
    const id = arrastrando();
    if (!d?.zone || d.zone === "center" || !id) return null;
    return paneles.canSplitAt(id, d.sitio, d.zone, railDrag?.row.id === id) ? d.zone : null;
  };

  /**
   * Suelta una pestaña arrastrada en una ventana y la pone delante.
   * Arrastrar no desmonta nada: los visores cuelgan del mismo padre y
   * solo cambia su celda (`features/shell/Panels.tsx`), lo que permite
   * arrastrar un archivo con cambios sin guardar.
   */
  function soltarPestana(id: string, a: SitioDePanel, indice?: number) {
    if (!paneles.groupAt(a)) return;
    pestanas.pin(id);
    const kept = paneles.tabsAt(a).filter((x) => x !== id && pestanas.isPinned(x));
    const before = indice === undefined ? undefined : kept[indice];
    const position = before === undefined ? undefined : paneles.tabsAt(a).filter((x) => x !== id).indexOf(before);
    paneles.move(id, a, position);
    const p = pestanas.open().find((x) => x.id === id);
    if (p) void activarPestana(p);
  }

  const { deleteTarget, setDeleteTarget, setDeletingEditors, editorDeletionLocked, deleteTask, deletedTaskMembers, dirtyTaskFiles, moverSesion, etaparSesion, fijarSesion, renombrarSesion, adjuntarFuente, quitarFuente, taskMaterialOptions, materialTarget, cambiarRama, abrirRuta, archivoMovido, archivoBorrado, reatarVistaPrevia, abrirEnlace, abrirNavegador, carpetasDelMas, abrirSitio, abrirPorRel, exportarChat, forkDesde, } = createSessionMutations({ abrirBorradorDeAgente, abrirSesion, activarPestana, activeSpace, arbolesDe, archivosDeTarea, capabilities, cerrarPestana, claveAbierta, contiene, contextConfirmed, deLaTarea, draftBases, draftOptions, drafts, esDeCodigo, filaDe, folder, irAlBlanco, machineName, machineOf, machines, get maquinaDeLaVentana() { return maquinaDeLaVentana; }, nuevaSesion, olvidarPestana: (session) => olvidarPestana(session), opcionesDeLaTarea, paneles, pestanas, project, projectCatalog, projectList, proyectoAbierto, readRevision, refreshSessions, retirarNaciendo, senderTaskId, sesiones, sessionId, setError, setProject, setProyectoAbierto, setRetoques, setRunOn, setSesiones, setTaskSources, setTaskSourcesError, soltarHilo, sources, threads, ubicar, workspaceActivo, workspaceContext, });


  const botonDeNuevaPestana = () => (
    <NewTabButton
      projects={carpetasDelMas()}
      onNewTask={(id) => nuevaSesion(id)}
      onBrowser={() => abrirNavegador()}
    />
  );
  return { abrirEnlace, abrirPorRel, abrirRuta, abrirSitio, adjuntarFuente, archivoBorrado, archivoMovido, arrastrando, arrastrarPestana, arrastrarTarea, botonDeNuevaPestana, cambiarRama, cursor, deleteTarget, deleteTask, deletedTaskMembers, dirtyTaskFiles, donde, dropSide, editorDeletionLocked, etaparSesion, exportarChat, fijarSesion, forkDesde, marcaDe, materialTarget, moverSesion, quitarFuente, reatarVistaPrevia, renombrarSesion, setDeleteTarget, setDeletingEditors, tabDrag, taskMaterialOptions, tituloDePestana };
}
