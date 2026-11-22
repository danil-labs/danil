import { type ObservedTurnActivity } from "../../../../../../apps/desktop/src/lib/activityObservation.ts";
import { lista } from "../../../../../../apps/desktop/src/lib/format";
import { aplicarLenguaDeWorkspace, t } from "../../../../../../apps/desktop/src/lib/i18n";
import { type Trigger } from "../../../../../../apps/desktop/src/lib/mentions.ts";
import { type Source } from "../../../../../../apps/desktop/src/lib/model";
import { type Agent, type AgentModels, type ModoDePermiso, type Project } from "../../../../../../apps/desktop/src/lib/model.ts";
import { type CatalogosDeModelos, type OpcionDeModelo } from "../../../../../../apps/desktop/src/lib/models.ts";
import { readLayout } from "../../../../../../apps/desktop/src/lib/panels";
import { type Frase } from "../../../../../../apps/desktop/src/lib/prose.ts";
import { type Recipient } from "../../../../../../apps/desktop/src/lib/recipients.ts";
import { NotMovable, attachmentsOn } from "../../../../../../apps/desktop/src/lib/remoteAttachments";
import { type ResourceState } from "../../../../../../apps/desktop/src/lib/resource.ts";
import { shellCacheMatches } from "../../../../../../apps/desktop/src/lib/shellCache";
import { type ShellSnapshot } from "../../../../../../apps/desktop/src/lib/shellCache.ts";
import { type CliCommand, type Skill } from "../../../../../../apps/desktop/src/lib/skills.ts";
import { type Space } from "../../../../../../apps/desktop/src/lib/spaces";
import { type Superficie } from "../../../../../../apps/desktop/src/lib/surfaces.ts";
import { isTaskTab } from "../../../../../../apps/desktop/src/lib/tabs";
import { type ContentTab, type FileTab, type Tab } from "../../../../../../apps/desktop/src/lib/tabs.ts";
import { type MentionTarget, type TaskMention, type TextEdit } from "../../../../../../apps/desktop/src/lib/taskMentions.ts";
import { aplicarTemaDeTerminal } from "../../../../../../apps/desktop/src/lib/terminal-themes";
import { type Ventana } from "../../../../../../apps/desktop/src/lib/usage.ts";
import { type OlderState } from "../../model/history.ts";
import { displayWorkspaceSnapshot, invoke, requestedWorkspaceSnapshot } from "../../../../../engine-client/src/client.ts";
import { capabilities } from "../../../../../host/src/platform";
import { prosaDe } from "../../../../../ui/src/Failure";
import { type Encolado } from "../../components/MessageQueue.tsx";
import { type HandoverPending, type HandoverState } from "../../model/handover.ts";
import { type Msg } from "../../model/messageTypes.ts";
import { type ChatEvent, type Session, type TranscriptOrigin } from "../../model/transcript.ts";
import { batch, type Accessor, type Setter } from "solid-js";

type ComposerConfiguration = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type ContextSource = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type ConversationScope = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Draft = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type DraftConfiguration = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type DraftSelection = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type HandoffFact = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type HandoffPresentation = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type HandoffView = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Hilo = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type HistoryEntry = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type IdsDeTurnos = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Machine = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type MachineWait = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Preview = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type ReadyScope = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Saved = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type SessionRow = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Startup = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type StartupContext = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type TranscriptMetadata = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Transition = any; // pendiente: el tipo llega de otra feature por el shell (R3)

/** Lo que el bloque usaba del cuerpo de App. */
export type AttachmentsDeps = { abrirSesion: (proyecto: string, id: string, activar?: string, propagateError?: boolean) => Promise<void>; adjuntosEn: Map<string, string>; asentarEscritorio: (ws: string, lista: Space[] | null) => string | null; asleep: (error: unknown) => boolean; composer: { agents: Accessor<Agent[]>; agent: Accessor<string>; superficies: Accessor<Superficie[] | null>; superficie: Accessor<string>; catalogos: Accessor<CatalogosDeModelos>; models: Accessor<AgentModels | null>; modelosParaAgentes: Accessor<{ superficies: Superficie[]; catalogos: CatalogosDeModelos; }>; model: Accessor<string>; effort: Accessor<string>; modo: Accessor<string>; modos: Accessor<ModoDePermiso[]>; skills: Accessor<Skill[]>; cliCommands: Accessor<CliCommand[]>; sideCommand: Accessor<string | null>; menu: () => Superficie[] | null; options: () => { headers: { "x-terminus-workspace"?: string | undefined; "x-terminus-machine"?: string | undefined; }; }; installEffects: () => void; refreshProviders: () => Promise<void>; prepareCredits: (prepare: (headers: Record<string, string>) => Promise<unknown>) => Promise<void>; startNewDraft: () => void; refreshSurfaces: (inicial: boolean) => Promise<void>; refreshCommands: (a: string) => void; readModels: (a: string, forzar?: boolean) => Promise<void>; snapshot: () => ComposerConfiguration; effortForTurn: () => string | null; restoreDraft: (configuration?: ComposerConfiguration) => void; restoreSessionDraft: (draft: DraftSelection, session?: { provider?: string | null; }) => void; useProfile: (profile: { provider?: string | null; model?: string | null; effort?: string | null; }) => void; resumeTask: (selection: { provider: string; model: string; effort: string; mode?: string; }) => void; runtimeFact: (fact: { kind: "model" | "effort" | "mode"; value: string; }) => void; selectModel: (choice: OpcionDeModelo) => string; chooseEffort: (id: string) => void; chooseMode: (id: string) => void; unavailable: () => void; dispose: () => void; }; confirmContext: any; deLaTarea: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; documentosEn: (options: { headers: Record<string, string>; } | undefined) => boolean; draftOptions: () => { headers: { "x-terminus-machine": string; }; } | undefined; drafts: { peek: (key: string) => Draft; current: () => Draft; sourceIds: Accessor<string[]>; excludedSourceIds: Accessor<string[]>; attached: Accessor<string[]>; pendingMaterial: Accessor<Source[]>; context: Accessor<Source[]>; input: () => string; files: () => string[]; changeText: (value: string, inputType?: string, change?: TextEdit) => void; history: (redo: boolean) => boolean; addFiles: (paths: string[]) => Promise<void>; addSource: (id: string) => void; removeSource: (id: string) => void; recipient: (name: string, label: string, trigger: Trigger) => void; reference: (target: MentionTarget, label: string, trigger: Trigger) => void; replaceFiles: (files: string[]) => { [x: string]: Draft; }; replaceAttached: (ids: string[]) => string[]; acceptSources: (ids: string[]) => string[]; configure: (configuration: DraftConfiguration, key?: string) => { [x: string]: Draft; }; handover: (provider: HandoverPending | null | undefined, key?: string) => { [x: string]: Draft; }; invalidateProvider: (key: string, provider: string) => { [x: string]: Draft | { input: string; task_mentions?: TaskMention[]; recipients?: Recipient[]; mentionHistory?: HistoryEntry[]; mentionFuture?: HistoryEntry[]; sourceIds: string[]; excludedSourceIds: string[]; archivos: string[]; configuration?: DraftConfiguration; }; }; restoreSession: (key: string, excluded: string[]) => { [x: string]: Draft; }; retryText: (text: string, mentions?: TaskMention[]) => { [x: string]: Draft; }; takeFiles: (key: string, files: string[]) => { [x: string]: Draft; }; restoreFailed: (key: string, message: HistoryEntry, files: string[]) => { [x: string]: Draft; }; sentSources: (key: string, ids: string[]) => { [x: string]: Draft; }; continueFrom: (prompt: string, path: string, sources: string[], excluded: string[]) => { [x: string]: Draft; }; promote: (from: string, to: string) => { [x: string]: Draft; }; drop: (key: string) => Record<string, Draft>; reset: () => void; dispose: () => void; }; enCache: Accessor<boolean>; enMaquina: (machine: string | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; finishedTurns: Map<string, boolean | null | undefined>; grupos: Accessor<string[]>; guardarCache: { save(snapshot: ShellSnapshot): void; flush: () => void; cancel(): void; }; handoff: { requestStop: (scope: ConversationScope) => Promise<void>; replaceWithQueued: (scope: ConversationScope, id: string) => Promise<void>; observe: (fact: HandoffFact) => void; view: (scope: ConversationScope) => HandoffView; presentation: (scope: ConversationScope) => HandoffPresentation; blocked: (scope: ConversationScope) => boolean; reset: () => void; dispose: () => void; }; hilos: Accessor<Record<string, Hilo>>; lifecycleRevision: number; loadThread: (project: string, id: string) => Promise<void>; loadWindowThreads: (skip: string | null) => void; machineName: (id: string, local?: boolean) => string; machines: Accessor<Machine[]>; paneles: any; pegadasEn: Map<string, string>; pestanas: { pinned: Accessor<ReadonlySet<string>>; isPinned: (id: string) => boolean; pin: (id: string) => void; restorable: () => string[]; replacePreviews(groups: readonly (readonly string[])[], visible: readonly (string | null)[]): void; open: Accessor<Tab[]>; active: Accessor<string | null>; activeTab: () => Tab | null; load(ws: string | null, desk?: string | null): string | null; ensure(p: { id: string; project: string; titulo: string; }): void; commitDraft(draft: string, p: { id: string; project: string; titulo: string; }): void; openObservability(title: string): void; openScreen(machine: string, title: string): void; openContent(p: ContentTab): void; activate: (id: string | null) => void; close: (id: string) => Tab | null; closeMany: (ids: readonly string[], opts?: { remember?: boolean; }) => Tab | null; canReopen: () => boolean; reopen(alive: (p: Tab) => boolean): Tab | null; attachPreviewFiles(project: string, session: string, tree: string): [string, string][]; renameFiles(session: string, tree: string, from: string, end: string): [string, string][]; navigate(id: string, url: string): void; moveToProject(session: string, project: string): void; markChanged(id: string): void; dirty: Accessor<ReadonlySet<string>>; setDirty(id: string, dirty: boolean): void; registerSaver(id: string, save: (() => Promise<boolean>) | null): void; dirtyTabsToClose(ids: string | readonly string[]): FileTab[]; saveFiles(ids: string[]): Promise<boolean>; sync(find: (id: string) => { project: string; titulo: string; } | null): string[]; }; projectCatalog: { rows: Accessor<Project[]>; readyScope: Accessor<ReadyScope | null>; state: Accessor<ResourceState<string, Project[]>>; refresh: () => Promise<Project[]>; changed: () => Promise<Project[]>; fromCache(projects: Project[]): void; workspaceChanged(preserveCached?: boolean): void; discardUnconfirmedCache(): void; readForMachine(machine: string): Promise<Project[]>; rename: (id: string, name: string) => Promise<void>; attach: (id: string, source: string) => Promise<void>; detach: (id: string, source: string) => Promise<void>; workTree: (id: string, dir: string | null) => Promise<void>; remove: (id: string) => Promise<void>; dispose(): void; }; reconcileActiveTurns: () => Promise<void>; refetchMachines: () => Promise<void | never[]>; refreshSessions: (proyectos: string[]) => Promise<void>; sessionId: Accessor<string | null>; sessionLists: { refresh: (projects: string[]) => Promise<void>; gathered: (projects: string[]) => Promise<void>; reset(): void; }; setAlta: Setter<boolean>; setAviso: Setter<{ texto: string; boton?: string; ir?: () => void; } | null>; setBloqueo: Setter<Frase | null>; setCuentasTocadas: Setter<number>; setDesdeDeTurno: Setter<Record<string, number>>; setDraftBases: Setter<Record<string, string>>; setEnCache: Setter<boolean>; setError: Setter<string | null>; setEscritorio: Setter<string | null>; setFolder: Setter<string | null>; setMaterialError: Setter<string | null>; setProject: Setter<string>; setProjectReadError: Setter<string | null>; setProyectoAbierto: Setter<string | null>; setSesiones: Setter<Record<string, SessionRow[]>>; setSessionId: Setter<string | null>; setSettlingTurns: Setter<string[]>; setSources: Setter<Source[]>; setSpaces: Setter<Space[]>; setStartupReadError: Setter<string | null>; setTaskSourcesError: Setter<string | null>; setVentana: Setter<Ventana>; setVivas: Setter<string[]>; shellCache: ShellSnapshot | null; soltarCola: () => void; taskQueues: { items: Accessor<Encolado[]>; owner: Accessor<string | null>; editing: Accessor<boolean>; saved: (session: string) => Readonly<Saved> | undefined; openSession: (session: string, project: string, isCurrent?: () => boolean, fromEngine?: boolean) => Promise<void>; detach: () => void; remove: (id: string, session?: string | null) => void; persist: (session: string, project: string, queued: Encolado[]) => Promise<unknown>; adopt: (session: string) => string; editMode: (value: boolean) => boolean; enqueue: (message: Encolado, front?: boolean) => Encolado[]; edit: (id: string, text: string, mentions?: TaskMention[]) => Encolado[]; prioritize: (id: string) => Encolado[]; workspaceChanged: () => void; dispose: () => void; }; threads: { read: (project: string, id: string, before?: number | null | undefined) => Promise<Session>; acceptSession: (id: string, session: Session, clear: boolean, generation: number, latest?: boolean | undefined) => boolean; activities: (id: string, visible: readonly Msg[]) => ObservedTurnActivity<Msg>[]; beginActivity: (id: string, startedAt: number | null, startConfirmed?: boolean) => void; finishActivity: (id: string, workspace?: string | null) => void; rows: Accessor<Record<string, Hilo>>; current: Accessor<Hilo>; messages: Accessor<Msg[]>; loading: Accessor<string | null>; origins: Accessor<Readonly<Record<string, TranscriptOrigin | null>>>; offline: Accessor<Readonly<Record<string, string>>>; machineWaits: Accessor<Readonly<Record<string, MachineWait>>>; handovers: Accessor<Readonly<Record<string, HandoverState>>>; olderAvailable: Accessor<Readonly<Record<string, boolean>>>; recentAvailable: Accessor<Readonly<Record<string, boolean>>>; olderStatus: Accessor<Readonly<Record<string, OlderState>>>; recentTail: Accessor<Readonly<Record<string, Msg[]>>>; appendLive: (session: string, messages: Msg[], workspace?: string | null) => void; appendPersisted: (session: string, messages: Msg[]) => void; appendOptimistic: (session: string, messages: Msg[]) => void; acknowledgeOptimistic: (session: string, messages: Msg[]) => void; commitUniqueTurn: (session: string, message: Msg) => void; replaceTurn: (session: string, message: Msg) => void; reviseOptimistic: (session: string, target: Msg, patch: Pick<Msg, "respuestas" | "author">) => void; rejectOptimistic: (session: string, messages: Msg[]) => void; question: (session: string, fields: Pick<Msg, "turno" | "preguntas" | "questionRequestId" | "agent">, workspace?: string | null) => void; replay: (session: string, workspace?: string | null, replayId?: string) => void; finishSteps: (session: string) => void; event: (payload: ChatEvent, metadata: TranscriptMetadata) => void; older: (project: string, id: string) => Promise<(() => void) | null>; latest: (id: string) => Promise<void>; replaceHistory: (session: string, leida: Msg[], vaciarVivo: boolean, antepuesta?: boolean, guardados?: IdsDeTurnos, cola?: IdsDeTurnos, readRevision?: number) => void; saveWorkspace: (previous: string | null) => void; activateWorkspace: (workspace: string | null) => void; resetService: () => void; adoptDraft: (id: string) => void; dropSaved: (workspace: string, id: string) => void; flush: () => void; markMachineWait: (id: string, wait: MachineWait | null) => void; markAwake: (id: string) => void; startLoading: (id: string) => void; finishLoading: (id: string) => void; reading: (id: string, active: boolean) => void; drop: (session: string) => void; dispose: () => void; }; workspaceActivo: Accessor<string | null>; workspaceContext: { active: Accessor<string | null>; mode: Accessor<string | null>; root: Accessor<string | null>; confirmed: Accessor<boolean>; generation: () => number; beginTransition: (startup: StartupContext) => Transition; activate: (token: Transition) => boolean; beginMaterial: () => Readonly<{ generation: number; material: number; }>; current: (token: Readonly<{ generation: number; material: number; }>) => boolean; currentMaterial: (token: Readonly<{ generation: number; material: number; }>) => boolean; confirmContext: (token: Readonly<{ generation: number; material: number; }>, candidate: string | null, listed: ContextSource[]) => "obsolete" | "unavailable" | "accepted"; modeChanged: (workspace: string | null, value: string | null, requestedGeneration?: number) => void; dispose: () => void; } };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 1724–2004, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createAttachments(deps: AttachmentsDeps) {
  const { adjuntosEn, asentarEscritorio, asleep, composer, confirmContext, deLaTarea, documentosEn, draftOptions, drafts, enCache, enMaquina, finishedTurns, grupos, guardarCache, handoff, hilos, machineName, machines, paneles, pegadasEn, pestanas, projectCatalog, refetchMachines, refreshSessions, sessionId, sessionLists, setAlta, setAviso, setBloqueo, setCuentasTocadas, setDesdeDeTurno, setDraftBases, setEnCache, setError, setEscritorio, setFolder, setMaterialError, setProject, setProjectReadError, setProyectoAbierto, setSesiones, setSessionId, setSettlingTurns, setSources, setSpaces, setStartupReadError, setTaskSourcesError, setVentana, setVivas, shellCache, taskQueues, threads, workspaceActivo, workspaceContext } = deps;
  const abrirSesion = ((...a: Parameters<typeof deps.abrirSesion>) => deps.abrirSesion(...a)) as typeof deps.abrirSesion;
  const loadThread = ((...a: Parameters<typeof deps.loadThread>) => deps.loadThread(...a)) as typeof deps.loadThread;
  const loadWindowThreads = ((...a: Parameters<typeof deps.loadWindowThreads>) => deps.loadWindowThreads(...a)) as typeof deps.loadWindowThreads;
  const reconcileActiveTurns: AttachmentsDeps["reconcileActiveTurns"] = (...a: Parameters<AttachmentsDeps["reconcileActiveTurns"]>) => deps.reconcileActiveTurns(...a);
  const soltarCola: AttachmentsDeps["soltarCola"] = (...a: Parameters<AttachmentsDeps["soltarCola"]>) => deps.soltarCola(...a);
  /**
   * Los adjuntos con las rutas de la máquina donde corre el turno. Un archivo
   * soltado o elegido se prepara en el motor de la ventana; una imagen pegada,
   * en la máquina del turno (`pegarImagen`). Lo que no está ya allá viaja
   * antes de mandar (`lib/remoteAttachments.ts`).
   */
  async function attachmentsFor(paths: string[], options: { headers: Record<string, string> } | undefined, proyecto: string): Promise<string[]> {
    const machine = options?.headers["x-terminus-machine"];
    const local = (id: string | undefined) => !id || !!machines().find((x) => x.id === id)?.local;
    const alla = (path: string) => adjuntosEn.get(path) === machine || (local(adjuntosEn.get(path)) && local(machine));
    const documentos = documentosEn(options);
    try {
      const listas = await attachmentsOn(paths, alla, {
        documentos,
        read: (path) => invoke<Preview>("preview_file", { path, rel: path }, enMaquina(adjuntosEn.get(path))),
        save: (mime, datos, nombre) => {
          if (documentos) return invoke<string>("guardar_adjunto", { mime, nombre: nombre ?? null, datos }, options);
          return invoke<string>("guardar_imagen_pegada", { mime, datos }, options);
        },
        prepare: (saved) => invoke<string[]>("prepare_attachments", { project: proyecto, paths: saved }, options),
      });
      if (machine) for (const path of listas) adjuntosEn.set(path, machine);
      return listas;
    } catch (e) {
      if (!(e instanceof NotMovable)) throw e;
      throw { what: t("chat.attachments.remote_unsupported", { names: lista(e.names), machine: machineName(machine ?? "local") }), detail: "remote_unsupported" };
    }
  }

  /** Los bytes ya están en la ventana: van directo a la máquina del turno, sin pasar por la miniatura de 4 MB. */
  async function pegarImagen(mime: string, datos: string, nombre?: string): Promise<string> {
    const abierta = sessionId();
    const opciones = abierta ? deLaTarea(abierta) : draftOptions();
    const ruta = documentosEn(opciones)
      ? await invoke<string>("guardar_adjunto", { mime, nombre: nombre ?? null, datos }, opciones)
      : await invoke<string>("guardar_imagen_pegada", { mime, datos }, opciones);
    const machine = opciones?.headers["x-terminus-machine"];
    if (machine) pegadasEn.set(ruta, machine);
    return ruta;
  }

  // La carpeta de trabajo de la tarea: se abre afuera desde la cabecera y la
  // columna, y resuelve lo que el hilo anuncia por su ruta relativa
  // (`abrirPorRel`).
  async function refreshFolder(p: string, id: string) {
    try {
      setFolder(await invoke<string>("session_folder", { project: p, id }, deLaTarea(id)));
    } catch {
      setFolder(null);
    }
  }

  // Vuelve a leer el material del workspace sin tocar lo que hay abierto: es
  // la mitad de `aplicar` que no es una mudanza. Traer un repositorio cambia
  // lo que el workspace tiene, no en qué workspace estás. Aquí un fallo no
  // vacía las listas, al revés que en `aplicar`: allá lo que quedara en
  // pantalla sería de otro cliente, aquí es de este.
  let startupRetryRequest = 0;
  async function retryStartupRead() {
    const generation = workspaceContext.generation();
    const workspace = workspaceActivo();
    const request = ++startupRetryRequest;
    const current = () => request === startupRetryRequest && generation === workspaceContext.generation() && workspace === workspaceActivo();
    try {
      const startup = await invoke<Startup>("workspaces_startup");
      if (!current()) return;
      if (startup.bloqueo) { setBloqueo(startup.bloqueo); return; }
      if (workspace === null) await aplicar(startup);
      else if (startup.active === workspace) setStartupReadError(null);
    } catch (cause) {
      if (current() && !asleep(cause)) setStartupReadError(prosaDe(cause));
    }
  }

  async function recargarMaterial() {
    const request = workspaceContext.beginMaterial();
    const workspace = workspaceActivo();
    if (!workspace) return;
    setMaterialError(null);
    try {
      const arranque = await invoke<Startup>("list_workspaces");
      if (!workspaceContext.currentMaterial(request)) return;
      const current = arranque.workspaces.find((w: any) => w.id === workspace);
      if (!current) throw { what: t("projects.context.unavailable"), detail: "context_unavailable" };
      const root = current.context_root;
      const [, fuentes] = await Promise.all([
        projectCatalog.changed().then(rows => {
          if (workspaceContext.currentMaterial(request)) setProjectReadError(null);
          return rows;
        }),
        invoke<Source[]>("list_sources"),
      ]);
      if (!workspaceContext.currentMaterial(request)) return;

      setSources(fuentes);
      confirmContext(request, root, fuentes);
    } catch (e) {
      if (!workspaceContext.currentMaterial(request) || asleep(e)) return;
      setMaterialError(prosaDe(e));
    }
  }

  // Deja la pantalla como la de este workspace, y solo la de este.

  // Cambiar de workspace no filtra una lista: cambia la carpeta en disco.
  // Lo que hay puesto —sesión, conversación, artefactos, consumo, cola,
  // material pendiente— es de otro cliente y no puede quedarse ni un
  // render: lo que se quede escribe en el cliente equivocado y sin verse.

  // La cola: el efecto que la guarda resuelve la carpeta por el workspace
  // activo, y una `colaDe` que nombre una tarea del anterior escribe un
  // `.cola.json` en `<workspace nuevo>/sessions/<tarea del viejo>/` —una
  // carpeta sin `session.json`, que `list_live_sessions` salta sin error.

  // El material pendiente (`sourceIds`): los chips desaparecen solos
  // —`conFuente` los cruza contra las fuentes del workspace nuevo—, pero
  // los ids seguirían viajando en el `send_message` siguiente, y
  // `projects::reach` se salta el que no conoce en silencio.

  // Los archivos del borrador, incluida la conversación exportada al
  // continuar una tarea en otra: es una ruta absoluta del workspace
  // anterior, y mandarla copia su contenido a la carpeta de la tarea
  // nueva.

  // Los tres van en `borradores` y se vacían todos. No vale para «cambió el
  // material»: traer un repositorio a mitad de una tarea por aquí cierra la
  // conversación y deja la anterior abandonada, sin error y sin aviso. Para
  // eso está `recargarMaterial`.

  async function aplicar(a: Startup) {
    if (!requestedWorkspaceSnapshot(a)) return;
    guardarCache.flush();
    const activo = a.workspaces.find((w: any) => w.id === a.active);
  // Sin workspace se abre el alta. Si ya estaba abierta no se toca: el paso 1
  // acaba de crear uno, y volver a mirar aquí la cerraría a mitad.
  // En la web el workspace lo crea la plataforma al darse de alta: la ventana espera sin pedirlo.
    if (a.active === null && capabilities().localSetup) setAlta(true);
    const transition = workspaceContext.beginTransition(a);
  // La lengua es del workspace, y cambia al cambiar de cliente: eso es lo que
  // se pidió, no un efecto secundario. `null` hereda la de la máquina.
    aplicarLenguaDeWorkspace(activo?.lengua ?? null);
  // El tema de terminal sigue al workspace por lo mismo: es cómo se distingue
  // en qué cliente se está sin leer el nombre.
    aplicarTemaDeTerminal(activo?.terminal_theme ?? null);
    threads.saveWorkspace(transition.previous);
    const generation = workspaceContext.generation();
    let desdeCache = false;
    batch(() => {
      displayWorkspaceSnapshot(a);
      sessionLists.reset();
      taskQueues.workspaceChanged();
      handoff.reset();
      workspaceContext.activate(transition);
      // «Ejecutar en» dice qué tiene cada máquina del workspace abierto: con otro, se relee.
      void refetchMachines();
      setDraftBases({});
      // Sale la tira del anterior antes que `setSessionId(null)`, que apuntaría
      // «ninguna activa» en la que siga cargada. La nueva es la del escritorio y
      // entra abajo, al leer los espacios, con qué tarea tenía abierta.
      // El reparto de la que se va ya está guardado por espacio; se corta antes
      // de vaciar la tira, para que soltar sus pestañas no pise su rejilla.
      paneles.bindTo(null, null);
      pestanas.load(null);
      // El mismo workspace que la caché: sus filas se quedan hasta que lleguen las de verdad.
      desdeCache = enCache() && shellCacheMatches(shellCache, a.active);
      projectCatalog.workspaceChanged(desdeCache);
      if (!desdeCache) setEnCache(false);
      batch(() => {
        if (!desdeCache) {
          setSpaces([]);
          setEscritorio(null);
        }
        setAviso(null);
      });
      // Y la pantalla vuelve a una ventana: la rejilla que había era la del
      // cliente que se deja, y la del que llega la pone `asentarEscritorio`.
      paneles.reset();
      setSessionId(null);
      setProyectoAbierto(null);
      threads.activateWorkspace(a.active);
      setDesdeDeTurno({});
      drafts.reset();
      setVivas([]);
      setSettlingTurns([]);
      finishedTurns.clear();
      deps.lifecycleRevision++;
      setFolder(null);
      setVentana(null);
      if (!desdeCache) setSesiones({});
      soltarCola();
      drafts.replaceAttached([]);
      // Y las cuentas, que también son de este workspace: la franja de consumo las
      // lee una vez y se quedaría enseñando las del cliente anterior —nombre,
      // correo y cuánto le queda— sin que nada avise.
      setCuentasTocadas((n) => n + 1);
      // Con qué se puede trabajar es del workspace por lo mismo: la
      // credencial y el consentimiento cuelgan de él; el menú del otro
      // cliente ofrecería lo que este no tiene conectado.
      void composer.refreshSurfaces(true);
      setError(null);
      setMaterialError(null);
      setTaskSourcesError(null);
      setProjectReadError(null);
      setStartupReadError(null);
      // Ni con un solo proyecto se preselecciona. Autoseleccionar cuando la lista
      // trae uno ahorra un clic y reintroduce la sorpresa.
      setProject("");
    });
    // Sin workspace no se pregunta por lo que cuelga de él: preguntarlo
    // devolvía «Todavía no hay ningún workspace», pintado como error rojo
    // encima del primer arranque —la app avisando de que falta lo que esa
    // misma pantalla está pidiendo.
    if (a.active === null) {
      setSources([]);
      return;
    }
    const pedidas = invoke<Space[]>("list_spaces").catch(() => null);
    // Con las carpetas de la caché, sus tareas se leen a la vez que la lista de carpetas.
    const primeras = desdeCache ? refreshSessions(grupos()) : null;
    try {
      // A la vez, no una detrás de otra: no dependen entre sí, y
      // encadenadas sumaban sus latencias en el arranque. `list_sources`
      // esperaba a que volviera `list_projects` para preguntar algo que
      // no usa su respuesta.
      // Las fuentes que no llegan (su máquina apagada, sin copia) dejan las de antes y no tumban las carpetas.
      const [, fuentes] = await Promise.all([
        projectCatalog.refresh(),
        invoke<Source[]>("list_sources").catch(() => null),
      ]);
      if (generation !== workspaceContext.generation()) return;

      if (workspaceContext.currentMaterial(transition)) {
        if (fuentes) {
          setSources(fuentes);
          confirmContext(transition, activo?.context_root ?? null, fuentes);
        } else setMaterialError(t("projects.context.unavailable"));
      }
    } catch (e) {
      if (generation !== workspaceContext.generation() || !workspaceContext.currentMaterial(transition)) return;
      // Una máquina dormida no es un fallo, pero el arranque sigue: sin salir
      // de la caché, la ventana se queda inerte con la foto de la vez anterior
      // y no restaura pestañas ni se entera de cuando la máquina enciende.
      if (!asleep(e)) {
        setSources([]);
        setMaterialError(prosaDe(e));
      }
    }
    if (primeras) {
      // Si cambiaron las carpetas, `grupos` relee también las nuevas; esta lectura ya vale para las de siempre.
      await primeras;
      if (generation !== workspaceContext.generation()) return;
      setEnCache(false);
    }
    // La tarea que estaba abierta en este workspace vuelve a estarlo, que es lo
    // que hace un navegador al arrancar. Si su pestaña apunta a una tarea que
    // ya no existe, `abrirSesion` lo dice en la conversación y la
    // sincronización con el historial se lleva la pestaña.
    const lista = await pedidas;
    if (generation !== workspaceContext.generation()) return;
    const desk = asentarEscritorio(a.active, lista);
    const restored = pestanas.load(a.active, desk);
    // El reparto de su espacio vuelve con la tira: la pantalla partida que se
    // dejó al cerrar. La tarea de delante la abre `abrirSesion`, abajo; las
    // otras ventanas cargan la suya por `loadWindowThreads`.
    paneles.bindTo(null, null);
    const vivos = pestanas.open().map((p) => p.id);
    paneles.restore(a.active !== null && desk ? readLayout(a.active, desk) : null, vivos);
    paneles.sync(vivos);
    if (a.active !== null && desk) paneles.bindTo(a.active, desk);
    // Sin reparto guardado, `sincronizar` pone delante la última pestaña y no la activa de la tira.
    if (restored) paneles.activate(restored);
    loadWindowThreads(restored);
    // Su lectura no espera a la conciliación, que tarda lo que tarde el servicio:
    // esperándola, la pestaña de delante salía vacía y sin indicador.
    const delante = restored ? pestanas.open().find((p) => p.id === restored) : undefined;
    if (delante && isTaskTab(delante) && !hilos()[delante.session]) {
      threads.startLoading(delante.session);
      void loadThread(delante.project, delante.session).finally(() =>
        threads.finishLoading(delante.session));
    }
    const enFrente = paneles.activeTabAt(paneles.activeSite());
    await reconcileActiveTurns();
    if (generation !== workspaceContext.generation()) return;
    // Lo que la persona abrió mientras se conciliaba gana: abrir la restaurada ahora le quitaría la ventana.
    if (sessionId() !== null || pestanas.active() !== null || paneles.activeTabAt(paneles.activeSite()) !== enFrente) return;
    if (delante) void abrirSesion(delante.project, delante.id);
  }
  return { aplicar, attachmentsFor, pegarImagen, recargarMaterial, refreshFolder, retryStartupRead };
}
