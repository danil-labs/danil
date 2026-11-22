import type { AgentProfile as AgentProfileData } from "../../../../../apps/desktop/src/lib/model.ts";
import type { ContextoDeProyectos } from "../../../../../apps/desktop/src/lib/project-block-types.ts";
export function createNewTask(deps: { abrirProyecto: (id: string) => void; alta: import("solid-js").Accessor<boolean>; arrancando: import("solid-js").Accessor<boolean>; batch: < T>(fn: import("solid-js").Accessor< T>) => T; borrarProyecto: (id: string) => Promise<void>; carpetaDelEscritorio: (pedido: string) => string; cerrarBorrador: (sitio: import("../../../../../apps/desktop/src/lib/panels").PanelSite) => void; cerrarPestanasYa: (ids: string[]) => void; composer: { agents: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/model").Agent[]>; agent: import("solid-js").Accessor<string>; superficies: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/surfaces").Superficie[] | null>; superficie: import("solid-js").Accessor<string>; catalogos: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/models").CatalogosDeModelos>; models: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/model").AgentModels | null>; modelosParaAgentes: import("solid-js").Accessor<{ superficies: import("../../../../../apps/desktop/src/lib/surfaces").Superficie[]; catalogos: import("../../../../../apps/desktop/src/lib/models").CatalogosDeModelos; }>; model: import("solid-js").Accessor<string>; effort: import("solid-js").Accessor<string>; modo: import("solid-js").Accessor<string>; modos: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/model").ModoDePermiso[]>; skills: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/skills").Skill[]>; cliCommands: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/skills").CliCommand[]>; sideCommand: import("solid-js").Accessor<string | null>; menu: () => import("../../../../../apps/desktop/src/lib/surfaces").Superficie[] | null; options: () => { headers: { "x-terminus-workspace"?: string | undefined; "x-terminus-machine"?: string | undefined; }; }; installEffects: () => void; refreshProviders: () => Promise<void>; prepareCredits: (prepare: (headers: Record<string, string>) => Promise<unknown>) => Promise<void>; startNewDraft: () => void; refreshSurfaces: (inicial: boolean) => Promise<void>; refreshCommands: (a: string) => void; readModels: (a: string, forzar?: boolean) => Promise<void>; snapshot: () => import("../../../../../apps/desktop/src/lib/project-block-types.ts").ComposerConfiguration; effortForTurn: () => string | null; restoreDraft: (configuration?: import("../../../../../apps/desktop/src/lib/project-block-types.ts").ComposerConfiguration) => void; restoreSessionDraft: (draft: { configuration?: import("../../../../../apps/desktop/src/lib/project-block-types.ts").ComposerConfiguration; provider?: { from: string; to: string; }; }, session?: { provider?: string | null; }) => void; useProfile: (profile: { provider?: string | null; model?: string | null; effort?: string | null; }) => void; resumeTask: (selection: { provider: string; model: string; effort: string; mode?: string; }) => void; runtimeFact: (fact: { kind: "model" | "effort" | "mode"; value: string; }) => void; selectModel: (choice: import("../../../../../apps/desktop/src/lib/models").OpcionDeModelo) => string; chooseEffort: (id: string) => void; chooseMode: (id: string) => void; unavailable: () => void; dispose: () => void; }; createSignal: { < T>(): import("solid-js").Signal< T | undefined>; < T>(value: T, options?: import("solid-js").SignalOptions< T>): import("solid-js").Signal< T>; }; drafts: { peek: (key: string) => import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; current: () => import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; sourceIds: import("solid-js").Accessor<string[]>; excludedSourceIds: import("solid-js").Accessor<string[]>; attached: import("solid-js").Accessor<string[]>; pendingMaterial: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/model").Source[]>; context: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/model").Source[]>; input: () => string; files: () => string[]; changeText: (value: string, inputType?: string, change?: import("../../../../../apps/desktop/src/lib/taskMentions").TextEdit) => void; history: (redo: boolean) => boolean; addFiles: (paths: string[]) => Promise<void>; addSource: (id: string) => void; removeSource: (id: string) => void; recipient: (name: string, label: string, trigger: import("../../../../../apps/desktop/src/lib/mentions").Trigger) => void; reference: (target: import("../../../../../apps/desktop/src/lib/taskMentions").MentionTarget, label: string, trigger: import("../../../../../apps/desktop/src/lib/mentions").Trigger) => void; replaceFiles: (files: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; replaceAttached: (ids: string[]) => string[]; acceptSources: (ids: string[]) => string[]; configure: (configuration: import("../../../../../apps/desktop/src/lib/project-block-types.ts").DraftConfiguration, key?: string) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; handover: (provider: import("../../../../../apps/desktop/src/lib/project-block-types.ts").HandoverPending | null | undefined, key?: string) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; invalidateProvider: (key: string, provider: string) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft | { input: string; task_mentions?: import("../../../../../apps/desktop/src/lib/taskMentions").TaskMention[]; recipients?: import("../../../../../apps/desktop/src/lib/recipients").Recipient[]; mentionHistory?: { text: string; task_mentions?: import("../../../../../apps/desktop/src/lib/taskMentions").TaskMention[]; recipients?: import("../../../../../apps/desktop/src/lib/recipients").Recipient[]; }[]; mentionFuture?: { text: string; task_mentions?: import("../../../../../apps/desktop/src/lib/taskMentions").TaskMention[]; recipients?: import("../../../../../apps/desktop/src/lib/recipients").Recipient[]; }[]; sourceIds: string[]; excludedSourceIds: string[]; archivos: string[]; configuration?: import("../../../../../apps/desktop/src/lib/project-block-types.ts").DraftConfiguration; }; }; restoreSession: (key: string, excluded: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; retryText: (text: string, mentions?: import("../../../../../apps/desktop/src/lib/taskMentions").TaskMention[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; takeFiles: (key: string, files: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; restoreFailed: (key: string, message: { text: string; task_mentions?: import("../../../../../apps/desktop/src/lib/taskMentions").TaskMention[]; recipients?: import("../../../../../apps/desktop/src/lib/recipients").Recipient[]; }, files: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; sentSources: (key: string, ids: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; continueFrom: (prompt: string, path: string, sources: string[], excluded: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; promote: (from: string, to: string) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; drop: (key: string) => Record<string, import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft>; reset: () => void; dispose: () => void; }; enBorrador: (sitio: import("../../../../../apps/desktop/src/lib/panels").PanelSite) => boolean; hablandoCon: import("solid-js").Accessor<{ project: string; name: string; } | null>; hablarConEncargado: (enProyecto: string, name: string) => void; invoke: < T>(command: string, args?: import("@tauri-apps/api/core").InvokeArgs, options?: import("@tauri-apps/api/core").InvokeOptions) => Promise< T>; multipleSpaces: () => boolean; ocultarDelSelector: (id: string, ocultar: boolean) => void; ocultosAqui: import("solid-js").Accessor<Set<string>>; paneles: { columns: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/panels").PanelGroup[][]>; widths: import("solid-js").Accessor<number[]>; heights: import("solid-js").Accessor<number[]>; rowCount: () => number; activeSite: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/panels").PanelSite>; sites: () => import("../../../../../apps/desktop/src/lib/panels").PanelSite[]; siteOf: (id: string) => import("../../../../../apps/desktop/src/lib/panels").PanelSite | null; groupAt: (site: import("../../../../../apps/desktop/src/lib/panels").PanelSite) => import("../../../../../apps/desktop/src/lib/panels").PanelGroup | null; groupCount: () => number; rowsPerColumn: () => number[]; isSplit: () => boolean; canSplit: () => boolean; tabsAt: (site: import("../../../../../apps/desktop/src/lib/panels").PanelSite) => string[]; activeTabAt: (site: import("../../../../../apps/desktop/src/lib/panels").PanelSite) => string | null; isVisible: (id: string) => boolean; focus(site: import("../../../../../apps/desktop/src/lib/panels").PanelSite): void; showDraft(): void; activate(id: string): void; renameTabs(pairs: [string, string][]): void; placeLikeStrip(ids: string[], strip: string[]): void; sync(ids: string[]): boolean; close(id: string): string | null; move(id: string, a: import("../../../../../apps/desktop/src/lib/panels").PanelSite, index?: number): boolean; split(id: string): boolean; canSplitAt: (id: string, reference: import("../../../../../apps/desktop/src/lib/panels").PanelSite, side: import("../../../../../apps/desktop/src/lib/panels").Side, unplaced?: boolean) => boolean; splitAt: (id: string, reference: import("../../../../../apps/desktop/src/lib/panels").PanelSite, side: import("../../../../../apps/desktop/src/lib/panels").Side) => boolean; join(): boolean; resizeColumns(i: number, a: number, b: number): void; resizeRows(i: number, a: number, b: number): void; layout: () => import("../../../../../apps/desktop/src/lib/panels").Layout; restore(layout: import("../../../../../apps/desktop/src/lib/panels").Layout | null, live: readonly string[]): void; bindTo(workspace: string | null, space: string | null): void; reset(): void; }; pedirElCampo: () => void; pestanaActiva: () => string | null; pestanas: { pinned: import("solid-js").Accessor<ReadonlySet<string>>; isPinned: (id: string) => boolean; pin: (id: string) => void; restorable: () => string[]; replacePreviews(groups: readonly (readonly string[])[], visible: readonly (string | null)[]): void; open: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/tabs").Tab[]>; active: import("solid-js").Accessor<string | null>; activeTab: () => import("../../../../../apps/desktop/src/lib/tabs").Tab | null; load(ws: string | null, desk?: string | null): string | null; ensure(p: { id: string; project: string; titulo: string; }): void; commitDraft(draft: string, p: { id: string; project: string; titulo: string; }): void; openObservability(title: string): void; openScreen(machine: string, title: string): void; openContent(p: import("../../../../../apps/desktop/src/lib/tabs").ContentTab): void; activate: (id: string | null) => void; close: (id: string) => import("../../../../../apps/desktop/src/lib/tabs").Tab | null; closeMany: (ids: readonly string[], opts?: { remember?: boolean; }) => import("../../../../../apps/desktop/src/lib/tabs").Tab | null; canReopen: () => boolean; reopen(alive: (p: import("../../../../../apps/desktop/src/lib/tabs").Tab) => boolean): import("../../../../../apps/desktop/src/lib/tabs").Tab | null; attachPreviewFiles(project: string, session: string, tree: string): [string, string][]; renameFiles(session: string, tree: string, from: string, end: string): [string, string][]; navigate(id: string, url: string): void; moveToProject(session: string, project: string): void; markChanged(id: string): void; dirty: import("solid-js").Accessor<ReadonlySet<string>>; setDirty(id: string, dirty: boolean): void; registerSaver(id: string, save: (() => Promise<boolean>) | null): void; dirtyTabsToClose(ids: string | readonly string[]): import("../../../../../apps/desktop/src/lib/tabs").FileTab[]; saveFiles(ids: string[]): Promise<boolean>; sync(find: (id: string) => { project: string; titulo: string; } | null): string[]; }; project: import("solid-js").Accessor<string>; proyectoDeNuevaTarea: (pedido: string | undefined, activo: string) => string; removeFromActiveSpace: (folder: string) => Promise<void>; renombrarProyecto: (id: string, name: string) => Promise<void>; restoreDraftConfiguration: () => void; setAnadiendoCarpeta: import("solid-js").Setter<boolean>; setAntesDelBorrador: import("solid-js").Setter<string | null>; setCuentasTocadas: import("solid-js").Setter<number>; setFolder: import("solid-js").Setter<string | null>; setHablandoCon: import("solid-js").Setter<{ project: string; name: string; } | null>; setMaterialPedido: import("solid-js").Setter<string | null>; setProject: import("solid-js").Setter<string>; setProyectoAbierto: import("solid-js").Setter<string | null>; setRunOn: (workspace: string | null, id: string | null) => void; setSessionId: import("solid-js").Setter<string | null>; setSettings: import("solid-js").Setter<string | null>; settings: import("solid-js").Accessor<string | null>; soltarCola: () => void; soltarHilo: (session: string) => void; tareasActivas: import("solid-js").Accessor<Record<string, number>>; taskCountOf: (project: { id: string; sessions: number; }, counts: Readonly<Record<string, number>> | undefined) => number | null; workspaceActivo: import("solid-js").Accessor<string | null> } & { _bridge: Record<string, any>; _live: Record<string, () => any> }) {
  const _bridge = deps._bridge;
  const _mk = (read: () => any): any => new Proxy(function () {} as any, { get(_t: any, p: any) { return read()[p]; }, apply(_t: any, _th: any, args: any[]) { return read()(...args); } });
  const _late: any = {};
  for (const [n, via] of [["proyectosDelRiel",1]] as [string, 0 | 1][]) _late[n] = _mk(() => via ? _bridge[n] : deps._live[n]());
  const { proyectosDelRiel } = _late;
  const { abrirProyecto, alta, arrancando, batch, borrarProyecto, carpetaDelEscritorio, cerrarBorrador, cerrarPestanasYa, composer, createSignal, drafts, enBorrador, hablandoCon, hablarConEncargado, invoke, multipleSpaces, ocultarDelSelector, ocultosAqui, paneles, pedirElCampo, pestanaActiva, pestanas, project, proyectoDeNuevaTarea, removeFromActiveSpace, renombrarProyecto, restoreDraftConfiguration, setAnadiendoCarpeta, setAntesDelBorrador, setCuentasTocadas, setFolder, setHablandoCon, setMaterialPedido, setProject, setProyectoAbierto, setRunOn, setSessionId, setSettings, settings, soltarCola, soltarHilo, tareasActivas, taskCountOf, workspaceActivo } = deps;
  /** Una tarea nueva con la carpeta y el agente ya elegidos. */
  function abrirBorradorDeAgente(enProyecto: string, name: string) {
    setHablandoCon({ project: enProyecto, name });
    irAlBlanco(enProyecto);
    // El borrador tampoco arranca a ciegas: si ya declaró con qué
    // prefiere trabajar, la caja en blanco lo trae puesto en vez del
    // último agente que se usó en cualquier otra conversación.
    void invoke<Record<string, AgentProfileData>>("list_agent_profiles", { project: enProyecto })
      .then((perfiles) => {
        const sigue = hablandoCon();
        if (sigue?.project !== enProyecto || sigue.name !== name) return;
        const perfil = perfiles[name];
        if (!perfil) return;
        composer.useProfile(perfil);
      })
      .catch(() => {});
  }

  /**
   * Qué perfil se pide abrir desde el riel. Lo consume la celda que acaba
   * teniendo delante a ese agente: su conversación se abre antes, y sin esta
   * espera el perfil se pediría a una celda que todavía enseña otra cosa.
   */
  const [requestedProfile, setRequestedProfile] = createSignal<{
    project: string;
    name: string;
  } | null>(null);

  /** Ajustes → Proyectos usa las carpetas y las acciones del riel. Un solo objeto: la hoja no se remonta. */
  const proyectosEnAjustes: ContextoDeProyectos = {
    get projects() {
      return proyectosDelRiel();
    },
    onAdd: () => setAnadiendoCarpeta(true),
    onRename: (id, name) => void renombrarProyecto(id, name),
    onDelete: (id) => void borrarProyecto(id),
    get onRemoveFromSpace() {
      return multipleSpaces() ? removeFromActiveSpace : undefined;
    },
    activeTasks: (id) => taskCountOf({ id, sessions: 0 }, tareasActivas()),
    hiddenInPicker: (id) => ocultosAqui().has(id),
    onSetHiddenInPicker: (id, hide) => ocultarDelSelector(id, hide),
    onOpenMaterial: (id) => {
      cerrarAjustes();
      setMaterialPedido(id);
      abrirProyecto(id);
    },
  };

  function cerrarAjustes() {
    setSettings(null);
    setCuentasTocadas((n) => n + 1);
    // Conectar una cuenta, pegar una clave o activar los gratuitos
    // ocurre ahí dentro, y es justo lo que decide qué ofrece el menú del
    // chat. Sin esto habría que reabrir la app para verlo.
    void composer.refreshSurfaces(false);
  }

  function openAgentProfile(enProyecto: string, name: string) {
    setRequestedProfile({ project: enProyecto, name });
    hablarConEncargado(enProyecto, name);
  }

  /**
   * Una carpeta con tareas en varias máquinas se parte en un grupo por máquina
   * en el riel: lo que se empieza desde un grupo corre en la suya (`""` es esta).
   */
  function enLaMaquinaDelGrupo(machine: string | undefined) {
    if (machine !== undefined) setRunOn(workspaceActivo(), machine || null);
  }

  function nuevaSesion(enProyecto?: string) {
    // Empezar una tarea es cuando más barato sale enterarse de que el
    // material se movió: si esta tarea va a leer un repositorio, ¿está al
    // día? Se comprueba, no se trae —traer mueve el árbol que otras
    // tareas leen, y esa decisión es de quien mira el aviso.
    window.dispatchEvent(new CustomEvent("harness:tarea-nueva"));
    // Una tarea nueva a secas no es de nadie: si la anterior se abrió desde
    // la fila de un agente, ese nombre no puede arrastrarse hasta esta.
    setHablandoCon(null);
    irAlBlanco(proyectoDeNuevaTarea(enProyecto, carpetaDelEscritorio(project())));
  }

  /**
   * La conversación en blanco: lo que el panel enseña sin tarea abierta.
   * `nuevaSesion` es esto más el aviso de que se va a empezar algo. No es
   * una pestaña de `lib/tabs.ts`: la tira solo la pinta como «Nueva tarea»
   * (`enBorrador`). Su borrador —separado por proyecto— espera hasta el
   * primer turno.
   */
  function irAlBlanco(enProyecto = project()) {
    const delante = paneles.activeTabAt(paneles.activeSite());
    batch(() => {
      if (delante !== null) setAntesDelBorrador(delante);
      setProject(enProyecto);
      setProyectoAbierto(null);
      pestanas.activate(null);
    // Y la ventana también se queda sin pestaña delante: `pestanas` y
    // `paneles` llevan la cuenta por separado. Sin esto, la ventana
    // seguía enseñando la conversación anterior bajo la pantalla en blanco.
      paneles.showDraft();
      setSessionId(null);
      restoreDraftConfiguration();
      composer.startNewDraft();
      setFolder(null);
    // Lo que la tarea que se deja ya lee es suyo; el borrador de la
    // conversación en blanco es el suyo y no se toca.
      drafts.replaceAttached([]);
      soltarCola();
      // El hilo sin id es el del primer turno. Si Rust lo negó, se quedaba
      // pintado en toda tarea nueva, de este proyecto o de otro.
      if (!arrancando()) soltarHilo("");
    });
    pedirElCampo();
  }

  function closeActiveTab() {
    if (settings() !== null || alta()) return;
    const id = pestanaActiva();
    if (id) cerrarPestana(id);
    else if (enBorrador(paneles.activeSite())) cerrarBorrador(paneles.activeSite());
  }

  /**
   * Cerrar una pestaña no cierra la sesión: la quita de la tira y suelta
   * su borrador. Su turno, si sigue corriendo, sigue corriendo —Rust no
   * sabe de pestañas—; si era la activa pasa a la vecina y sin vecinas,
   * al blanco: el reparto de un navegador.
   */
  function cerrarPestana(id: string) {
    cerrarPestanas([id]);
  }

  /**
   * Varias a la vez, desde el menú de la tira: una escritura y una vecina. Si en
   * lo que se va hay un archivo sin guardar, primero se pregunta.
   */
  function cerrarPestanas(ids: string[]) {
    const sinGuardar = pestanas.dirtyTabsToClose(ids);
    if (sinGuardar.length > 0) {
      setCierreSinGuardar({ ids, archivos: sinGuardar.map((a) => a.ruta), sucios: sinGuardar.map((a) => a.id) });
      return;
    }
    cerrarPestanasYa(ids);
  }

  /** Lo que la tira tenía sin guardar cuando alguien pidió cerrar. */
  const [cierreSinGuardar, setCierreSinGuardar] = createSignal<
    { ids: string[]; archivos: string[]; sucios: string[] } | null
  >(null);
  const _out = { abrirBorradorDeAgente, requestedProfile, setRequestedProfile, proyectosEnAjustes, cerrarAjustes, openAgentProfile, enLaMaquinaDelGrupo, nuevaSesion, irAlBlanco, closeActiveTab, cerrarPestana, cerrarPestanas, cierreSinGuardar, setCierreSinGuardar };
  Object.assign(_bridge, _out);
  return _out;
}
