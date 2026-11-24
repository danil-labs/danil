import { type createSendGates as T_createSendGates, type createShellCommand as T_createShellCommand, type createThreadStream as T_createThreadStream } from "../../../features/chat/src";
import { t } from "../../../ui/src/lib/i18n";
import { type MentionSources } from "../../../ui/src/lib/mentions.ts";
import { carpetaDeTrabajo } from "../../../ui/src/lib/model";
import { type Agent, type AgentModels, type AgentProfile, type HandlerDefinition, type ModoDePermiso, type Source } from "../../../ui/src/lib/model.ts";
import { type CatalogosDeModelos, type OpcionDeModelo } from "../../../ui/src/lib/models.ts";
import { type Layout, type PanelGroup, type PanelSite, type Side } from "../../../ui/src/lib/panels-types.ts";
import { type RecipientCandidate, type SenderTask } from "../../../ui/src/lib/recipients.ts";
import { comandosConAlMargen } from "../../../ui/src/lib/side-question";
import { type CliCommand, type Skill } from "../../../ui/src/lib/skills.ts";
import { esProvisional } from "../../../ui/src/lib/taskDraft";
import { type TaskFilesPanel, type TaskFilesSide, type TaskSideMode } from "../../../ui/src/lib/taskFiles.ts";
import { type PlaceCandidate, type TaskCandidate, type TaskMention, type TextEdit } from "../../../ui/src/lib/taskMentions.ts";
import { type Ventana } from "../../../ui/src/lib/usage.ts";
import { type OlderState } from "../../../engine-client/src/history.ts";
import { capabilities } from "../../../host/src/platform";
import { Button } from "../../../ui/src/Button";
import { prosaDe } from "../../../ui/src/Failure";
import { type Preview } from "../../../ui/src/lib/preview.ts";
import { type Encolado } from "../../../ui/src/lib/queue.ts";
import { type RespuestaEnviada } from "../../../features/chat/src/components/Questions.tsx";
import { type ComandoEnVivo } from "../../../features/chat/src/components/ShellCard.tsx";
import { type AlMargen } from "../../../features/chat/src/components/SideQuestion.tsx";
import { type Lectura } from "../../../features/chat/src/model/threadWindow.ts";
import { openChatVisual, readChatVisual } from "../../../features/chat/src/queries/readVisual";
import { type createPanelDeChatParts as T_createPanelDeChatParts } from "./panel-de-chat-parts.tsx";
import { type createPanelDeChatState as T_createPanelDeChatState } from "./panel-de-chat-state.ts";
import { type createCloneFolder, type createCloneFolder as T_createCloneFolder, type createDeskStrip as T_createDeskStrip, type createSessionMutations, type createWorkspaceSession } from "../../../features/projects/src";
import { type default as AgentPageTasksScreen } from "../../../features/projects/src/screens/AgentPageTasks";
import { type carryOrigin } from "../../../features/machines/src/queries/store";
import { type default as CarryProgressScreen, type CarryOriginLabel as CarryOriginLabelScreen } from "../../../features/machines/src/screens/CarryProgress";
import { type ConversationScope } from "../../../ui/src/lib/handoff.ts";
import { type Draft } from "../../../ui/src/lib/draft.ts";
import { type SessionRow } from "../../../ui/src/lib/session-row.ts";
import Chat from "../../../features/chat/src/screens/Chat";
import { type PermissionRequest } from "../../../features/chat/src/screens/Chat.tsx";
import { DelegatedLaunch } from "../../../features/projects/src/screens/DelegatedTasks";
import PreviousAgentChat from "../../../features/chat/src/screens/PreviousAgentChat";
import { type ThreadSearchTarget } from "../../../features/chat/src/screens/ThreadSearch.tsx";
import TranscriptSource from "../../../features/chat/src/screens/TranscriptSource";
import ArrowLeft from "lucide-solid/icons/arrow-left";
import { Show, Suspense, type Accessor, type JSX, type Resource, type Setter, type ComponentProps, type lazy } from "solid-js";


/** Lo que el bloque usaba del cuerpo de App. */
export type PanelDeChatCellDeps = { CarryOriginLabel: ReturnType<typeof lazy<typeof CarryOriginLabelScreen>>; CarryProgress: ReturnType<typeof lazy<typeof CarryProgressScreen>>; createFreeRouterConsent: ComponentProps<typeof Chat>["createFreeRouterConsent"]; renderAvatar: ComponentProps<typeof Chat>["renderAvatar"]; renderPdf: ComponentProps<typeof Chat>["renderPdf"]; AgentPageTasks: typeof AgentPageTasksScreen; BaseBranchPicker: (props: { project: string; directory?: string | null; machine?: string | null; preference?: boolean; inlineLabel?: boolean; value?: string | null; disabled?: boolean; onChange?: (reference: string) => void; }) => JSX.Element; RecentAgentChats: (props: { project: string; agent: string; sessions: SessionRow[]; onPick: (id: string) => void; }) => JSX.Element; ResumeTask: (props: { project: string; id: string; onChanged: () => void; }) => JSX.Element; SelectorDeProyecto: (props: { branch?: JSX.Element; locked?: boolean; nueva?: boolean; }) => JSX.Element; TaskFilesRow: (props: { open: boolean; covers: boolean; hasTabs: boolean; width: number; treeWidth: number; onWidth: (fraction: number) => void; onTreeWidth: (px: number) => void; location?: () => JSX.Element; chat: JSX.Element; }) => JSX.Element; abrirPorRel: (rel: string) => void; abrirSesion: (proyecto: string, id: string, activar?: string, propagateError?: boolean) => Promise<void>; abrirTraer: (proyecto: string | undefined, id: string) => Promise<void>; adjuntarFuente: (id: string) => Promise<void>; agent: Accessor<string>; agents: Accessor<Agent[]>; agregarArchivos: (paths: string[]) => Promise<void>; alMargen: Accessor<AlMargen | null>; anchoDeArchivos: Accessor<number>; anchoDelArbol: Accessor<number>; archivos: () => string[]; archivosDeTarea: { panel: (task: string) => TaskFilesPanel; setOpen: (task: string, open: boolean) => void; present: (task: string, mode: TaskSideMode) => void; toggle: (task: string) => void; setExpanded: (task: string, expanded: boolean) => void; setTree: (task: string, tree: boolean) => void; setSide: (task: string, side: TaskFilesSide) => void; open: (task: string, file: { tree: string; path: string; changes: boolean; changed?: boolean; pinned?: boolean; }) => void; pin: (task: string, id: string) => void; activate: (task: string, id: string) => void; setDirty: (task: string, id: string, dirty: boolean) => void; close: (task: string, ids: string[]) => string[]; renamed: (task: string, tree: string, from: string, to: string) => void; removed: (task: string, tree: string, path: string) => void; dirtyOf: (task: string) => string[]; forget: (task: string) => void; }; arrancando: Accessor<boolean>; avisarDeLosArboles: (session: string) => void; borrador: () => Draft; bringHereLabel: () => string; busy: () => boolean; cambiarRama: (fuente: Source, rama: string) => Promise<void>; canBringHere: () => boolean; cancelarPregunta: (turno: string) => Promise<void>; cargandoHilo: Accessor<string | null>; cargarAntiguos: (project: string, id: string) => Promise<(() => void) | null>; carpetasDeTerminal: Accessor<Record<string, string>>; carryModule: ReturnType<typeof T_createSendGates>["carryModule"]; carryOrigin: typeof carryOrigin; catalogos: Accessor<CatalogosDeModelos>; cerrarAlMargen: () => void; chooseEffort: (id: string) => void; claveAbierta: () => string; cliCommands: Accessor<CliCommand[]>; cola: Accessor<Encolado[]>; compacta: Accessor<boolean>; composer: ReturnType<typeof T_createDeskStrip>["composer"]; conAntiguos: Accessor<Readonly<Record<string, boolean>>>; conRecientes: Accessor<Readonly<Record<string, boolean>>>; contexto: Accessor<Source[]>; conversationScope: (id: string, projectId?: string) => ConversationScope; createdTasks: (rows: SessionRow[], agent: string, thread: string | null, folder?: string) => SessionRow[]; deleteTask: (project: string, id: string, members?: number) => void; desdeDeTurno: Accessor<Record<string, number>>; detener: () => Promise<void>; detenerYEnviar: (id: string) => Promise<void>; displayName: (name: string, profile?: AgentProfile) => string; documentosEn: (options: { headers: Record<string, string>; } | undefined) => boolean; draftBases: Accessor<Record<string, string>>; draftMachine: () => string | null; draftMachineOn: () => boolean | undefined; drafts: ReturnType<typeof T_createDeskStrip>["drafts"]; editarEncolado: (id: string, text: string, mentions?: TaskMention[]) => void; effort: Accessor<string>; elegirModelo: (opcion: OpcionDeModelo) => void; elegirModo: (id: string) => void; enFondo: Accessor<string[]>; enviarDeLaCola: (session: string, id: string, clientMessageId?: string) => Promise<void>; esRemota: (id: string) => boolean; esperaMaquinaEn: (sesion: string | null | undefined) => { phase: "waking" | "connecting"; name: string; wakes: boolean; } | null; esperando: ReturnType<typeof createCloneFolder>["esperando"]; estadoAntiguos: Accessor<Readonly<Record<string, OlderState>>>; estadoDePanelDeChat: ReturnType<typeof T_createPanelDeChatState>["estadoDePanelDeChat"]; etaparSesion: ReturnType<typeof createSessionMutations>["etaparSesion"]; filaDe: (id: string) => SessionRow | undefined; forkDesde: (turno: string, mode: "full" | "focused", encargado: string | null) => Promise<void>; guardarLectura: (session: string | null, lectura: Lectura | null) => void; handoff: ReturnType<typeof T_createThreadStream>["handoff"]; handoffAt: ReturnType<typeof T_createThreadStream>["handoffAt"]; injecting: Accessor<{ session: string; id: string; }[]>; input: () => string; machineOf: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; mandar: (attachments: string[]) => Promise<boolean>; mandarCola: () => undefined; mandarTexto: (texto: string) => Promise<boolean>; materialPendiente: Accessor<Source[]>; materialTarget: () => string; mentionSources: Accessor<MentionSources | null>; miniaturaDeAdjunto: (rel: string) => Promise<string | null>; model: Accessor<string>; models: Accessor<AgentModels | null>; modo: Accessor<string>; modos: Accessor<ModoDePermiso[]>; moverSesion: (de: string, id: string, a: string) => Promise<void>; navigateMentionHistory: (redo: boolean) => boolean; opcionesDeAdjunto: () => { headers: { "x-terminus-machine": string; }; } | undefined; paneles: { columns: Accessor<PanelGroup[][]>; widths: Accessor<number[]>; heights: Accessor<number[]>; rowCount: () => number; activeSite: Accessor<PanelSite>; sites: () => PanelSite[]; siteOf: (id: string) => PanelSite | null; groupAt: (site: PanelSite) => PanelGroup | null; groupCount: () => number; rowsPerColumn: () => number[]; isSplit: () => boolean; canSplit: () => boolean; tabsAt: (site: PanelSite) => string[]; activeTabAt: (site: PanelSite) => string | null; isVisible: (id: string) => boolean; focus(site: PanelSite): void; showDraft(): void; activate(id: string): void; renameTabs(pairs: [string, string][]): void; placeLikeStrip(ids: string[], strip: string[]): void; sync(ids: string[]): boolean; close(id: string): string | null; move: (id: string, a: PanelSite, index?: number) => boolean; split: (id: string) => boolean; canSplitAt: (id: string, reference: PanelSite, side: Side, unplaced?: boolean) => boolean; splitAt: (id: string, reference: PanelSite, side: Side) => boolean; join: () => boolean; resizeColumns(i: number, a: number, b: number): void; resizeRows(i: number, a: number, b: number): void; layout: () => Layout; restore(layout: Layout | null, live: readonly string[]): void; bindTo(workspace: string | null, space: string | null): void; reset(): void; }; pasarAlHilo: () => void; pegarImagen: (mime: string, datos: string, nombre?: string) => Promise<string>; perfilDePanelDeChat: ReturnType<typeof T_createPanelDeChatParts>["perfilDePanelDeChat"]; permissionError: Accessor<string | null>; permissions: Accessor<PermissionRequest[]>; placeCandidates: Accessor<PlaceCandidate[]>; porContestar: Accessor<readonly string[]>; previewDeAdjunto: (rel: string) => Promise<Preview | null>; project: ReturnType<typeof createWorkspaceSession>["project"]; projectList: ReturnType<typeof createWorkspaceSession>["projectList"]; quitarEncolado: (id: string) => void; quitarFuente: (id: string) => Promise<void>; razonDeLaCola: ReturnType<typeof T_createShellCommand>["razonDeLaCola"]; recipientCandidates: Accessor<RecipientCandidate[]>; refreshFolder: (p: string, id: string) => Promise<void>; refreshTaskCandidates: () => Promise<void>; reintentar: () => Promise<void>; reintento: Accessor<{ session: string; intento: number; total: number; clase: string; } | null>; renombrarSesion: (proyecto: string, id: string, title: string) => Promise<boolean>; responder: (turno: string, manda: RespuestaEnviada[]) => Promise<boolean>; responderPermiso: (p: PermissionRequest, allow: boolean) => Promise<void>; respondiendoPermiso: Accessor<boolean>; rosterDelProyecto: Resource<HandlerDefinition[]>; saveDraftConfiguration: (mode?: string, clave?: string) => void; senderTaskId: (machine: string, task: string) => string; sesionesConEstado: ReturnType<typeof T_createCloneFolder>["sesionesConEstado"]; sessionId: ReturnType<typeof createWorkspaceSession>["sessionId"]; setAnchoDeArchivos: (valor: number) => void; setAnchoDelArbol: (valor: number) => void; setArchivos: ReturnType<typeof T_createDeskStrip>["setArchivos"]; setDraftBases: Setter<Record<string, string>>; setError: Setter<string | null>; setHablandoCon: Setter<{ project: string; name: string; } | null>; setInput: (value: string, inputType?: string, change?: TextEdit) => void; setSettings: Setter<string | null>; setThreadSearchTargets: Setter<Map<string, ThreadSearchTarget>>; sideCommand: Accessor<string | null>; skills: Accessor<Skill[]>; superficie: Accessor<string>; tareaDelRiel: (id: string) => SenderTask | null; taskCandidates: Accessor<TaskCandidate[]>; taskMaterialOptions: () => { headers: { "x-terminus-machine": string; }; } | { headers: {}; } | undefined; taskQueues: ReturnType<typeof T_createThreadStream>["taskQueues"]; taskSources: Accessor<Source[] | null>; teclearAlComando: (id: string | null | undefined, texto: string, eco: boolean) => Promise<boolean>; terminales: Accessor<Record<string, ComandoEnVivo>>; threadTitle: (row: Pick<SessionRow, "inbox" | "title"> | undefined) => string; threads: ReturnType<typeof T_createDeskStrip>["threads"]; traer: (key: string) => Promise<void>; ubicacionDePanelDeChat: ReturnType<typeof T_createPanelDeChatParts>["ubicacionDePanelDeChat"]; ventana: Accessor<Ventana>; vivas: Accessor<string[]> };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 170–508, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createPanelDeChatCell(deps: PanelDeChatCellDeps) {
  const { CarryOriginLabel, CarryProgress, createFreeRouterConsent, renderAvatar, renderPdf, AgentPageTasks, BaseBranchPicker, RecentAgentChats, ResumeTask, SelectorDeProyecto, TaskFilesRow, abrirPorRel, abrirSesion, abrirTraer, adjuntarFuente, agent, agents, agregarArchivos, alMargen, anchoDeArchivos, anchoDelArbol, archivos, archivosDeTarea, arrancando, avisarDeLosArboles, borrador, bringHereLabel, busy, cambiarRama, canBringHere, cancelarPregunta, cargandoHilo, cargarAntiguos, carpetasDeTerminal, carryModule, carryOrigin, catalogos, cerrarAlMargen, chooseEffort, claveAbierta, cliCommands, cola, compacta, composer, conAntiguos, conRecientes, contexto, conversationScope, createdTasks, deleteTask, desdeDeTurno, detener, detenerYEnviar, displayName, documentosEn, draftBases, draftMachine, draftMachineOn, drafts, editarEncolado, effort, elegirModelo, elegirModo, enFondo, enviarDeLaCola, esRemota, esperaMaquinaEn, esperando, estadoAntiguos, estadoDePanelDeChat, etaparSesion, filaDe, forkDesde, guardarLectura, handoff, handoffAt, injecting, input, machineOf, mandar, mandarCola, mandarTexto, materialPendiente, materialTarget, mentionSources, miniaturaDeAdjunto, model, models, modo, modos, moverSesion, navigateMentionHistory, opcionesDeAdjunto, paneles, pasarAlHilo, pegarImagen, perfilDePanelDeChat, permissionError, permissions, placeCandidates, porContestar, previewDeAdjunto, project, projectList, quitarEncolado, quitarFuente, razonDeLaCola, recipientCandidates, refreshFolder, refreshTaskCandidates, reintentar, reintento, renombrarSesion, responder, responderPermiso, respondiendoPermiso, rosterDelProyecto, saveDraftConfiguration, senderTaskId, sesionesConEstado, sessionId, setAnchoDeArchivos, setAnchoDelArbol, setArchivos, setDraftBases, setError, setHablandoCon, setInput, setSettings, setThreadSearchTargets, sideCommand, skills, superficie, tareaDelRiel, taskCandidates, taskMaterialOptions, taskQueues, taskSources, teclearAlComando, terminales, threadTitle, threads, traer, ubicacionDePanelDeChat, ventana, vivas } = deps;
  const PanelDeChat = (pp: {
    sesion: string | null;
    /** El proyecto de esa tarea. `null` en la ventana en blanco, que no tiene. */
    proyecto?: string | null;
    soloLectura?: boolean;
  }) => {
    const estado = estadoDePanelDeChat(pp);
    const { visualWorkspace, esperandoAqui, proyectoDeLaCelda, clavePanel, estadoDelTrabajo, refreshWork, delegation, delegationData, delegatedRows, delegatedList, coordinatingTask, recuperable, origenArchivada, esRepositorio, encargadoDeLaCelda, bloqueoDeTraspaso, motivoDeTraspaso, identidadVisualDeLaCelda, estadoDelEncargado, profiles, cellProfile, declared, viewingProfile, setViewingProfile, lecturaDeLaCelda, preguntasDeLaCelda, vistaDeLaCelda, mensajes, historialAnteriorEnReposo, soloPorSerAnterior, seguirConElAgente } = estado;
    const ubicacion = ubicacionDePanelDeChat(pp, estado);
    return (
    <Show
      when={viewingProfile() && declared()}
      fallback={
    <TaskFilesRow
      open={!!clavePanel() && archivosDeTarea.panel(clavePanel()).open}
      covers={!!clavePanel() && (archivosDeTarea.panel(clavePanel()).expanded || paneles.isSplit() || compacta())}
      hasTabs={!!clavePanel() && archivosDeTarea.panel(clavePanel()).tabs.length > 0}
      width={anchoDeArchivos()}
      treeWidth={anchoDelArbol()}
      onWidth={setAnchoDeArchivos}
      onTreeWidth={setAnchoDelArbol}
      location={ubicacion}
      chat={
    <Chat
        besideFiles={!!clavePanel() && archivosDeTarea.panel(clavePanel()).open}
        onSearchReady={target => {
          if (!pp.sesion) return;
          setThreadSearchTargets(previous => {
            const next = new Map(previous);
            if (target) next.set(pp.sesion!, target);
            else next.delete(pp.sesion!);
            return next;
          });
        }}
        soloLectura={pp.soloLectura || (!!pp.sesion && !esProvisional(pp.sesion) && capabilities().taskWritable?.(pp.sesion) === false) || !!estadoDelTrabajo()?.history.archived || estadoDelTrabajo()?.available === false || historialAnteriorEnReposo()}
        recovery={pp.sesion && (recuperable() || origenArchivada() !== undefined || soloPorSerAnterior()) ? <>
          <Show when={recuperable()}>
            <ResumeTask project={proyectoDeLaCelda()?.id ?? ""} id={pp.sesion ?? ""} onChanged={() => {
              void refreshWork();
              if (pp.sesion) {
                avisarDeLosArboles(pp.sesion);
                void refreshFolder(proyectoDeLaCelda()?.id ?? "", pp.sesion);
              }
            }} />
          </Show>
          <Show when={origenArchivada() !== undefined}>
            <TranscriptSource origin={origenArchivada() ?? null} agents={agents()} />
          </Show>
          <Show when={soloPorSerAnterior()}>
            <PreviousAgentChat name={encargadoDeLaCelda() ? displayName(encargadoDeLaCelda() ?? "", cellProfile()) : null}
              onContinue={seguirConElAgente} />
          </Show>
        </> : undefined}
        delegatedTask={reference => <DelegatedLaunch reference={reference.machine
          ? { ...reference, task: senderTaskId(reference.machine, reference.task) } : reference} rows={delegatedRows()}
          list={delegatedList} loading={delegation.loading} error={delegationData()?.error} />}
        coordinator={<>
          <Show when={coordinatingTask()}>
            <div class="shrink-0 px-4 py-1">
              <Button variant="ghost" size="sm" class="max-w-full min-w-0 shrink text-xs" data-task-coordinator
                onClick={() => void abrirSesion(coordinatingTask()!.folder, coordinatingTask()!.task)}>
                <ArrowLeft size={14} class="shrink-0" aria-hidden="true" />
                <span class="truncate">{t("chat.delegation.back", { title: coordinatingTask()!.title })}</span>
              </Button>
            </div>
          </Show>
          <Show when={!pp.sesion && carryModule()?.carries()[claveAbierta()]}>
            <Suspense fallback={null}>
              <CarryProgress draft={claveAbierta()} onRetry={() => void mandar(archivos())} onOpenSettings={(panel) => setSettings(panel)} />
            </Suspense>
          </Show>
          <Show when={pp.sesion && carryOrigin(pp.sesion)}>
            <Suspense fallback={null}><CarryOriginLabel session={pp.sesion ?? ""} onOpen={(p, id) => void abrirSesion(p, id)} /></Suspense>
          </Show>
          <Show when={pp.sesion && carryModule()?.carries()[`bring:${pp.sesion}`]}>
            <Suspense fallback={null}>
              <CarryProgress draft={`bring:${pp.sesion}`} onRetry={() => void traer(`bring:${pp.sesion}`)} onOpenSettings={(panel) => setSettings(panel)} />
            </Suspense>
          </Show>
          <Show when={pp.sesion && canBringHere() && esRemota(pp.sesion) && !carryModule()?.carries()[`bring:${pp.sesion}`]}>
            <div class="shrink-0 px-4 py-1">
              <Button variant="outline" size="compact" data-bring-here onClick={() => void abrirTraer(proyectoDeLaCelda()?.id, pp.sesion ?? "")}>
                {bringHereLabel()}
              </Button>
            </div>
          </Show>
        </>}
        machine={pp.sesion ? filaDe(pp.sesion)?.machine : undefined}
        activities={threads.activities(pp.sesion ?? "", mensajes())}
        msgs={mensajes()}
        /* Identidad de lo que tiene delante, no ids de proyecto/tarea: es lo
           único con lo que distingue «entró un mensaje» de «otra
           conversación». La caja es la misma instancia al cambiar de tarea:
           sin esto el fondo del hilo anterior quedaría puesto. */
        conversacion={pp.sesion ?? ""}
        /* Sin fila todavía es la que acaba de nacer vacía (`crearEnTareaVacia`). */
        sinEmpezar={!!pp.sesion && (filaDe(pp.sesion)?.turns ?? 0) === 0 && !filaDe(pp.sesion)?.chat_de_agente
          && !vivas().includes(pp.sesion) && cargandoHilo() !== pp.sesion}
        lectura={lecturaDeLaCelda()}
        onLectura={(lectura) => guardarLectura(pp.sesion, lectura)}
        chatEncargado={identidadVisualDeLaCelda()}
        agentDraft={!pp.sesion && !!encargadoDeLaCelda()}
        recentTasks={<Show when={!pp.sesion && encargadoDeLaCelda()}>{agent =>
          <RecentAgentChats project={proyectoDeLaCelda()?.id ?? ""} agent={agent()}
            sessions={sesionesConEstado()[proyectoDeLaCelda()?.id ?? ""] ?? []}
            onPick={id => { setHablandoCon(null); void abrirSesion(proyectoDeLaCelda()?.id ?? "", id); }} />
        }</Show>}
        agentTasks={<Show when={!pp.sesion && encargadoDeLaCelda()}>{agent => {
          const de = () => proyectoDeLaCelda()?.id ?? "";
          const folderOf = (id: string) => Object.entries(sesionesConEstado()).find(([, rows]) => rows.some(row => row.id === id))?.[0] ?? de();
          return <AgentPageTasks
            context={`${de()}/${agent()}`}
            tasks={createdTasks(Object.entries(sesionesConEstado()).flatMap(([folder, rows]) => rows.map(row => ({ ...row, folder }))), agent(), null, de())}
            list={{
              carpetaDe: row => projectList().find(item => item.id === folderOf(row.id))?.name,
              projectOf: row => folderOf(row.id), destinosDe: row => projectList().filter(item => item.id !== folderOf(row.id)).map(item => ({ id: item.id, name: item.name })),
              de: de(), current: null, vivas: vivas(), aprobando: permissions().map(item => item.session),
              destinos: projectList().filter(item => item.id !== de()).map(item => ({ id: item.id, name: item.name })),
              onDelete: (id, members) => void deleteTask(folderOf(id), id, members),
              onMove: (id, destination) => void moverSesion(folderOf(id), id, destination),
              onEtapa: (id, stage) => void etaparSesion(folderOf(id), id, stage),
              onRenombrar: (id, title) => void renombrarSesion(folderOf(id), id, title),
            }}
            onPick={id => { setHablandoCon(null); void abrirSesion(folderOf(id), id); }} />;
        }}</Show>}
        chatEstado={!pp.sesion && encargadoDeLaCelda() ? "awake" : estadoDelEncargado()}
        chatName={filaDe(pp.sesion ?? "")?.agent_thread
          ? t("projects.threads.heading", { name: displayName(identidadVisualDeLaCelda() ?? "", cellProfile()), title: threadTitle(filaDe(pp.sesion ?? "")) })
          : displayName(identidadVisualDeLaCelda() ?? "", cellProfile())}
        chatBody={cellProfile().body}
        workAgent={identidadVisualDeLaCelda()}
        chatDescription={declared()?.description}
        chatAvatar={cellProfile().avatar}
        bodyOf={(name) => profiles()[name]?.body ?? null}
        avatarOf={(name) => profiles()[name]?.avatar ?? null}
        onOpenProfile={() => setViewingProfile(true)}
        /* Que el hilo viene, no que no hay: sin esto el chat lee el vacío en
           vuelo como conversación nueva y salta al fondo (#315). Va por
           sesión y no por `hiloEnVuelo()` —global, solo pregunta por la
           abierta—: una celda separada tiene su propia lectura en vuelo. Es
           opcional: `tsc` no avisa si se pierde. */
        cargando={cargandoHilo() !== null && cargandoHilo() === pp.sesion}
        masRecientes={!!conRecientes()[pp.sesion ?? ""]}
        onRecientes={async () => {
          if (!pp.sesion) return;
          try { await threads.latest(pp.sesion); }
          catch (e) { setError(prosaDe(e)); }
        }}
        estadoAntiguos={estadoAntiguos()[pp.sesion ?? ""] ?? "idle"}
        onLeyendo={(leyendo) => {
          if (!pp.sesion) return;
          threads.reading(pp.sesion, leyendo);
        }}
        masAntiguos={!!conAntiguos()[pp.sesion ?? ""]}
        onAntiguos={() => cargarAntiguos(proyectoDeLaCelda()?.id ?? "", pp.sesion ?? "")}
        /* El medidor de memoria es de la sesión abierta —`ventana` se
           recalcula al abrir otra—: una celda separada no tiene el suyo. Va
           `null`, que el contrato lee como «todavía no hay ninguno». Pasarle
           `ventana()` enseñaría el de OTRA conversación, con un número
           creíble y equivocado. */
        ventana={pp.sesion === sessionId() ? ventana() : null}
        busy={pp.sesion === sessionId() ? busy() : esProvisional(pp.sesion) ? arrancando() : vivas().includes(pp.sesion ?? "")}
        stopping={handoffAt(pp.sesion, proyectoDeLaCelda()?.id)?.stopping ?? false}
        handoff={pp.sesion ? handoff.presentation(conversationScope(pp.sesion, proyectoDeLaCelda()?.id)) : null}
        agents={agents()}
        proyecto={
          <SelectorDeProyecto nueva={!pp.sesion} locked={!!encargadoDeLaCelda()} branch={
            /* Apagada no contesta sus ramas: la tarea sale de la rama por defecto. */
            <Show when={!pp.sesion && esRepositorio() && draftMachineOn() !== false}>
              <BaseBranchPicker
                project={project()}
                machine={draftMachine()}
                directory={carpetaDeTrabajo(proyectoDeLaCelda() ?? {})}
                value={draftBases()[claveAbierta()]}
                disabled={busy()}
                onChange={(reference) => {
                  setDraftBases((bases) => ({ ...bases, [claveAbierta()]: reference }));
                  saveDraftConfiguration();
                }}
              />
            </Show>
          } />
        }
        /* Tarea de ESTA ventana (`pp.sesion`), no la que tenga el mando: el
           botón vive dentro del hilo de cada panel. Sin git no se ofrece: la
           foto del turno incluye todo lo que se movió en la carpeta. */
        onVerCambios={esRepositorio() && pp.sesion ? () => {
          archivosDeTarea.setSide(pp.sesion!, "changes");
          archivosDeTarea.setOpen(pp.sesion!, true);
        } : undefined}
        material={materialPendiente()}
        materialTarget={materialTarget()}
        materialAvailable={taskSources() !== null && (!pp.sesion || !!taskMaterialOptions())}
        materialOptions={pp.sesion && filaDe(pp.sesion)?.machine
          ? { headers: { "x-terminus-machine": filaDe(pp.sesion)!.machine! } }
          : taskMaterialOptions()}
        contexto={contexto()}
        catalogo={taskSources() ?? []}
        onAdjuntarFuente={adjuntarFuente}
        onQuitarFuente={quitarFuente}
        onCambiarRama={cambiarRama}
        onAbrirArtefacto={abrirPorRel}
        onOpenTask={(folder, task, machine) => void abrirSesion(folder, machine ? senderTaskId(machine, task) : task)}
        tareaPorId={tareaDelRiel}
        /* Solo con tarea abierta y con el turno cerrado: exportar a mitad de una
           respuesta se llevaría una conversación sin ella. */
        onForkDesde={sessionId() ? forkDesde : null}
        forkAgents={(rosterDelProyecto() ?? []).map((e) => e.name)}
        forkAgent={sessionId() ? (filaDe(sessionId()!)?.agent ?? null) : null}
        onError={setError}
        adjuntos={archivos()}
        onAdjuntos={setArchivos}
        onAgregarAdjuntos={agregarArchivos}
        agent={agent()}
        modelOptions={composer.options()}
        /* Lo utilizable, más la superficie de la tarea abierta si dejó de
           serlo: una tarea viva no puede cambiar de agente en silencio. El
           `&&` va dentro del accesor y no aquí — ver `menuDeSuperficies`. */
        superficies={composer.menu()}
        superficie={superficie()}
        /* La salida del estado vacío: es la sección, no una superficie.
           Apuntaba al id de la primera —«claude», «opencode»—, válido
           cuando cada proveedor tenía panel propio; agrupada la
           configuración por secciones, ese id ya no nombra ningún panel y
           el primer arranque salía a ninguna parte, justo el peor sitio
           para romperse: lo primero que ve alguien sin nada conectado. */
        onConectar={() => setSettings("proveedores-ia")}
        onReintentar={() => void reintentar()}
        // El renglón de estado es de la tarea de esta celda, no de la del
        // panel activo: con la pantalla partida, leerlo de `sessionId()` hacía
        // que la misma tarea dijera «Libre» o «Cavilando» según el foco.
        reintento={
          reintento()?.session === pp.sesion ? reintento() : null
        }
        enFondo={enFondo().includes(pp.sesion ?? "")}
        machineWait={esperaMaquinaEn(pp.sesion)}
        inicioDelTurno={desdeDeTurno()[pp.sesion ?? ""] ?? null}
        terminal={terminales()[pp.sesion ?? ""] ?? null}
        carpetaDeTerminal={carpetasDeTerminal()[pp.sesion ?? ""] ?? null}
        onEntradaDeComando={(texto, eco) => teclearAlComando(pp.sesion, texto, eco)}
        models={models()}
        catalogos={catalogos()}
        model={model()}
        nativeSubagent={Boolean(pp.sesion && filaDe(pp.sesion)?.subagent)}
        /* Sólo mientras contesta, no con cualquier tarea abierta: cada
           turno guarda con qué modelo se contestó (`Turn::modelo_usado`),
           y la transcripción dice la verdad turno a turno; cambiar de
           modelo no la hace mentir. Lo del agente queda fijo, y lo
           sostiene `elegirModelo`. */
        modelLocked={Boolean(pp.sesion && filaDe(pp.sesion)?.subagent)}
        agentLocked={Boolean(pp.sesion) && bloqueoDeTraspaso() !== null}
        agentLockedReason={motivoDeTraspaso()}
        onModel={elegirModelo}
        effort={effort()}
        onEffort={chooseEffort}
        modo={modo()}
        modos={modos()}
        onModo={elegirModo}
        skills={skills()}
        commands={comandosConAlMargen({ commands: cliCommands(), skills: [], side_question: sideCommand() }, t("chat.side.menu"))}
        sideCommand={sideCommand()}
        contestandoALaTerminal={porContestar().includes(pp.sesion ?? "")}
        alMargen={alMargen()?.session === (pp.sesion ?? "") ? alMargen() : null}
        onCerrarAlMargen={cerrarAlMargen}
        onPasarAlHilo={pasarAlHilo}
        mentionSources={mentionSources()}
        input={input()}
        taskCandidates={taskCandidates()}
        onTaskMenuOpen={() => void refreshTaskCandidates()}
        taskMentions={borrador().task_mentions}
        mentionProject={project()}
        mentionSession={sessionId()}
        mentionMachineName={capabilities().taskMachine ? (id) => (id ? capabilities().machineName?.(id) : capabilities().windowMachine?.()?.name) : undefined}
        onMentionHistory={navigateMentionHistory}
        placeCandidates={placeCandidates()}
        recipientCandidates={recipientCandidates()}
        recipientFolder={projectList().find((p) => p.id === project())?.name}
        recipients={borrador().recipients}
        /* Llamar a alguien y adjuntar material entran por caminos distintos y
           acaban en listas distintas; lo que comparten es que insertar en el
           texto corre a la otra lista. */
        onRecipient={drafts.recipient}
        onReference={drafts.reference}
        onInput={setInput}
        onSend={mandar} renderAvatar={renderAvatar} renderPdf={renderPdf} createFreeRouterConsent={createFreeRouterConsent} machineOf={machineOf}
        onRespuestaRapida={mandarTexto}
        visualScope={JSON.stringify([visualWorkspace, pp.proyecto ?? "", pp.sesion])}
        readVisual={(file) => readChatVisual({ workspace: visualWorkspace, project: pp.proyecto ?? "", session: pp.sesion ?? "", machine: machineOf(pp.sesion) }, file)}
        openVisual={capabilities().nativeWindow ? (file) => openChatVisual({ workspace: visualWorkspace, project: pp.proyecto ?? "", session: pp.sesion ?? "", machine: machineOf(pp.sesion) }, file) : undefined}
        onMiniatura={miniaturaDeAdjunto}
        onPreview={previewDeAdjunto}
        onPegarImagen={pegarImagen}
        aceptaDocumentos={() => documentosEn(opcionesDeAdjunto())}
        onStop={detener}
        /* Solo el de la tarea que se está mirando: con el primero de la
           lista, dos turnos a la vez ponen la hoja de aprobar pegada a una
           conversación que no es la suya —el permiso sigue yendo a su
           sesión, pero se lee el comando de otra tarea sobre este hilo. No
           se pierde: la fila de esa tarea lo dice en el historial. */
        permission={permissions().find((p) => p.session === pp.sesion) ?? null}
        permissionError={permissionError()}
        respondingPermission={respondiendoPermiso()}
        onPermission={(permission, allow) =>
          void responderPermiso(permission, allow)
        }
        esperando={esperandoAqui()}
        onResponder={responder}
        onCancelarPregunta={cancelarPregunta}
        preguntasAMedias={preguntasDeLaCelda}
        vista={vistaDeLaCelda}
        cola={{
          items: cola(),
          pending: injecting().filter((item) => item.session === sessionId()).map((item) => item.id),
          agentes: agents(),
          actual: { agent: agent(), model: model() },
          retenida: razonDeLaCola(),
          onEditar: editarEncolado,
          onBorrar: quitarEncolado,
          onEditando: taskQueues.editMode,
          onMandar: mandarCola,
          // Con un id nuevo: el motor no sabe si el anterior salió, y este puede llegar dos veces.
          onReenviar: (id) => { const session = sessionId(); if (session) void enviarDeLaCola(session, id, crypto.randomUUID()); },
          onDetenerYEnviar: pp.sesion && vivas().includes(pp.sesion) && !esperando()
            ? detenerYEnviar
            : null,
        }}
        />
      } />
      }
    >
      {perfilDePanelDeChat(pp, estado)}
    </Show>
    );
  };
  return { PanelDeChat };
}
