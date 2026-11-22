import type { Frase } from "../../../../../apps/desktop/src/lib/prose.ts";
import type { Project, Source } from "../../../../../apps/desktop/src/lib/model.ts";
import type { HiddenProjects, PickedAt } from "../model/recent.ts";
import type { SessionRow } from "./Sessions.tsx";
export function createWorkspaceSession(deps: { activeTaskCounts: <T extends { archived?: boolean | null; }>(tasks: Readonly<Record<string, readonly T[]>>) => Record<string, number>; activityByProject: <T>(tasks: Readonly<Record<string, readonly T[]>>, lastActivity: (task: T) => number) => Record<string, number>; asleep: (error: unknown) => boolean; createAttention: () => { list: import("solid-js").Accessor<import("../../../../shell/src/shell/attention").WorkspaceAttention[]>; of: (workspace: string | null) => import("../../../../shell/src/shell/attention").TaskAttention[]; unseen: (workspace: string | null) => Set<string>; markSeen(workspace: string, session: string): void; }; createEffect: { <Next>(fn: import("solid-js").EffectFunction<undefined | import("solid-js").NoInfer<Next>, Next>): void; <Next, Init = Next>(fn: import("solid-js").EffectFunction<Init | Next, Next>, value: Init, options?: import("solid-js").EffectOptions & { render?: boolean; }): void; }; createMemo: { <Next extends Prev, Prev = Next>(fn: import("solid-js").EffectFunction<undefined | import("solid-js").NoInfer<Prev>, Next>): import("solid-js").Accessor<Next>; <Next extends Prev, Init = Next, Prev = Next>(fn: import("solid-js").EffectFunction<Init | Prev, Next>, value: Init, options?: import("solid-js").MemoOptions<Next>): import("solid-js").Accessor<Next>; }; createPref: <T>(clave: string, porOmision: T) => [import("solid-js").Accessor<T>, (valor: T) => void]; createProjectsStore: (deps: { scope: () => import("../index").ProjectsScope; invoke: <T>(command: string, args?: Record<string, unknown>, options?: { headers: Record<string, string>; }) => Promise<T>; timeoutMs?: number; }) => { rows: import("solid-js").Accessor<Project[]>; readyScope: import("solid-js").Accessor<(import("../index").ProjectsScope & { revision: number; }) | null>; state: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/resource").ResourceState<string, Project[]>>; refresh: () => Promise<Project[]>; changed: () => Promise<Project[]>; fromCache(projects: Project[]): void; workspaceChanged(preserveCached?: boolean): void; discardUnconfirmedCache(): void; readForMachine(machine: string): Promise<Project[]>; rename: (id: string, name: string) => Promise<void>; attach: (id: string, source: string) => Promise<void>; detach: (id: string, source: string) => Promise<void>; workTree: (id: string, dir: string | null) => Promise<void>; remove: (id: string) => Promise<void>; dispose(): void; }; createSignal: { <T>(): import("solid-js").Signal<T | undefined>; <T>(value: T, options?: import("solid-js").SignalOptions<T>): import("solid-js").Signal<T>; }; createTabs: (options?: { transient?: boolean; }) => { pinned: import("solid-js").Accessor<ReadonlySet<string>>; isPinned: (id: string) => boolean; pin: (id: string) => void; restorable: () => string[]; replacePreviews(groups: readonly (readonly string[])[], visible: readonly (string | null)[]): void; open: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/tabs").Tab[]>; active: import("solid-js").Accessor<string | null>; activeTab: () => import("../../../../../apps/desktop/src/lib/tabs").Tab | null; load(ws: string | null, desk?: string | null): string | null; ensure(p: { id: string; project: string; titulo: string; }): void; commitDraft(draft: string, p: { id: string; project: string; titulo: string; }): void; openObservability(title: string): void; openScreen(machine: string, title: string): void; openContent(p: import("../../../../../apps/desktop/src/lib/tabs").ContentTab): void; activate: (id: string | null) => void; close: (id: string) => import("../../../../../apps/desktop/src/lib/tabs").Tab | null; closeMany: (ids: readonly string[], opts?: { remember?: boolean; }) => import("../../../../../apps/desktop/src/lib/tabs").Tab | null; canReopen: () => boolean; reopen(alive: (p: import("../../../../../apps/desktop/src/lib/tabs").Tab) => boolean): import("../../../../../apps/desktop/src/lib/tabs").Tab | null; attachPreviewFiles(project: string, session: string, tree: string): [string, string][]; renameFiles(session: string, tree: string, from: string, end: string): [string, string][]; navigate(id: string, url: string): void; moveToProject(session: string, project: string): void; markChanged(id: string): void; dirty: import("solid-js").Accessor<ReadonlySet<string>>; setDirty(id: string, dirty: boolean): void; registerSaver(id: string, save: (() => Promise<boolean>) | null): void; dirtyTabsToClose(ids: string | readonly string[]): import("../../../../../apps/desktop/src/lib/tabs").FileTab[]; saveFiles(ids: string[]): Promise<boolean>; sync(find: (id: string) => { project: string; titulo: string; } | null): string[]; }; createTaskFiles: () => { panel: (task: string) => import("../../../../../apps/desktop/src/lib/taskFiles").TaskFilesPanel; setOpen: (task: string, open: boolean) => void; present: (task: string, mode: import("../../../../../apps/desktop/src/lib/taskFiles").TaskSideMode) => void; toggle: (task: string) => void; setExpanded: (task: string, expanded: boolean) => void; setTree: (task: string, tree: boolean) => void; setSide: (task: string, side: import("../../../../../apps/desktop/src/lib/taskFiles").TaskFilesSide) => void; open: (task: string, file: { tree: string; path: string; changes: boolean; changed?: boolean; pinned?: boolean; }) => void; pin: (task: string, id: string) => void; activate: (task: string, id: string) => void; setDirty: (task: string, id: string, dirty: boolean) => void; close: (task: string, ids: string[]) => string[]; renamed: (task: string, tree: string, from: string, to: string) => void; removed: (task: string, tree: string, path: string) => void; dirtyOf: (task: string) => string[]; forget: (task: string) => void; }; createWorkspaceStore: () => { active: import("solid-js").Accessor<string | null>; mode: import("solid-js").Accessor<string | null>; root: import("solid-js").Accessor<string | null>; confirmed: import("solid-js").Accessor<boolean>; generation: () => number; beginTransition: (startup: { active: string | null; workspaces: { id: string; context_root: string | null; default_permission_mode: string | null; }[]; }) => Readonly<{ generation: number; material: number; }> & Readonly<{ previous: string | null; workspace: string | null; }>; activate: (token: Readonly<{ generation: number; material: number; }> & Readonly<{ previous: string | null; workspace: string | null; }>) => boolean; beginMaterial: () => Readonly<{ generation: number; material: number; }>; current: (token: Readonly<{ generation: number; material: number; }>) => boolean; currentMaterial: (token: Readonly<{ generation: number; material: number; }>) => boolean; confirmContext: (token: Readonly<{ generation: number; material: number; }>, candidate: string | null, listed: { id: string; root: boolean; missing: boolean; }[]) => "obsolete" | "unavailable" | "accepted"; modeChanged: (workspace: string | null, value: string | null, requestedGeneration?: number) => void; dispose: () => void; }; hiddenIn: (hidden: unknown, workspace: string | null | undefined) => Set<string>; invoke: <T>(command: string, args?: import("@tauri-apps/api/core").InvokeArgs, options?: import("@tauri-apps/api/core").InvokeOptions) => Promise<T>; lastActivity: (task: import("../../../../tasks/src/view").SidebarTask) => number; machineName: (id: string, local?: boolean) => string; machines: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/project-block-types.ts").Machine[]>; on: { <S, Next extends Prev, Prev = Next>(deps: import("solid-js").AccessorArray<S> | import("solid-js").Accessor<S>, fn: import("solid-js").OnEffectFunction<S, undefined | import("solid-js").NoInfer<Prev>, Next>, options?: import("solid-js").OnOptions & { defer?: false; }): import("solid-js").EffectFunction<undefined | import("solid-js").NoInfer<Next>, import("solid-js").NoInfer<Next>>; <S, Next extends Prev, Prev = Next>(deps: import("solid-js").AccessorArray<S> | import("solid-js").Accessor<S>, fn: import("solid-js").OnEffectFunction<S, undefined | import("solid-js").NoInfer<Prev>, Next>, options: import("solid-js").OnOptions | { defer: true; }): import("solid-js").EffectFunction<undefined | import("solid-js").NoInfer<Next>>; }; onCleanup: <T extends () => any>(fn: T) => T; picksIn: (stored: unknown, workspace: string) => PickedAt; prosaDe: (e: unknown, datos?: { [x: string]: string | number; }) => string; recordarCarpetas: (projects: readonly Project[]) => void; rememberPick: (picked: Readonly<PickedAt>, id: string, now: number, existing: Iterable<string>) => PickedAt; runOn: (workspace: string | null, project?: import("../../../../../apps/desktop/src/lib/project-block-types.ts").ProjectPlace) => string | null; setHidden: (hidden: unknown, workspace: string, id: string, hide: boolean, existing: Iterable<string>) => HiddenProjects; storedPicks: (stored: unknown) => Record<string, PickedAt>; t: (clave: string, datos?: Record<string, string | number>) => string }) {
  const _bridge: Record<string, any> = {};
  const { activeTaskCounts, activityByProject, asleep, createAttention, createEffect, createMemo, createPref, createProjectsStore, createSignal, createTabs, createTaskFiles, createWorkspaceStore, hiddenIn, invoke, lastActivity, machineName, machines, on, onCleanup, picksIn, prosaDe, recordarCarpetas, rememberPick, runOn, setHidden, storedPicks, t } = deps;
  /* El fondo propio del agente de la conversación con el mando: lo publica su
     celda y se pinta detrás del área de trabajo, no solo detrás de su chat. */
  const [fondoDelAgente, setFondoDelAgente] = createSignal<{ url: string; veil?: number } | null>(null);
  const workspaceContext = createWorkspaceStore();
  const contextRoot = workspaceContext.root;
  const contextConfirmed = workspaceContext.confirmed;
  const workspaceMode = workspaceContext.mode;
  const workspaceActivo = workspaceContext.active;
  onCleanup(workspaceContext.dispose);
  function confirmContext(token: Parameters<typeof workspaceContext.confirmContext>[0], root: string | null, listed: Source[]) {
    const result = workspaceContext.confirmContext(token, root, listed);
    if (result === "unavailable") throw { what: t("projects.context.unavailable"), detail: "context_unavailable" };
    if (result === "accepted") setMaterialError(null);
  }
  const attention = createAttention();
  const [draftBases, setDraftBases] = createSignal<Record<string, string>>({});
  const [hablandoCon, setHablandoCon] = createSignal<{ project: string; name: string } | null>(null);
  const projectCatalog = createProjectsStore({ scope: () => ({ workspace: workspaceActivo(), machine: null }), invoke });
  const projectList = projectCatalog.rows;
  onCleanup(projectCatalog.dispose);
  createEffect(() => recordarCarpetas(projectList()));
  const [sources, setSources] = createSignal<Source[]>([]);
  // `rows: null`: la máquina está apagada y no contestó; el selector ofrece lo que se sabe de ella.
  const [draftProjects, setDraftProjects] = createSignal<{ workspace: string; machine: string; rows: Project[] | null } | null>(null);
  const draftMachine = () => runOn(workspaceActivo()) ?? machines().find(m => m.active)?.id ?? null;
  const draftOptions = () => {
    const machine = draftMachine();
    return machine ? { headers: { "x-terminus-machine": machine } } : undefined;
  };
  /**
   * Con la máquina apagada no se le puede preguntar, y elegir proyecto no la
   * enciende: la enciende enviar. Mientras, el selector ofrece los proyectos
   * que ya tienen su carpeta ahí y los que tienen remoto, que el motor clona
   * al llegar el primer mensaje (`ensure_here`). Sin su carpeta: la de la
   * fila es de otra máquina.
   */
  const projectsWhileOff = (machine: string) =>
    projectList()
      .filter(p => p.machines?.includes(machine) || !!p.remote_url)
      .map(p => ({ ...p, working_directory: null, work_tree: null }));
  const composerProjects = createMemo(() => {
    const machine = draftMachine();
    if (!machine) return projectList();
    if (machines().find(m => m.id === machine)?.local) return projectList().filter(p => !p.machines || p.machines.includes(machine));
    const found = draftProjects();
    if (found?.machine !== machine || found.workspace !== workspaceActivo()) return [];
    return found.rows ?? projectsWhileOff(machine);
  });
  const [materialError, setMaterialError] = createSignal<string | null>(null);
  const [taskSourcesError, setTaskSourcesError] = createSignal<string | null>(null);
  const [draftProjectError, setDraftProjectError] = createSignal<string | null>(null);
  const [projectReadError, setProjectReadError] = createSignal<string | null>(null);
  const [startupReadError, setStartupReadError] = createSignal<string | null>(null);
  const [connectionError, setConnectionError] = createSignal<string | null>(null);
  const [readRevision, setReadRevision] = createSignal(0);
  const draftMachineOn = () => machines().find(m => m.id === draftMachine())?.on;
  createEffect(on([workspaceActivo, draftMachine], () => setDraftProjectError(null)));
  createEffect(on([workspaceActivo, draftMachine, draftMachineOn, projectList, readRevision], ([workspace, machine, encendida]) => {
    setDraftProjects(previous => previous?.workspace === workspace && previous.machine === machine ? previous : null);
    if (!workspace || !machine || machines().find(m => m.id === machine)?.local) return;
    if (encendida === false) {
      setDraftProjects({ workspace, machine, rows: null });
      return;
    }
    let current = true;
    onCleanup(() => { current = false; });
    void projectCatalog.readForMachine(machine).then(rows => {
      if (current) { setDraftProjectError(null); setDraftProjects({ workspace, machine, rows: rows.map(row => ({
        ...row, machines: projectList().find(p => p.id === row.id)?.machines ?? [machine],
      })) }); }
    }).catch(e => {
      if (!current) return;
      // Se apagó entre la lista de máquinas y la pregunta, o la pregunta la está
      // encendiendo: lo mismo que apagada.
      if (asleep(e)) setDraftProjects({ workspace, machine, rows: null });
      else setDraftProjectError(prosaDe(e));
    });
  }));
  createEffect(on(draftMachine, (machine, before) => {
    if (before !== undefined && machine !== before) setDraftBases({});
  }));

  const [taskSources, setTaskSources] = createSignal<Source[] | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const errorVisible = () => {
    const message = error();
    return machines().some(machine => message === t("web.machines.off_wakes", { name: machineName(machine.id) })) ? null : message;
  };
  // Por qué esta ventana no puede abrir estos datos, si es que no puede: una
  // instalación con una forma que este binario ya no sabe convertir
  // (`workspaces::base_decidida`). Con esto
  // puesto no se pinta nada más que `PantallaDeBloqueo`.
  const [bloqueo, setBloqueo] = createSignal<Frase | null>(null);

  // Los ids, para el historial agrupado y los efectos que lo recargan.
  const projects = createMemo(() => projectList().map((p) => p.id));
  // Los grupos del historial: los proyectos y las tareas sin proyecto, que
  // Rust responde con `""`. Van por el mismo camino que las demás: son
  // otra carpeta, no otro mecanismo (`workspace/sessions.rs`, `sessions_root`).
  const grupos = createMemo(() => ["", ...projects()]);

  // Vacío es un estado legítimo y es el de arranque: nadie eligió todavía.
  // La app no elige por ti — con un proyecto puesto se puede mandar una
  // pregunta atribuida a un trabajo que nunca se abrió.
  const [project, setProject] = createSignal("");
  // El historial es de TODO el workspace, agrupado por proyecto. Rust
  // responde por proyecto: se pregunta una vez por cada uno. Son lecturas
  // de un directorio, no de red.
  const [sesiones, setSesiones] = createSignal<Record<string, SessionRow[]>>({});
  // Lo que ordena el selector de proyectos: sus tareas vivas y la última vez que se eligió, por workspace.
  const actividadDeProyectos = createMemo(() => activityByProject(sesiones(), lastActivity));
  const [proyectosElegidos, setProyectosElegidos] = createPref<Record<string, PickedAt>>("projects.last_picked", {});
  // Lo guardado puede venir de otra versión o estar roto: se lee con tolerancia.
  const elegidosAqui = () => picksIn(proyectosElegidos(), workspaceActivo() ?? "");
  function recordarEleccion(id: string) {
    const workspace = workspaceActivo();
    if (!workspace || !id) return;
    const existentes = new Set([...projectList(), ...composerProjects()].map((p) => p.id));
    setProyectosElegidos({ ...storedPicks(proyectosElegidos()), [workspace]: rememberPick(elegidosAqui(), id, Date.now(), existentes) });
  }
  // Las tareas activas que la ventana ya cargó: el `sessions` del motor cuenta también las archivadas.
  const tareasActivas = createMemo(() => activeTaskCounts(sesiones()));
  // Apartados del selector, por workspace. Solo el selector los mira: ni el riel ni las tareas cambian.
  const [proyectosOcultos, setProyectosOcultos] = createPref<HiddenProjects>("projects.hidden", {});
  const ocultosAqui = createMemo(() => hiddenIn(proyectosOcultos(), workspaceActivo()));
  function ocultarDelSelector(id: string, ocultar: boolean) {
    const workspace = workspaceActivo();
    if (!workspace || !id) return;
    const existentes = [...projectList(), ...composerProjects()].map((p) => p.id);
    setProyectosOcultos(setHidden(proyectosOcultos(), workspace, id, ocultar, existentes));
  }
  /**
   * Las tareas que la pantalla ya pinta y Rust todavía no ha escrito.
   *
   * Aparte de `sesiones`, que es el espejo fiel de lo que hay en disco: una
   * fila inventada ahí dentro sobreviviría al siguiente refresco sin que nadie
   * la reclamara. `sesionesConEstado` las junta para pintar.
   */
  const [naciendo, setNaciendo] = createSignal<{ project: string; row: SessionRow }[]>([]);
  /**
   * Lo que la persona acaba de cambiarle a una fila (fijarla, su etapa, su
   * nombre) y el disco todavía no confirma. Se pinta encima de `sesiones` en el
   * mismo gesto —ir y volver al motor, a veces por el relay, no puede ser lo que
   * tarde el riel en reaccionar— y se suelta cuando la relectura de su carpeta
   * ya lo trae, o se deshace si el motor lo rechaza. `sesiones` sigue siendo el
   * espejo del disco. Lo pone `retocarFila`.
   */
  const [retoques, setRetoques] = createSignal<Record<string, { cambio: Partial<SessionRow>; n: number }>>({});
  const retirarNaciendo = (id: string) =>
    setNaciendo((ns) => ns.filter((n) => n.row.id !== id));
  // La que ya llegó del disco deja de nacer: su fila de verdad la sustituye.
  createEffect(() => {
    const listas = sesiones();
    setNaciendo((ns) => {
      const quedan = ns.filter(
        (n) => !(listas[n.project] ?? []).some((r) => r.id === n.row.id),
      );
      return quedan.length === ns.length ? ns : quedan;
    });
  });
  const [sessionId, setSessionId] = createSignal<string | null>(null);
  // Qué proyecto se está mirando en el panel principal, si alguno: una
  // vista y no un modo. No cambia lo que la app hace, cambia lo que el
  // panel enseña. Abrir una tarea o empezar una la cierra: la
  // conversación es lo que ocupa ese sitio.
  /** La carpeta que se abrió para ver lo que lee: su página entra una vez por Configuración. */
  const [materialPedido, setMaterialPedido] = createSignal<string | null>(null);
  const [proyectoAbierto, setProyectoAbierto] = createSignal<string | null>(
    null,
  );
  // Con la tarea delante, un turno que cierra tampoco queda sin ver.
  createEffect(() => {
    const workspace = workspaceActivo();
    const id = sessionId();
    if (workspace && id && !proyectoAbierto() && attention.unseen(workspace).has(id)) attention.markSeen(workspace, id);
  });

  // Las pestañas: lo que se tiene a mano en el espacio principal —tareas,
  // archivos y artefactos en una tira—, una vista y no la vida de la
  // sesión: cerrar una no toca a Rust ni al historial (`lib/tabs.ts`). La
  // activa la guarda el módulo (`activarPestana`) y no `sessionId`: una
  // tarea, uno de sus archivos y uno de sus artefactos pueden estar
  // abiertos a la vez y los tres dirían "activo" si se derivara de ahí.
  const pestanas = createTabs({ transient: true });
  const archivosDeTarea = createTaskFiles();
  /** Sin tarea todavía, el panel de la carpeta del proyecto vive bajo su propia llave. */
  const llaveDeBorrador = (proyecto: string | undefined) => (proyecto ? `borrador:${proyecto}` : "");
  const [anchoDeArchivos, setAnchoDeArchivos] = createPref("taskFiles.width", 0.55);
  const [anchoDelArbol, setAnchoDelArbol] = createPref("taskFiles.treeWidth", 330);
  const _out = { fondoDelAgente, setFondoDelAgente, workspaceContext, contextRoot, contextConfirmed, workspaceMode, workspaceActivo, confirmContext, attention, draftBases, setDraftBases, hablandoCon, setHablandoCon, projectCatalog, projectList, sources, setSources, draftMachine, draftOptions, composerProjects, materialError, setMaterialError, taskSourcesError, setTaskSourcesError, draftProjectError, setDraftProjectError, projectReadError, setProjectReadError, startupReadError, setStartupReadError, connectionError, setConnectionError, readRevision, setReadRevision, draftMachineOn, taskSources, setTaskSources, error, setError, errorVisible, bloqueo, setBloqueo, grupos, project, setProject, sesiones, setSesiones, actividadDeProyectos, elegidosAqui, recordarEleccion, tareasActivas, ocultosAqui, ocultarDelSelector, naciendo, setNaciendo, retoques, setRetoques, retirarNaciendo, sessionId, setSessionId, materialPedido, setMaterialPedido, proyectoAbierto, setProyectoAbierto, pestanas, archivosDeTarea, llaveDeBorrador, anchoDeArchivos, setAnchoDeArchivos, anchoDelArbol, setAnchoDelArbol };
  Object.assign(_bridge, _out);
  return { ..._out, bridge: _bridge };
}
