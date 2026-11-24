import { createEffect, createSignal, on, type Accessor, type Setter } from "solid-js";
import { invoke } from "../../../../engine-client/src/client.ts";
import { prosaDe } from "../../../../ui/src/Failure.tsx";
import { t } from "../../../../../apps/desktop/src/lib/i18n.ts";
import type { ArbolEnTarea, Project, Source } from "../../../../ui/src/lib/model.ts";
import type { Capabilities, DraftsStore, Machine, PanelsStore, TabsStore, TaskFilesStore, ThreadsStore } from "../../../../../apps/desktop/src/lib/project-block-types.ts";
import type { Space } from "../../../../../apps/desktop/src/lib/spaces.ts";
import type { Tab } from "../../../../ui/src/lib/tabs.ts";
import type { WorkspaceStore } from "../screens/workspace-session.ts";
import type { SessionRow } from "../screens/Sessions.tsx";
import type { Etapa } from "../screens/TaskStage.tsx";
import { createSessionMutationOpen } from "./session-mutations-open.ts";
import type { DeleteTarget } from "./deleteTask.ts";

export type SessionMutationsDeps = { abrirBorradorDeAgente: (enProyecto: string, name: string) => void; abrirSesion: (proyecto: string, id: string, activar?: string, propagateError?: boolean) => Promise<void>; activarPestana: (p: Tab) => Promise<void>; activeSpace: Accessor<Space | null>; arbolesDe: (project: string, session: string) => Promise<ArbolEnTarea[]>; archivosDeTarea: TaskFilesStore; capabilities: () => Capabilities; cerrarPestana: (id: string) => void; claveAbierta: () => string; contiene: (carpeta: string, absoluta: string) => boolean; contextConfirmed: Accessor<boolean>; deLaTarea: (id: string | null | undefined) => { headers: { "x-terminus-machine": string } } | undefined; draftBases: Accessor<Record<string, string>>; draftOptions: () => { headers: { "x-terminus-machine": string } } | undefined; drafts: DraftsStore; esDeCodigo: (kind: string) => boolean; filaDe: (id: string) => SessionRow | undefined; folder: Accessor<string | null>; irAlBlanco: (enProyecto?: string) => void; machineName: (id: string, local?: boolean) => string; machineOf: (id: string | null | undefined) => { headers: { "x-terminus-machine": string } } | undefined; machines: Accessor<Machine[]>; maquinaDeLaVentana: () => string; nuevaSesion: (enProyecto?: string) => void; olvidarPestana: (session: string) => void; opcionesDeLaTarea: (id: string | null | undefined, workspace: string | null | undefined) => { headers: Record<string, string> }; paneles: PanelsStore; pestanas: TabsStore; project: Accessor<string>; projectCatalog: { changed: () => Promise<unknown> }; projectList: Accessor<Project[]>; proyectoAbierto: Accessor<string | null>; readRevision: Accessor<number>; refreshSessions: (proyectos: string[]) => Promise<void>; senderTaskId: (machine: string, task: string) => string; sesiones: Accessor<Record<string, SessionRow[]>>; sessionId: Accessor<string | null>; setError: Setter<string | null>; setProject: Setter<string>; setProyectoAbierto: Setter<string | null>; setRetoques: Setter<Record<string, { cambio: Partial<SessionRow>; n: number }>>; setRunOn: (workspace: string | null, id: string | null) => void; setTaskSources: Setter<Source[] | null>; setTaskSourcesError: Setter<string | null>; soltarHilo: (session: string) => void; sources: Accessor<Source[]>; threads: ThreadsStore; ubicar: (arboles: readonly ArbolEnTarea[], absoluta: string) => { arbol: ArbolEnTarea; rel: string } | null; workspaceActivo: Accessor<string | null>; workspaceContext: WorkspaceStore; };

export function createSessionMutations(deps: SessionMutationsDeps) {
  const maquinaDeLaVentana = () => deps.maquinaDeLaVentana();
  const { abrirBorradorDeAgente, abrirSesion, activarPestana, activeSpace, arbolesDe, archivosDeTarea, capabilities, cerrarPestana, claveAbierta, contiene, contextConfirmed, deLaTarea, draftBases, draftOptions, drafts, esDeCodigo, filaDe, folder, irAlBlanco, machineName, machineOf, machines, nuevaSesion, olvidarPestana, opcionesDeLaTarea, paneles, pestanas, project, projectCatalog, projectList, proyectoAbierto, readRevision, refreshSessions, senderTaskId, sesiones, sessionId, setError, setProject, setProyectoAbierto, setRetoques, setRunOn, setTaskSources, setTaskSourcesError, soltarHilo, sources, threads, ubicar, workspaceActivo, workspaceContext, } = deps;

  let ultimoRetoque = 0;
  const [deleteTarget, setDeleteTarget] = createSignal<DeleteTarget | null>(null);

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
  async function retocarFila(proyecto: string, id: string, cambio: Partial<SessionRow>, escribir: () => Promise<unknown>) {
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
  const head = { deleteTarget, setDeleteTarget, setDeletingEditors, editorDeletionLocked, deleteTask, deletedTaskMembers, dirtyTaskFiles, moverSesion, etaparSesion, fijarSesion, renombrarSesion, adjuntarFuente, quitarFuente, taskMaterialOptions, materialTarget, };


  const open = createSessionMutationOpen({ abrirBorradorDeAgente, abrirSesion, activeSpace, adjuntarFuente, arbolesDe, archivosDeTarea, cerrarPestana, claveAbierta, contiene, deLaTarea, draftBases, drafts, esDeCodigo, filaDe, folder, machineOf, maquinaDeLaVentana, materialTarget, nuevaSesion, paneles, pestanas, project, projectList, quitarFuente, sesiones, sessionId, setError, setProyectoAbierto, setRunOn, taskMaterialOptions, ubicar, workspaceActivo, });


  return { ...head, ...open };
}
