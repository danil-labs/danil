import { createSessionMutationOpen } from "./session-mutations-open.ts";
import type { Source } from "../../../../../apps/desktop/src/lib/model.ts";
import type { DeleteTarget } from "./deleteTask.ts";
import type { Etapa } from "../screens/TaskStage.tsx";
import type { SessionRow } from "../screens/Sessions.tsx";

export function createSessionMutations(deps: any) {
  const _bridge = deps._bridge;
  const open = createSessionMutationOpen({ ...deps, _bridge });
  const head = createSessionMutationHead({ ...deps, ...open, _bridge });
  const _out = { ...open, ...head };
  Object.assign(_bridge, _out);
  return _out;
}

function createSessionMutationHead(deps: { activarPestana: (p: import("../../../../../apps/desktop/src/lib/tabs").Tab) => Promise<void>; archivosDeTarea: { panel: (task: string) => import("../../../../../apps/desktop/src/lib/taskFiles").TaskFilesPanel; setOpen: (task: string, open: boolean) => void; present: (task: string, mode: import("../../../../../apps/desktop/src/lib/taskFiles").TaskSideMode) => void; toggle: (task: string) => void; setExpanded: (task: string, expanded: boolean) => void; setTree: (task: string, tree: boolean) => void; setSide: (task: string, side: import("../../../../../apps/desktop/src/lib/taskFiles").TaskFilesSide) => void; open: (task: string, file: { tree: string; path: string; changes: boolean; changed?: boolean; pinned?: boolean; }) => void; pin: (task: string, id: string) => void; activate: (task: string, id: string) => void; setDirty: (task: string, id: string, dirty: boolean) => void; close: (task: string, ids: string[]) => string[]; renamed: (task: string, tree: string, from: string, to: string) => void; removed: (task: string, tree: string, path: string) => void; dirtyOf: (task: string) => string[]; forget: (task: string) => void; }; capabilities: () => import("../../../../host/src/platform").Capabilities; claveAbierta: () => string; contextConfirmed: import("solid-js").Accessor<boolean>; createEffect: { < Next>(fn: import("solid-js").EffectFunction<undefined | import("solid-js").NoInfer< Next>, Next>): void; <Next, Init = Next>(fn: import("solid-js").EffectFunction< Init | Next, Next>, value: Init, options?: import("solid-js").EffectOptions & { render?: boolean; }): void; }; createSignal: { < T>(): import("solid-js").Signal< T | undefined>; < T>(value: T, options?: import("solid-js").SignalOptions< T>): import("solid-js").Signal< T>; }; deLaTarea: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; draftOptions: () => { headers: { "x-terminus-machine": string; }; } | undefined; drafts: { peek: (key: string) => import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; current: () => import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; sourceIds: import("solid-js").Accessor<string[]>; excludedSourceIds: import("solid-js").Accessor<string[]>; attached: import("solid-js").Accessor<string[]>; pendingMaterial: import("solid-js").Accessor<Source[]>; context: import("solid-js").Accessor<Source[]>; input: () => string; files: () => string[]; changeText: (value: string, inputType?: string, change?: import("../../../../../apps/desktop/src/lib/taskMentions").TextEdit) => void; history: (redo: boolean) => boolean; addFiles: (paths: string[]) => Promise<void>; addSource: (id: string) => void; removeSource: (id: string) => void; recipient: (name: string, label: string, trigger: import("../../../../../apps/desktop/src/lib/mentions").Trigger) => void; reference: (target: import("../../../../../apps/desktop/src/lib/taskMentions").MentionTarget, label: string, trigger: import("../../../../../apps/desktop/src/lib/mentions").Trigger) => void; replaceFiles: (files: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; replaceAttached: (ids: string[]) => string[]; acceptSources: (ids: string[]) => string[]; configure: (configuration: import("../../../../../apps/desktop/src/lib/project-block-types.ts").DraftConfiguration, key?: string) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; handover: (provider: import("../../../../../apps/desktop/src/lib/project-block-types.ts").HandoverPending | null | undefined, key?: string) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; invalidateProvider: (key: string, provider: string) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft | { input: string; task_mentions?: import("../../../../../apps/desktop/src/lib/taskMentions").TaskMention[]; recipients?: import("../../../../../apps/desktop/src/lib/recipients").Recipient[]; mentionHistory?: { text: string; task_mentions?: import("../../../../../apps/desktop/src/lib/taskMentions").TaskMention[]; recipients?: import("../../../../../apps/desktop/src/lib/recipients").Recipient[]; }[]; mentionFuture?: { text: string; task_mentions?: import("../../../../../apps/desktop/src/lib/taskMentions").TaskMention[]; recipients?: import("../../../../../apps/desktop/src/lib/recipients").Recipient[]; }[]; sourceIds: string[]; excludedSourceIds: string[]; archivos: string[]; configuration?: import("../../../../../apps/desktop/src/lib/project-block-types.ts").DraftConfiguration; }; }; restoreSession: (key: string, excluded: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; retryText: (text: string, mentions?: import("../../../../../apps/desktop/src/lib/taskMentions").TaskMention[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; takeFiles: (key: string, files: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; restoreFailed: (key: string, message: { text: string; task_mentions?: import("../../../../../apps/desktop/src/lib/taskMentions").TaskMention[]; recipients?: import("../../../../../apps/desktop/src/lib/recipients").Recipient[]; }, files: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; sentSources: (key: string, ids: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; continueFrom: (prompt: string, path: string, sources: string[], excluded: string[]) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; promote: (from: string, to: string) => { [x: string]: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft; }; drop: (key: string) => Record<string, import("../../../../../apps/desktop/src/lib/project-block-types.ts").Draft>; reset: () => void; dispose: () => void; }; filaDe: (id: string) => SessionRow | undefined; invoke: < T>(command: string, args?: import("@tauri-apps/api/core").InvokeArgs, options?: import("@tauri-apps/api/core").InvokeOptions) => Promise< T>; irAlBlanco: (enProyecto?: string) => void; machineName: (id: string, local?: boolean) => string; machines: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/project-block-types.ts").Machine[]>; olvidarPestana: (session: string) => void; on: { <S, Next extends Prev, Prev = Next>(deps: import("solid-js").AccessorArray< S> | import("solid-js").Accessor< S>, fn: import("solid-js").OnEffectFunction<S, undefined | import("solid-js").NoInfer< Prev>, Next>, options?: import("solid-js").OnOptions & { defer?: false; }): import("solid-js").EffectFunction<undefined | import("solid-js").NoInfer< Next>, import("solid-js").NoInfer< Next>>; <S, Next extends Prev, Prev = Next>(deps: import("solid-js").AccessorArray< S> | import("solid-js").Accessor< S>, fn: import("solid-js").OnEffectFunction<S, undefined | import("solid-js").NoInfer< Prev>, Next>, options: import("solid-js").OnOptions | { defer: true; }): import("solid-js").EffectFunction<undefined | import("solid-js").NoInfer< Next>>; }; opcionesDeLaTarea: (id: string | null | undefined, workspace: string | null | undefined) => { headers: { [k: string]: string; }; }; paneles: { columns: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/panels").PanelGroup[][]>; widths: import("solid-js").Accessor<number[]>; heights: import("solid-js").Accessor<number[]>; rowCount: () => number; activeSite: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/panels").PanelSite>; sites: () => import("../../../../../apps/desktop/src/lib/panels").PanelSite[]; siteOf: (id: string) => import("../../../../../apps/desktop/src/lib/panels").PanelSite | null; groupAt: (site: import("../../../../../apps/desktop/src/lib/panels").PanelSite) => import("../../../../../apps/desktop/src/lib/panels").PanelGroup | null; groupCount: () => number; rowsPerColumn: () => number[]; isSplit: () => boolean; canSplit: () => boolean; tabsAt: (site: import("../../../../../apps/desktop/src/lib/panels").PanelSite) => string[]; activeTabAt: (site: import("../../../../../apps/desktop/src/lib/panels").PanelSite) => string | null; isVisible: (id: string) => boolean; focus(site: import("../../../../../apps/desktop/src/lib/panels").PanelSite): void; showDraft(): void; activate(id: string): void; renameTabs(pairs: [string, string][]): void; placeLikeStrip(ids: string[], strip: string[]): void; sync(ids: string[]): boolean; close(id: string): string | null; move(id: string, a: import("../../../../../apps/desktop/src/lib/panels").PanelSite, index?: number): boolean; split(id: string): boolean; canSplitAt: (id: string, reference: import("../../../../../apps/desktop/src/lib/panels").PanelSite, side: import("../../../../../apps/desktop/src/lib/panels").Side, unplaced?: boolean) => boolean; splitAt: (id: string, reference: import("../../../../../apps/desktop/src/lib/panels").PanelSite, side: import("../../../../../apps/desktop/src/lib/panels").Side) => boolean; join(): boolean; resizeColumns(i: number, a: number, b: number): void; resizeRows(i: number, a: number, b: number): void; layout: () => import("../../../../../apps/desktop/src/lib/panels").Layout; restore(layout: import("../../../../../apps/desktop/src/lib/panels").Layout | null, live: readonly string[]): void; bindTo(workspace: string | null, space: string | null): void; reset(): void; }; pestanas: { pinned: import("solid-js").Accessor<ReadonlySet<string>>; isPinned: (id: string) => boolean; pin: (id: string) => void; restorable: () => string[]; replacePreviews(groups: readonly (readonly string[])[], visible: readonly (string | null)[]): void; open: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/tabs").Tab[]>; active: import("solid-js").Accessor<string | null>; activeTab: () => import("../../../../../apps/desktop/src/lib/tabs").Tab | null; load(ws: string | null, desk?: string | null): string | null; ensure(p: { id: string; project: string; titulo: string; }): void; commitDraft(draft: string, p: { id: string; project: string; titulo: string; }): void; openObservability(title: string): void; openScreen(machine: string, title: string): void; openContent(p: import("../../../../../apps/desktop/src/lib/tabs").ContentTab): void; activate: (id: string | null) => void; close: (id: string) => import("../../../../../apps/desktop/src/lib/tabs").Tab | null; closeMany: (ids: readonly string[], opts?: { remember?: boolean; }) => import("../../../../../apps/desktop/src/lib/tabs").Tab | null; canReopen: () => boolean; reopen(alive: (p: import("../../../../../apps/desktop/src/lib/tabs").Tab) => boolean): import("../../../../../apps/desktop/src/lib/tabs").Tab | null; attachPreviewFiles(project: string, session: string, tree: string): [string, string][]; renameFiles(session: string, tree: string, from: string, end: string): [string, string][]; navigate(id: string, url: string): void; moveToProject(session: string, project: string): void; markChanged(id: string): void; dirty: import("solid-js").Accessor<ReadonlySet<string>>; setDirty(id: string, dirty: boolean): void; registerSaver(id: string, save: (() => Promise<boolean>) | null): void; dirtyTabsToClose(ids: string | readonly string[]): import("../../../../../apps/desktop/src/lib/tabs").FileTab[]; saveFiles(ids: string[]): Promise<boolean>; sync(find: (id: string) => { project: string; titulo: string; } | null): string[]; }; project: import("solid-js").Accessor<string>; projectCatalog: { rows: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/model").Project[]>; readyScope: import("solid-js").Accessor<(import("../index").ProjectsScope & { revision: number; }) | null>; state: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/resource").ResourceState<string, import("../../../../../apps/desktop/src/lib/model").Project[]>>; refresh: () => Promise<import("../../../../../apps/desktop/src/lib/model").Project[]>; changed: () => Promise<import("../../../../../apps/desktop/src/lib/model").Project[]>; fromCache(projects: import("../../../../../apps/desktop/src/lib/model").Project[]): void; workspaceChanged(preserveCached?: boolean): void; discardUnconfirmedCache(): void; readForMachine(machine: string): Promise<import("../../../../../apps/desktop/src/lib/model").Project[]>; rename: (id: string, name: string) => Promise<void>; attach: (id: string, source: string) => Promise<void>; detach: (id: string, source: string) => Promise<void>; workTree: (id: string, dir: string | null) => Promise<void>; remove: (id: string) => Promise<void>; dispose(): void; }; projectList: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/model").Project[]>; prosaDe: (e: unknown, datos?: { [x: string]: string | number; }) => string; proyectoAbierto: import("solid-js").Accessor<string | null>; readRevision: import("solid-js").Accessor<number>; refreshSessions: (proyectos: string[]) => Promise<void>; senderTaskId: (machine: string, task: string) => string; sessionId: import("solid-js").Accessor<string | null>; setError: import("solid-js").Setter<string | null>; setProject: import("solid-js").Setter<string>; setProyectoAbierto: import("solid-js").Setter<string | null>; setRetoques: import("solid-js").Setter<Record<string, { cambio: Partial< SessionRow>; n: number; }>>; setTaskSources: import("solid-js").Setter<Source[] | null>; setTaskSourcesError: import("solid-js").Setter<string | null>; soltarHilo: (session: string) => void; sources: import("solid-js").Accessor<Source[]>; t: (clave: string, datos?: Record<string, string | number>) => string; threads: { read: (project: string, id: string, before?: number | null | undefined) => Promise<import("../../../../../apps/desktop/src/lib/project-block-types.ts").Session>; acceptSession: (id: string, session: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Session, clear: boolean, generation: number, latest?: boolean | undefined) => boolean; activities: (id: string, visible: readonly import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[]) => import("../../../../../apps/desktop/src/lib/activityObservation").ObservedTurnActivity<import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg>[]; beginActivity: (id: string, startedAt: number | null, startConfirmed?: boolean) => void; finishActivity: (id: string, workspace?: string | null) => void; rows: import("solid-js").Accessor<Record<string, import("../../../../../apps/desktop/src/lib/project-block-types.ts").OptimisticHistoryState & { base: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[]; vivo: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[]; guardados?: ReadonlySet<string>; }>>; current: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/project-block-types.ts").OptimisticHistoryState & { base: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[]; vivo: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[]; guardados?: ReadonlySet<string>; }>; messages: import("solid-js").Accessor<import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[]>; loading: import("solid-js").Accessor<string | null>; origins: import("solid-js").Accessor<Readonly<Record<string, import("../../../../../apps/desktop/src/lib/project-block-types.ts").TranscriptOrigin | null>>>; offline: import("solid-js").Accessor<Readonly<Record<string, string>>>; machineWaits: import("solid-js").Accessor<Readonly<Record<string, import("../../../../../apps/desktop/src/lib/project-block-types.ts").MachineWait>>>; handovers: import("solid-js").Accessor<Readonly<Record<string, import("../../../../../apps/desktop/src/lib/project-block-types.ts").HandoverState>>>; olderAvailable: import("solid-js").Accessor<Readonly<Record<string, boolean>>>; recentAvailable: import("solid-js").Accessor<Readonly<Record<string, boolean>>>; olderStatus: import("solid-js").Accessor<Readonly<Record<string, import("../../../../chat/src/history").OlderState>>>; recentTail: import("solid-js").Accessor<Readonly<Record<string, import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[]>>>; appendLive: (session: string, messages: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[], workspace?: string | null) => void; appendPersisted: (session: string, messages: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[]) => void; appendOptimistic: (session: string, messages: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[]) => void; acknowledgeOptimistic: (session: string, messages: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[]) => void; commitUniqueTurn: (session: string, message: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg) => void; replaceTurn: (session: string, message: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg) => void; reviseOptimistic: (session: string, target: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg, patch: Pick<import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg, "respuestas" | "author">) => void; rejectOptimistic: (session: string, messages: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[]) => void; question: (session: string, fields: Pick<import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg, "turno" | "preguntas" | "questionRequestId" | "agent">, workspace?: string | null) => void; replay: (session: string, workspace?: string | null, replayId?: string) => void; finishSteps: (session: string) => void; event: (payload: import("../../../../../apps/desktop/src/lib/project-block-types.ts").ChatEvent, metadata: import("../../../../../apps/desktop/src/lib/project-block-types.ts").TranscriptMetadata) => void; older: (project: string, id: string) => Promise<(() => void) | null>; latest: (id: string) => Promise<void>; replaceHistory: (session: string, leida: import("../../../../../apps/desktop/src/lib/project-block-types.ts").Msg[], vaciarVivo: boolean, antepuesta?: boolean, guardados?: ReadonlySet<string>, cola?: ReadonlySet<string>, readRevision?: number) => void; saveWorkspace: (previous: string | null) => void; activateWorkspace: (workspace: string | null) => void; resetService: () => void; adoptDraft: (id: string) => void; dropSaved: (workspace: string, id: string) => void; flush: () => void; markMachineWait: (id: string, wait: import("../../../../../apps/desktop/src/lib/project-block-types.ts").MachineWait | null) => void; markAwake: (id: string) => void; startLoading: (id: string) => void; finishLoading: (id: string) => void; reading: (id: string, active: boolean) => void; drop: (session: string) => void; dispose: () => void; }; workspaceActivo: import("solid-js").Accessor<string | null>; workspaceContext: { active: import("solid-js").Accessor<string | null>; mode: import("solid-js").Accessor<string | null>; root: import("solid-js").Accessor<string | null>; confirmed: import("solid-js").Accessor<boolean>; generation: () => number; beginTransition: (startup: { active: string | null; workspaces: { id: string; context_root: string | null; default_permission_mode: string | null; }[]; }) => Readonly<{ generation: number; material: number; }> & Readonly<{ previous: string | null; workspace: string | null; }>; activate: (token: Readonly<{ generation: number; material: number; }> & Readonly<{ previous: string | null; workspace: string | null; }>) => boolean; beginMaterial: () => Readonly<{ generation: number; material: number; }>; current: (token: Readonly<{ generation: number; material: number; }>) => boolean; currentMaterial: (token: Readonly<{ generation: number; material: number; }>) => boolean; confirmContext: (token: Readonly<{ generation: number; material: number; }>, candidate: string | null, listed: { id: string; root: boolean; missing: boolean; }[]) => "obsolete" | "unavailable" | "accepted"; modeChanged: (workspace: string | null, value: string | null, requestedGeneration?: number) => void; dispose: () => void; } } & { _bridge: Record<string, any> }) {
  const _bridge = deps._bridge;
  const { activarPestana, archivosDeTarea, capabilities, claveAbierta, contextConfirmed, createEffect, createSignal, deLaTarea, draftOptions, drafts, filaDe, invoke, irAlBlanco, machineName, machines, olvidarPestana, on, opcionesDeLaTarea, paneles, pestanas, project, projectCatalog, projectList, prosaDe, proyectoAbierto, readRevision, refreshSessions, senderTaskId, sessionId, setError, setProject, setProyectoAbierto, setRetoques, setTaskSources, setTaskSourcesError, soltarHilo, sources, t, threads, workspaceActivo, workspaceContext } = deps;
  let ultimoRetoque = 0;
  const [deleteTarget, setDeleteTarget] = createSignal< DeleteTarget | null>(null);

  const [deletingEditors, setDeletingEditors] = createSignal<{ workspace: string | null; ids: string[] } | null>(null);
  const editorDeletionLocked = (id: string) => deletingEditors()?.workspace === workspaceActivo() && deletingEditors()?.ids.includes(id) === true;

  function deleteTask(project: string, id: string, members?: number) {
    // One deletion at a time: its preview and consent belong to the task that started it.
    if (deleteTarget()) return;
    const machine = deLaTarea(id)?.headers["x-terminus-machine"] ?? machines().find(item => item.local || item.active)?.id;
    const target = machines().find(item => item.id === machine);
    const folderNames = new Map(projectList().map(folder => [folder.id, folder.name]));
    setDeleteTarget({
      machineName: machine ? machineName(machine) : t("shell.machines.this_computer"),
      folderName: folder => folderNames.get(folder) || folder || t("shell.sidebar.view.no_folder"),
      project, id, workspace: workspaceActivo(), members,
      supported: target?.features?.includes("task_lifecycle_v1") === true,
      options: opcionesDeLaTarea(id, workspaceActivo()),
      panelId: task => machine ? senderTaskId(machine, task) : task,
    });
  }

  function deletedTaskMembers(members: { project: string; id: string }[]) {
    const view = proyectoAbierto();
    const ids = members.map(member => member.id);
    const activeRemoved = ids.includes(sessionId() ?? "");
    const tabIds = pestanas.open().filter(tab => ids.includes(tab.id) || ids.includes(tab.session)).map(tab => tab.id);
    const neighbor = pestanas.closeMany(tabIds);
    paneles.sync(pestanas.open().map(tab => tab.id));
    for (const id of ids) {
      soltarHilo(id);
      drafts.drop(id);
      olvidarPestana(id);
      archivosDeTarea.forget(id);
    }
    if (activeRemoved) {
      if (!view && neighbor) void activarPestana(neighbor);
      else { irAlBlanco(); setProyectoAbierto(view); }
    }
    void refreshSessions([...new Set(members.map(member => member.project))]);
  }

  function dirtyTaskFiles(id: string): string[] {
    const tabIds = pestanas.open().filter(tab => tab.id === id || tab.session === id).map(tab => tab.id);
    const tabs = pestanas.dirtyTabsToClose(tabIds).map(tab => tab.ruta);
    const panel = archivosDeTarea.panel(id);
    return [...new Set([...tabs, ...panel.tabs.filter(tab => panel.dirty.includes(tab.id)).map(tab => tab.path)])];
  }

  /**
   * Mueve una tarea a otro proyecto, o la saca de todos. Si es la que
   * está abierta se cambia también el proyecto en pantalla: el
   * siguiente turno se guarda donde ahora vive la tarea.
   */
  async function moverSesion(de: string, id: string, a: string) {
    try {
      await invoke("move_session", { project: de, id, to: a }, deLaTarea(id));
      if (id === sessionId()) setProject(a);
      pestanas.moveToProject(id, a);
      void refreshSessions([de, a]);
      await projectCatalog.changed();
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  /**
   * Marca en qué etapa está una tarea, o le quita la marca con `null`.
   * Se ve al instante (`retocarFila`), pero lo que queda es lo que relee
   * del disco: con dos ventanas sobre el mismo workspace, la que no marcó
   * se enteraría tarde o nunca si solo se tocara la memoria.
   */
  async function etaparSesion(
    proyecto: string,
    id: string,
    etapa: Etapa | null,
  ) {
    try {
      await retocarFila(proyecto, id, { stage: etapa }, () =>
        invoke("set_session_stage", { project: proyecto, id, stage: etapa }, deLaTarea(id)));
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  /**
   * Cambia una fila en pantalla ya y la escribe detrás (`retoques`). Después
   * relee solo su carpeta: releer todas esperaba a la más lenta, y otra máquina
   * apagada o lejos retrasaba lo que acababa de cambiar aquí. Si el motor lo
   * rechaza, la fila vuelve a como estaba y el error sube a quien llamó.
   */
  async function retocarFila(proyecto: string, id: string, cambio: Partial< SessionRow>, escribir: () => Promise<unknown>) {
    const n = ++ultimoRetoque;
    setRetoques((rs) => ({ ...rs, [id]: { cambio: { ...rs[id]?.cambio, ...cambio }, n } }));
    // Solo el suyo: un segundo clic sobre la misma fila mientras vuelve el primero manda.
    const soltar = () => setRetoques((rs) => {
      if (rs[id]?.n !== n) return rs;
      const { [id]: _, ...resto } = rs;
      return resto;
    });
    try {
      await escribir();
    } catch (e) {
      soltar();
      throw e;
    }
    await refreshSessions([proyecto]);
    soltar();
  }

  async function fijarSesion(proyecto: string, id: string, pinned: boolean) {
    await retocarFila(proyecto, id, { pinned }, () =>
      invoke("set_session_pinned", { project: proyecto, id, pinned }, deLaTarea(id)));
  }

  /**
   * Le cambia el nombre a una tarea. Relee la lista, igual que
   * `etaparSesion`, y de paso llega a las pestañas
   * (`pestanasEnPantalla`): sin releer, la abierta seguiría rotulada con
   * el nombre viejo hasta el siguiente arranque.
   */
  async function renombrarSesion(proyecto: string, id: string, title: string) {
    try {
      await retocarFila(proyecto, id, { title: title.trim() }, () =>
        invoke("rename_session", { project: proyecto, id, title }, deLaTarea(id)));
      return true;
    } catch (e) {
      setError(prosaDe(e));
      return false;
    }
  }

  /**
   * Una fuente que entra a la tarea. No escribe en disco: lo pendiente viaja
   * con el turno, y `send_message` lo suma a la tarea. El agente la lee por
   * `--add-dir`; dónde escribe es la carpeta de trabajo del proyecto.
   */
  const adjuntarFuente = async (id: string) => {
    drafts.addSource(id);
    // `harness:sources` y no `harness:workspace`: aquel cierra la
    // conversación abierta; adjuntar material a mitad de una tarea no muda de
    // cliente.
    window.dispatchEvent(new CustomEvent("harness:sources"));
  };

  /**
   * Quitar una fuente de esta tarea: deja de ofrecerse de aquí en adelante.
   * No deshace lo que el agente ya leyó: el control
   * dice «quitar», no «olvidar».
   */
  const quitarFuente = async (id: string) => {
    drafts.removeSource(id);
    const sid = sessionId();
    if (!sid) return;
    try {
      await invoke("detach_session_source", {
        project: project(),
        session: sid,
        source: id,
      }, deLaTarea(sid));
    } catch (e) {
      threads.appendPersisted(sid, [{
                  role: "system",
                  text: t("chat.scope.source.remove_failed", { error: prosaDe(e) }),
                  meta: "fallo",
                }]);
    }
  };

  function taskMaterialOptions() {
    if (capabilities().nativeWindow && !capabilities().remoteCreate) return { headers: {} };
    const sid = sessionId();
    const row = sid ? filaDe(sid) : null;
    const named = sid ? machines().find((m) => sid.startsWith(`${m.id}~`))?.id : null;
    if (sid && !row && !named) return undefined;
    const chosen = sid ? undefined : draftOptions();
    const machine = row?.machine ?? named ?? machines().find((m) => m.local || m.active)?.id;
    return chosen ?? (machine ? { headers: { "x-terminus-machine": machine } } : undefined);
  }

  const materialTarget = () => `${workspaceActivo()}:${workspaceContext.generation()}:${sessionId()}:${claveAbierta()}:${JSON.stringify(taskMaterialOptions())}`;
  let taskSourcesRequest = 0;
  createEffect(on(() => ({
    target: materialTarget(),
    retry: readRevision(),
    workspace: workspaceActivo(),
    options: taskMaterialOptions(),
    ready: !sessionId() || !!taskMaterialOptions(),
    single: (!capabilities().remoteCreate && capabilities().nativeWindow) || machines().length === 1,
    confirmed: contextConfirmed(),
    catalog: sources(),
  }), ({ workspace, options, ready, single, confirmed, catalog }) => {
    const request = ++taskSourcesRequest;
    setTaskSources(null);
    setTaskSourcesError(null);
    if (!workspace || !ready) return;
    if (single) {
      if (confirmed) setTaskSources(catalog);
      return;
    }
    if (!options) return;
    void invoke<Source[]>("list_sources", {}, options).then((listed) => {
      if (request === taskSourcesRequest) setTaskSources(listed);
    }).catch((e) => {
      if (request === taskSourcesRequest) setTaskSourcesError(prosaDe(e));
    });
  }));
  const _out = { deleteTarget, setDeleteTarget, setDeletingEditors, editorDeletionLocked, deleteTask, deletedTaskMembers, dirtyTaskFiles, moverSesion, etaparSesion, fijarSesion, renombrarSesion, adjuntarFuente, quitarFuente, taskMaterialOptions, materialTarget };
  Object.assign(_bridge, _out);
  return _out;
}
