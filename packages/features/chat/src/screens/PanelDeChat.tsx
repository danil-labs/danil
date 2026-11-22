import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { type Agent, type Project, type Source } from "../../../../../apps/desktop/src/lib/model.ts";
import { sameSite, type PanelSite as SitioDePanel } from "../../../../../apps/desktop/src/lib/panels";
import { type ContentTab, type FileTab, type Tab, type TaskTab } from "../../../../../apps/desktop/src/lib/tabs.ts";
import { type TaskSideMode } from "../../../../../apps/desktop/src/lib/taskFiles";
import { type TaskFilesPanel, type TaskFilesSide } from "../../../../../apps/desktop/src/lib/taskFiles.ts";
import { isWindows } from "../../../../host/src/window";
import { Button } from "../../../../ui/src/Button";
import { BotonConAtajo } from "../../../../ui/src/Shortcut";
import { type PreguntasAMedias } from "../components/Questions.tsx";
import { type Lectura } from "../model/threadWindow";
import { type VistaDeLaConversacion, vistaNueva } from "./Chat";
import { type PermissionRequest } from "./Chat.tsx";
import { type DelegatedPanelModel } from "./DelegatedTasks";
import { type SearchSurface, type ThreadSearchTarget } from "./ThreadSearch";
import FolderOpen from "lucide-solid/icons/folder-open";
import { For, Show, Suspense, createMemo, createSignal, type Accessor, type JSX, type Setter } from "solid-js";
import type { CerrarBorrador, CreateUsage, EnBorrador, Hilo, MandarVentana, MarcaDe, Paneles, PestanaDelanteEn, PestanasDe, PickedAt, ProjectPlace, SessionRow, TapadoPorElProyecto, VueltaDelBorrador } from "../queries/types.js";


/** Lo que el bloque usaba del cuerpo de App. */
export type PanelDeChatDeps = { createUsage: CreateUsage; EmptyContext: (props: { onPickFolder: () => void; onConnect: () => void; }) => JSX.Element; MachinePicker: ((props: { workspace: string | null; project?: ProjectPlace; onChange?: () => void; }) => JSX.Element) & { preload: () => Promise<{ default: (props: { workspace: string | null; project?: ProjectPlace; onChange?: () => void; }) => JSX.Element; }>; }; ProjectPicker: (props: { branch?: JSX.Element; locked?: boolean; projects: Project[]; project: string; sources: Source[]; onPick: (id: string) => void; onNuevoProyecto: () => void; onAdministrar?: () => void; machine?: JSX.Element; activity?: Record<string, number>; picked?: PickedAt; hidden?: ReadonlySet<string>; onShow?: (id: string) => void; taskCounts?: Record<string, number>; }) => JSX.Element; TabStrip: (props: { tabs: Tab[]; pinnedIds?: ReadonlySet<string>; onPin?: (id: string) => void; session: (id: string) => SessionRow | undefined; activeId: string | null; liveIds: string[]; approvingIds: string[]; waitingIds: string[]; onPick: (id: string) => void; onClose: (id: string) => void; dirtyIds: ReadonlySet<string>; onCloseMany: (ids: string[]) => void; canReopen: boolean; onReopen: () => void; onDrag?: (id: string, e: PointerEvent) => void; dropIndex?: number | null; draftLabel?: string; onCloseDraft?: () => void; }) => JSX.Element; activarPestana: (p: Tab) => Promise<void>; actividadDeProyectos: Accessor<Record<string, number>>; agent: Accessor<string>; agents: Accessor<Agent[]>; archivosDeTarea: { panel: (task: string) => TaskFilesPanel; setOpen: (task: string, open: boolean) => void; present: (task: string, mode: TaskSideMode) => void; toggle: (task: string) => void; setExpanded: (task: string, expanded: boolean) => void; setTree: (task: string, tree: boolean) => void; setSide: (task: string, side: TaskFilesSide) => void; open: (task: string, file: { tree: string; path: string; changes: boolean; changed?: boolean; pinned?: boolean; }) => void; pin: (task: string, id: string) => void; activate: (task: string, id: string) => void; setDirty: (task: string, id: string, dirty: boolean) => void; close: (task: string, ids: string[]) => string[]; renamed: (task: string, tree: string, from: string, to: string) => void; removed: (task: string, tree: string, path: string) => void; dirtyOf: (task: string) => string[]; forget: (task: string) => void; }; arrastrarPestana: (id: string, event: PointerEvent) => void; botonDeNuevaPestana: () => JSX.Element; busy: () => boolean; cargandoHilo: Accessor<string | null>; carpetaDelProyecto: () => string | null; celdaDe: (id: string) => { "grid-column": string; "grid-row": string; } | undefined; cerrarBorrador: CerrarBorrador; cerrarPestana: (id: string) => void; cerrarPestanas: (ids: string[]) => void; composerProjects: Accessor<Project[]>; contextConfirmed: Accessor<boolean>; contextRoot: Accessor<string | null>; cuentasTocadas: Accessor<number>; elegidosAqui: () => PickedAt; elegirCarpetaDelWorkspace: () => Promise<void>; elegirProyecto: (name: string) => void; enBorrador: EnBorrador; filaDe: (id: string) => SessionRow | undefined; hilos: Accessor<Record<string, Hilo>>; llaveDeBorrador: (proyecto: string | undefined) => string; mandarVentana: MandarVentana; marcaDe: MarcaDe; materialError: Accessor<string | null>; ocultarDelSelector: (id: string, ocultar: boolean) => void; ocultosAqui: Accessor<Set<string>>; paginaDeAgente: () => boolean; paneles: Paneles; permissions: Accessor<PermissionRequest[]>; pestanaDelanteEn: PestanaDelanteEn; pestanas: { pinned: Accessor<ReadonlySet<string>>; isPinned: (id: string) => boolean; pin: (id: string) => void; restorable: () => string[]; replacePreviews(groups: readonly (readonly string[])[], visible: readonly (string | null)[]): void; open: Accessor<Tab[]>; active: Accessor<string | null>; activeTab: () => Tab | null; load(ws: string | null, desk?: string | null): string | null; ensure(p: { id: string; project: string; titulo: string; }): void; commitDraft(draft: string, p: { id: string; project: string; titulo: string; }): void; openObservability(title: string): void; openScreen(machine: string, title: string): void; openContent(p: ContentTab): void; activate: (id: string | null) => void; close: (id: string) => Tab | null; closeMany: (ids: readonly string[], opts?: { remember?: boolean; }) => Tab | null; canReopen: () => boolean; reopen(alive: (p: Tab) => boolean): Tab | null; attachPreviewFiles(project: string, session: string, tree: string): [string, string][]; renameFiles(session: string, tree: string, from: string, end: string): [string, string][]; navigate(id: string, url: string): void; moveToProject(session: string, project: string): void; markChanged(id: string): void; dirty: Accessor<ReadonlySet<string>>; setDirty(id: string, dirty: boolean): void; registerSaver(id: string, save: (() => Promise<boolean>) | null): void; dirtyTabsToClose(ids: string | readonly string[]): FileTab[]; saveFiles(ids: string[]): Promise<boolean>; sync(find: (id: string) => { project: string; titulo: string; } | null): string[]; }; pestanasDe: PestanasDe; preguntadas: Accessor<string[]>; project: Accessor<string>; projectList: Accessor<Project[]>; proyectoAbierto: Accessor<string | null>; reabrirPestana: () => void; recargarMaterial: () => Promise<void>; recordarEleccion: (id: string) => void; setAnadiendoCarpeta: Setter<boolean>; setDraftBases: Setter<Record<string, string>>; setPreguntasAMedias: Setter<ReadonlyMap<string, PreguntasAMedias>>; setReadRevision: Setter<number>; setSettings: Setter<string | null>; soltarPreguntas: (session: string, turno?: string) => ReadonlyMap<string, PreguntasAMedias>; sources: Accessor<Source[]>; tapadoPorElProyecto: TapadoPorElProyecto; tareasActivas: Accessor<Record<string, number>>; tareasEnVentanas: Accessor<(Pick<TaskTab, "id" | "session"> & { workspace: string | null; })[]>; taskSourcesError: Accessor<string | null>; vivas: Accessor<string[]>; vueltaDelBorrador: VueltaDelBorrador; workspaceActivo: Accessor<string | null> };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 5726–5970, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createPanelDeChat(deps: PanelDeChatDeps) {
  const { createUsage, EmptyContext, MachinePicker, ProjectPicker, TabStrip, activarPestana, actividadDeProyectos, agent, agents, archivosDeTarea, arrastrarPestana, botonDeNuevaPestana, busy, cargandoHilo, carpetaDelProyecto, celdaDe, cerrarBorrador, cerrarPestana, cerrarPestanas, composerProjects, contextConfirmed, contextRoot, cuentasTocadas, elegidosAqui, elegirCarpetaDelWorkspace, elegirProyecto, enBorrador, filaDe, hilos, llaveDeBorrador, mandarVentana, marcaDe, materialError, ocultarDelSelector, ocultosAqui, paginaDeAgente, paneles, permissions, pestanaDelanteEn, pestanas, pestanasDe, preguntadas, project, projectList, proyectoAbierto, reabrirPestana, recargarMaterial, recordarEleccion, setAnadiendoCarpeta, setDraftBases, setPreguntasAMedias, setReadRevision, setSettings, soltarPreguntas, sources, tapadoPorElProyecto, tareasActivas, tareasEnVentanas, taskSourcesError, vivas, vueltaDelBorrador, workspaceActivo } = deps;
  /** El proyecto que ocupa el panel principal, ya resuelto. */
  const proyectoDeLaVista = () =>
    projectList().find((p) => p.id === proyectoAbierto()) ?? null;

  // Una conversación escondida recibe el streaming de su turno y retiene todo
  // lo que se leyó en ella: solo se monta la que se ve. Volver a una desmontada
  // la pinta desde `hilos`, la deja en su `lectura` y con lo plegado en su `vista`.
  const seVeLaTarea = (id: string) =>
    celdaDe(id) !== undefined && !tapadoPorElProyecto(paneles.siteOf(id));
  // Mueren al cerrar la pestaña y no al dejar de verse: una pestaña de otra tira
  // o de otro workspace sigue abierta.
  const lecturas = new Map<string, Lectura>();
  const vistas = new Map<string, VistaDeLaConversacion>();
  const vistaDe = (session: string) => {
    const hay = vistas.get(session);
    if (hay) return hay;
    const nueva = vistaNueva();
    vistas.set(session, nueva);
    return nueva;
  };
  const montadas = createMemo<Set<string>>(() => {
    // La que acaba de abrirse todavía no tiene ventana: montarla ya y no un
    // efecto después ahorra pintar dos veces su apertura (`open-task-cost`).
    // Y una ventana que no manda y no tiene hilo —ni viene en camino— es de un
    // reparto que volvió: montarla pintaría una conversación vacía que no es la
    // suya. Se monta al pulsarla, que es cuando su lectura sale (`abrirSesion`).
    const visibles = tareasEnVentanas().filter((p) => {
      const sitio = paneles.siteOf(p.id);
      if (!sitio) return true;
      if (!seVeLaTarea(p.id)) return false;
      return (
        sameSite(sitio, paneles.activeSite()) ||
        hilos()[p.id] !== undefined ||
        cargandoHilo() === p.id
      );
    });
    return new Set(visibles.map((p) => p.id));
  }, new Set(), { equals: (a, b) => a.size === b.size && [...a].every((id) => b.has(id)) });
  const guardarLectura = (session: string | null, lectura: Lectura | null) => {
    if (!session) return;
    if (lectura) lecturas.set(session, lectura);
    else lecturas.delete(session);
  };
  function olvidarPestana(session: string) {
    const soltar = () => {
      lecturas.delete(session);
      vistas.delete(session);
    };
    soltar();
    // Su conversación puede desmontarse después, en la misma actualización, y
    // entregar entonces su lectura.
    queueMicrotask(soltar);
    soltarPreguntas(session);
  }
  // Al nacer, la pestaña cambia de id y su celda se recrea con el nuevo: lo suyo
  // se muda antes, para que la celda nueva lo encuentre.
  function mudarPestana(de: string, a: string) {
    const vista = vistas.get(de);
    if (vista && !vistas.has(a)) vistas.set(a, vista);
    const lectura = lecturas.get(de);
    if (lectura && !lecturas.has(a)) lecturas.set(a, lectura);
    setPreguntasAMedias((m) => {
      const suyas = [...m].filter(([k]) => k.startsWith(`${de}\u0000`));
      if (suyas.length === 0) return m;
      const mudado = new Map(m);
      for (const [k, v] of suyas) {
        mudado.delete(k);
        mudado.set(`${a}${k.slice(de.length)}`, v);
      }
      return mudado;
    });
  }

  /**
   * Con qué proyecto se trabaja, debajo de la caja y no en la cabecera.
   * Componente y no variable con JSX (SYSTEM.md § Las reglas de Solid,
   * regla 9): se pasa como prop a `Chat`.
   */
  const SelectorDeProyecto = (props: { branch?: JSX.Element; locked?: boolean; nueva?: boolean }) => (
    // Del ancho de la caja, no del contenido: `justify-items-center` encoge
    // la rejilla a su hijo más ancho —el aviso «sin fuente de contexto»,
    // 416 px— y la franja del proyecto (`w-full`) queda a esos 416 px bajo
    // una caja de 856: control suelto y centrado, lo que `ProjectPicker` evita.
    <div class="grid w-full max-w-[860px] gap-1">
        <ProjectPicker
          branch={props.branch}
          locked={props.locked}
          projects={props.nueva ? composerProjects() : projectList()}
          project={project()}
          sources={sources()}
          activity={actividadDeProyectos()}
          picked={elegidosAqui()}
          hidden={ocultosAqui()}
          onShow={(id) => ocultarDelSelector(id, false)}
          taskCounts={tareasActivas()}
          onPick={(id) => {
            recordarEleccion(id);
            elegirProyecto(id);
          }}
          onNuevoProyecto={() => setAnadiendoCarpeta(true)}
          onAdministrar={() => setSettings("proyectos")}
          // Solo al crear: una tarea abierta ya vive en la máquina que la corre.
          machine={
            <Show when={props.nueva && !props.locked}>
              {/* Su propio límite: mientras carga, el resto de la vista sigue. */}
              <Suspense fallback={null}>
                <MachinePicker
                  workspace={workspaceActivo()}
                  project={projectList().find((p) => p.id === project())}
                  onChange={() => {
                    setDraftBases({});
                    elegirProyecto("");
                  }}
                />
              </Suspense>
            </Show>
          }
        />
      {/* A General, no a GitHub: la fuente principal del workspace se elige
          en Configuración → General; mandar a GitHub lleva a conectar un
          proveedor, dejando a la persona en una pantalla sin lo que buscaba. */}
      <Show when={taskSourcesError() ?? materialError()}>{failure => <div class="flex items-center gap-2 text-caption text-neutral-500" data-material-status="" role="status">
        <span>{failure()}</span>
        <Button variant="ghost" size="compact" onClick={() => { setReadRevision(n => n + 1); void recargarMaterial(); }}>{t("common.part.retry")}</Button>
      </div>}</Show>
      <Show when={contextConfirmed() && !contextRoot()}>
        <div class="justify-self-center">
          <EmptyContext
            onPickFolder={() => void elegirCarpetaDelWorkspace()}
            onConnect={() => setSettings("general")}
          />
        </div>
      </Show>
    </div>
  );

  /**
   * El atajo tal y como se escribe en el tooltip. Va en el rótulo del botón:
   * es lo único que enseña `⌘D` sin una pantalla de ayuda dedicada.
   */
  const atajoDePartir = (junta: boolean) =>
    isWindows()
      ? `Ctrl+${junta ? "Shift+" : ""}D`
      : `\u2318${junta ? "\u21e7" : ""}D`;

  /**
   * Cómo se nombra el botón de separar, con su atajo dentro: con una sola
   * pestaña no hay «otra cosa» que ver aparte, y un botón apagado sin motivo
   * se lee como un fallo (`AGENTS.md` § Diseño).
   */
  const nombreDeSeparar = (sitio: SitioDePanel) => {
    if (paginaDeAgente()) return t("projects.split.agent_page");
    if (!paneles.canSplit()) return t("projects.split.full");
    if (paneles.activeTabAt(sitio) === null)
      return t("projects.split.alone");
    return t("projects.split.detach", { key: atajoDePartir(false) });
  };

  /**
   * La conversación de UNA tarea, para poder montar más de una: se
   * pinta en el panel principal y en cada tarea separada
   * (`lib/panels.ts`), cada una con su sesión (SYSTEM.md § Las reglas
   * de Solid, regla 9). Arma su propia transcripción, no lee `msgs()`.
   */
  const [threadSearchTargets, setThreadSearchTargets] = createSignal(new Map<string, ThreadSearchTarget>());
  const [searchSurfaces, setSearchSurfaces] = createSignal(new Map<string, SearchSurface>());
  const [delegatedPanels, setDelegatedPanels] = createSignal(new Map<string, () => DelegatedPanelModel>());
  const consumo = createUsage({ agents, agent, busy, reload: cuentasTocadas });
  // Una sola ventana: sus pestañas van en la franja de la ventana, entre la navegación y los controles.
  const tiraDeLaVentana = () => (
          <div
            class="flex min-w-0 flex-1 items-center self-stretch"
            data-tauri-drag-region=""
            data-tira=""
            data-ventana="0,0"
            onPointerDown={() => mandarVentana({ col: 0, fila: 0 })}
          >
            <For each={paneles.columns().map((_: unknown, col: number) => ({ col, fila: 0 }))}>
              {(sitio) => (
                <TabStrip
                  session={filaDe}
                  tabs={pestanasDe(sitio)}
                  pinnedIds={pestanas.pinned()}
                  onPin={pestanas.pin}
                  activeId={pestanaDelanteEn(sitio)}
                  draftLabel={enBorrador(sitio) ? t("projects.tabs.draft") : undefined}
                  onCloseDraft={vueltaDelBorrador(sitio) !== null ? () => cerrarBorrador(sitio) : undefined}
                  liveIds={/* chat */ vivas()}
                  approvingIds={permissions().map((p) => p.session)}
                  waitingIds={preguntadas()}
                  onPick={(id) => {
                    const p = pestanas.open().find((x) => x.id === id);
                    if (p) void activarPestana(p);
                  }}
                  onClose={cerrarPestana}
                  dirtyIds={pestanas.dirty()}
                  onCloseMany={/* chat */ cerrarPestanas}
                  canReopen={pestanas.canReopen()}
                  onReopen={reabrirPestana}
                  onDrag={arrastrarPestana}
                  dropIndex={marcaDe(sitio)}
                />
              )}
            </For>
            {botonDeNuevaPestana()}
          </div>
  );
  // En una tarea, el conmutador del panel derecho abre sus archivos dentro de la tarea.
  // La sesión llega como accesor: leída al llamar, cada cambio de tarea volvería a montar el botón.
  const muestra = (id: string, mode: TaskSideMode) => {
    const panel = archivosDeTarea.panel(id);
    return !!id && panel.open && panel.mode === mode;
  };
  const botonDeArchivos = (sesion: () => string) => (
    <BotonConAtajo
      variant={muestra(sesion(), "files") ? "secondary" : "ghost"}
      size="icon"
      class="relative size-[30px] shrink-0 text-neutral-500"
      onClick={() => archivosDeTarea.present(sesion(), "files")}
      aria-pressed={muestra(sesion(), "files")}
      aria-label={t("code.panel.toggle")}
      accion="workTree"
      etiqueta={t("code.panel.toggle")}
    >
      <FolderOpen size={16} />
    </BotonConAtajo>
  );
  // La tarea nueva abre la carpeta del proyecto; sin carpeta no hay nada que enseñar y el botón queda apagado con su porqué.
  const botonDelArbol = () => {
    const llave = () => (carpetaDelProyecto() ? llaveDeBorrador(project()) : "");
    return (
      <BotonConAtajo
        variant={muestra(llave(), "files") ? "secondary" : "ghost"}
        size="icon"
        class="relative size-[30px] shrink-0 text-neutral-500"
        disabled={!llave()}
        onClick={() => archivosDeTarea.present(llave(), "files")}
        aria-pressed={muestra(llave(), "files")}
        aria-label={t("code.panel.toggle")}
        accion="workTree"
        etiqueta={llave() ? t("code.panel.toggle") : t("shell.work_tree.no_session")}
      >
        <FolderOpen size={16} />
      </BotonConAtajo>
    );
  };
  return { SelectorDeProyecto, botonDeArchivos, botonDelArbol, consumo, delegatedPanels, guardarLectura, lecturas, montadas, mudarPestana, muestra, nombreDeSeparar, olvidarPestana, proyectoDeLaVista, searchSurfaces, setDelegatedPanels, setSearchSurfaces, setThreadSearchTargets, threadSearchTargets, tiraDeLaVentana, vistaDe };
}
