import { type ObservedTurnActivity } from "../../../../../apps/desktop/src/lib/activityObservation.ts";
import { connected } from "../../../../../apps/desktop/src/lib/engineConnection";
import { type Agent, type AgentModels, type ModoDePermiso, type Project } from "../../../../../apps/desktop/src/lib/model.ts";
import { type CatalogosDeModelos, type OpcionDeModelo } from "../../../../../apps/desktop/src/lib/models.ts";
import { type ResourceState } from "../../../../../apps/desktop/src/lib/resource.ts";
import { type CliCommand, type Skill } from "../../../../../apps/desktop/src/lib/skills.ts";
import { type Superficie } from "../../../../../apps/desktop/src/lib/surfaces.ts";
import { type ContentTab, type FileTab, type Tab } from "../../../../../apps/desktop/src/lib/tabs.ts";
import { esProvisional, tituloProvisional } from "../../../../../apps/desktop/src/lib/taskDraft";
import { type TaskMention } from "../../../../../apps/desktop/src/lib/taskMentions.ts";
import { type OlderState } from "../model/history.ts";
import { invoke } from "../../../../engine-client/src/client.ts";
import { claveDe } from "../../../../ui/src/Failure";
import { type Encolado } from "../components/MessageQueue";
import { type Respuesta, type RespuestaEnviada } from "../components/Questions.tsx";
import { type ComandoEnVivo } from "../components/ShellCard.tsx";
import { mensajeDeFallo } from "../model/failures";
import { type HandoverState } from "../model/handover.ts";
import { type Msg } from "../model/messageTypes.ts";
import { esDeLaTerminal, interrumpible, type RazonDeRetencion } from "../model/queue";
import { type ChatEvent, type Session, type TranscriptOrigin } from "../model/transcript.ts";
import { type ComandoQueNace, type Corrida, type TerminalLanzada } from "./sleepSession.ts";
import { batch, createEffect, createMemo, on, onCleanup, onMount, type Accessor, type Setter } from "solid-js";

type ComposerConfiguration = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type ContextSource = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type ConversationScope = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type DefaultPermissionModeChange = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type DraftSelection = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type HandoffFact = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type HandoffPresentation = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type HandoffView = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Hilo = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type IdsDeTurnos = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Machine = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type MachineWait = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type ReadyScope = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Saved = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type SessionRow = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type StartupContext = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type TranscriptMetadata = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Transition = any; // pendiente: el tipo llega de otra feature por el shell (R3)

/** Lo que el bloque usaba del cuerpo de App. */
export type ShellCommandDeps = { DEFAULT_PERMISSION_MODE_EVENT: "harness:default-permission-mode"; adoptarNacida: (id: string, nacida: { provisional: string | null; proyecto: string; titulo: string; claveBorrador: string; }) => void; agent: Accessor<string>; agents: Accessor<Agent[]>; busy: () => boolean; carpetasDeTerminal: Accessor<Record<string, string>>; claveAbierta: () => string; cola: Accessor<Encolado[]>; comandosDeLaCola: Map<string, string>; composer: { agents: Accessor<Agent[]>; agent: Accessor<string>; superficies: Accessor<Superficie[] | null>; superficie: Accessor<string>; catalogos: Accessor<CatalogosDeModelos>; models: Accessor<AgentModels | null>; modelosParaAgentes: Accessor<{ superficies: Superficie[]; catalogos: CatalogosDeModelos; }>; model: Accessor<string>; effort: Accessor<string>; modo: Accessor<string>; modos: Accessor<ModoDePermiso[]>; skills: Accessor<Skill[]>; cliCommands: Accessor<CliCommand[]>; sideCommand: Accessor<string | null>; menu: () => Superficie[] | null; options: () => { headers: { "x-terminus-workspace"?: string | undefined; "x-terminus-machine"?: string | undefined; }; }; installEffects: () => void; refreshProviders: () => Promise<void>; prepareCredits: (prepare: (headers: Record<string, string>) => Promise<unknown>) => Promise<void>; startNewDraft: () => void; refreshSurfaces: (inicial: boolean) => Promise<void>; refreshCommands: (a: string) => void; readModels: (a: string, forzar?: boolean) => Promise<void>; snapshot: () => ComposerConfiguration; effortForTurn: () => string | null; restoreDraft: (configuration?: ComposerConfiguration) => void; restoreSessionDraft: (draft: DraftSelection, session?: { provider?: string | null; }) => void; useProfile: (profile: { provider?: string | null; model?: string | null; effort?: string | null; }) => void; resumeTask: (selection: { provider: string; model: string; effort: string; mode?: string; }) => void; runtimeFact: (fact: { kind: "model" | "effort" | "mode"; value: string; }) => void; selectModel: (choice: OpcionDeModelo) => string; chooseEffort: (id: string) => void; chooseMode: (id: string) => void; unavailable: () => void; dispose: () => void; }; configDeLaSesion: (id: string) => { provider: string; model: any; effort: string | null; }; conversationScope: (id: string, projectId?: string) => ConversationScope; deLaTarea: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; detenerYEnviar: (id: string) => Promise<void>; draftBases: Accessor<Record<string, string>>; draftMachine: () => string | null; draftOptions: () => { headers: { "x-terminus-machine": string; }; } | undefined; effort: Accessor<string>; enCache: Accessor<boolean>; engineCanDispatch: (session: string | null | undefined) => boolean; enviar: (m: Omit<Encolado, "id">, respuestas?: { manda: RespuestaEnviada[]; pinta: Respuesta[]; }, destination?: { project: string; session: string; }, llevar?: (claveBorrador: string) => Promise<any | null>, deLaCola?: string) => Promise<boolean>; escritorio: Accessor<string | null>; espacioPara: (space: string | null | undefined, machine: string | null | undefined) => string | null; esperando: Accessor<boolean>; grupos: Accessor<string[]>; hablandoCon: Accessor<{ project: string; name: string; } | null>; handoff: { requestStop: (scope: ConversationScope) => Promise<void>; replaceWithQueued: (scope: ConversationScope, id: string) => Promise<void>; observe: (fact: HandoffFact) => void; view: (scope: ConversationScope) => HandoffView; presentation: (scope: ConversationScope) => HandoffPresentation; blocked: (scope: ConversationScope) => boolean; reset: () => void; dispose: () => void; }; handoffAt: (id: string | null, projectId?: string) => HandoffView | null; injecting: Accessor<{ session: string; id: string; }[]>; lanzados: Map<string, TerminalLanzada>; lifecycleRevision: number; machineOf: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; machines: Accessor<Machine[]>; marcarQuieta: (id: string) => void; marcarViva: (id: string, desde?: number, startConfirmed?: boolean) => void; model: Accessor<string>; modo: Accessor<string>; nacenConComando: Map<string, ComandoQueNace>; olvidarPestana: (session: string) => void; pendingStarts: Map<string, symbol>; pestanas: { pinned: Accessor<ReadonlySet<string>>; isPinned: (id: string) => boolean; pin: (id: string) => void; restorable: () => string[]; replacePreviews(groups: readonly (readonly string[])[], visible: readonly (string | null)[]): void; open: Accessor<Tab[]>; active: Accessor<string | null>; activeTab: () => Tab | null; load(ws: string | null, desk?: string | null): string | null; ensure(p: { id: string; project: string; titulo: string; }): void; commitDraft(draft: string, p: { id: string; project: string; titulo: string; }): void; openObservability(title: string): void; openScreen(machine: string, title: string): void; openContent(p: ContentTab): void; activate: (id: string | null) => void; close: (id: string) => Tab | null; closeMany: (ids: readonly string[], opts?: { remember?: boolean; }) => Tab | null; canReopen: () => boolean; reopen(alive: (p: Tab) => boolean): Tab | null; attachPreviewFiles(project: string, session: string, tree: string): [string, string][]; renameFiles(session: string, tree: string, from: string, end: string): [string, string][]; navigate(id: string, url: string): void; moveToProject(session: string, project: string): void; markChanged(id: string): void; dirty: Accessor<ReadonlySet<string>>; setDirty(id: string, dirty: boolean): void; registerSaver(id: string, save: (() => Promise<boolean>) | null): void; dirtyTabsToClose(ids: string | readonly string[]): FileTab[]; saveFiles(ids: string[]): Promise<boolean>; sync(find: (id: string) => { project: string; titulo: string; } | null): string[]; }; pintarNaciendo: (proyecto: string, titulo: string, con: { provider: string; model: string | null; }, encargado: string | null) => string; ponerTerminal: (session: string, comando: ComandoEnVivo) => void; project: Accessor<string>; projectCatalog: { rows: Accessor<Project[]>; readyScope: Accessor<ReadyScope | null>; state: Accessor<ResourceState<string, Project[]>>; refresh: () => Promise<Project[]>; changed: () => Promise<Project[]>; fromCache(projects: Project[]): void; workspaceChanged(preserveCached?: boolean): void; discardUnconfirmedCache(): void; readForMachine(machine: string): Promise<Project[]>; rename: (id: string, name: string) => Promise<void>; attach: (id: string, source: string) => Promise<void>; detach: (id: string, source: string) => Promise<void>; workTree: (id: string, dir: string | null) => Promise<void>; remove: (id: string) => Promise<void>; dispose(): void; }; quitarDeLaCola: (session: string, id: string) => void; reanudarCola: (id: string) => Promise<void>; refreshFolder: (p: string, id: string) => Promise<void>; refreshSessions: (proyectos: string[]) => Promise<void>; retenidaPorElMotor: () => boolean; retirarNaciendo: (id: string) => { project: string; row: SessionRow; }[]; sesiones: Accessor<Record<string, SessionRow[]>>; sessionId: Accessor<string | null>; setArrancando: Setter<boolean>; setHablandoCon: Setter<{ project: string; name: string; } | null>; setInjecting: Setter<{ session: string; id: string; }[]>; setPermissionError: Setter<string | null>; setPorContestar: Setter<readonly string[]>; setSessionId: Setter<string | null>; setTerminales: Setter<Record<string, ComandoEnVivo>>; settleTurn: (session: string, ok?: boolean | null, unsaved?: boolean) => Promise<void>; settlingTurns: Accessor<string[]>; soltarTerminal: (session: string) => void; stopping: () => boolean; taskQueues: { items: Accessor<Encolado[]>; owner: Accessor<string | null>; editing: Accessor<boolean>; saved: (session: string) => Readonly<Saved> | undefined; openSession: (session: string, project: string, isCurrent?: () => boolean, fromEngine?: boolean) => Promise<void>; detach: () => void; remove: (id: string, session?: string | null) => void; persist: (session: string, project: string, queued: Encolado[]) => Promise<unknown>; adopt: (session: string) => string; editMode: (value: boolean) => boolean; enqueue: (message: Encolado, front?: boolean) => Encolado[]; edit: (id: string, text: string, mentions?: TaskMention[]) => Encolado[]; prioritize: (id: string) => Encolado[]; workspaceChanged: () => void; dispose: () => void; }; terminales: Accessor<Record<string, ComandoEnVivo>>; threads: { read: (project: string, id: string, before?: number | null | undefined) => Promise<Session>; acceptSession: (id: string, session: Session, clear: boolean, generation: number, latest?: boolean | undefined) => boolean; activities: (id: string, visible: readonly Msg[]) => ObservedTurnActivity<Msg>[]; beginActivity: (id: string, startedAt: number | null, startConfirmed?: boolean) => void; finishActivity: (id: string, workspace?: string | null) => void; rows: Accessor<Record<string, Hilo>>; current: Accessor<Hilo>; messages: Accessor<Msg[]>; loading: Accessor<string | null>; origins: Accessor<Readonly<Record<string, TranscriptOrigin | null>>>; offline: Accessor<Readonly<Record<string, string>>>; machineWaits: Accessor<Readonly<Record<string, MachineWait>>>; handovers: Accessor<Readonly<Record<string, HandoverState>>>; olderAvailable: Accessor<Readonly<Record<string, boolean>>>; recentAvailable: Accessor<Readonly<Record<string, boolean>>>; olderStatus: Accessor<Readonly<Record<string, OlderState>>>; recentTail: Accessor<Readonly<Record<string, Msg[]>>>; appendLive: (session: string, messages: Msg[], workspace?: string | null) => void; appendPersisted: (session: string, messages: Msg[]) => void; appendOptimistic: (session: string, messages: Msg[]) => void; acknowledgeOptimistic: (session: string, messages: Msg[]) => void; commitUniqueTurn: (session: string, message: Msg) => void; replaceTurn: (session: string, message: Msg) => void; reviseOptimistic: (session: string, target: Msg, patch: Pick<Msg, "respuestas" | "author">) => void; rejectOptimistic: (session: string, messages: Msg[]) => void; question: (session: string, fields: Pick<Msg, "turno" | "preguntas" | "questionRequestId" | "agent">, workspace?: string | null) => void; replay: (session: string, workspace?: string | null, replayId?: string) => void; finishSteps: (session: string) => void; event: (payload: ChatEvent, metadata: TranscriptMetadata) => void; older: (project: string, id: string) => Promise<(() => void) | null>; latest: (id: string) => Promise<void>; replaceHistory: (session: string, leida: Msg[], vaciarVivo: boolean, antepuesta?: boolean, guardados?: IdsDeTurnos, cola?: IdsDeTurnos, readRevision?: number) => void; saveWorkspace: (previous: string | null) => void; activateWorkspace: (workspace: string | null) => void; resetService: () => void; adoptDraft: (id: string) => void; dropSaved: (workspace: string, id: string) => void; flush: () => void; markMachineWait: (id: string, wait: MachineWait | null) => void; markAwake: (id: string) => void; startLoading: (id: string) => void; finishLoading: (id: string) => void; reading: (id: string, active: boolean) => void; drop: (session: string) => void; dispose: () => void; }; vivas: Accessor<string[]>; workspaceActivo: Accessor<string | null>; workspaceContext: { active: Accessor<string | null>; mode: Accessor<string | null>; root: Accessor<string | null>; confirmed: Accessor<boolean>; generation: () => number; beginTransition: (startup: StartupContext) => Transition; activate: (token: Transition) => boolean; beginMaterial: () => Readonly<{ generation: number; material: number; }>; current: (token: Readonly<{ generation: number; material: number; }>) => boolean; currentMaterial: (token: Readonly<{ generation: number; material: number; }>) => boolean; confirmContext: (token: Readonly<{ generation: number; material: number; }>, candidate: string | null, listed: ContextSource[]) => "obsolete" | "unavailable" | "accepted"; modeChanged: (workspace: string | null, value: string | null, requestedGeneration?: number) => void; dispose: () => void; } };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 2961–3259, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createShellCommand(deps: ShellCommandDeps) {
  const { DEFAULT_PERMISSION_MODE_EVENT, agent, agents, busy, carpetasDeTerminal, claveAbierta, cola, comandosDeLaCola, composer, conversationScope, deLaTarea, draftBases, draftMachine, draftOptions, effort, enCache, engineCanDispatch, escritorio, espacioPara, esperando, grupos, hablandoCon, handoff, handoffAt, injecting, lanzados, machineOf, machines, marcarQuieta, marcarViva, model, modo, nacenConComando, pendingStarts, pestanas, ponerTerminal, project, projectCatalog, quitarDeLaCola, refreshFolder, refreshSessions, retenidaPorElMotor, retirarNaciendo, sesiones, sessionId, setArrancando, setHablandoCon, setInjecting, setPermissionError, setPorContestar, setSessionId, setTerminales, settleTurn, settlingTurns, soltarTerminal, stopping, taskQueues, terminales, threads, vivas, workspaceActivo, workspaceContext } = deps;
  const adoptarNacida: ShellCommandDeps["adoptarNacida"] = (...a: Parameters<ShellCommandDeps["adoptarNacida"]>) => deps.adoptarNacida(...a);
  const configDeLaSesion: ShellCommandDeps["configDeLaSesion"] = (...a: Parameters<ShellCommandDeps["configDeLaSesion"]>) => deps.configDeLaSesion(...a);
  const detenerYEnviar: ShellCommandDeps["detenerYEnviar"] = (...a: Parameters<ShellCommandDeps["detenerYEnviar"]>) => deps.detenerYEnviar(...a);
  const enviar: ShellCommandDeps["enviar"] = (...a: Parameters<ShellCommandDeps["enviar"]>) => deps.enviar(...a);
  const olvidarPestana: ShellCommandDeps["olvidarPestana"] = (...a: Parameters<ShellCommandDeps["olvidarPestana"]>) => deps.olvidarPestana(...a);
  const pintarNaciendo: ShellCommandDeps["pintarNaciendo"] = (...a: Parameters<ShellCommandDeps["pintarNaciendo"]>) => deps.pintarNaciendo(...a);
  const reanudarCola: ShellCommandDeps["reanudarCola"] = (...a: Parameters<ShellCommandDeps["reanudarCola"]>) => deps.reanudarCola(...a);
  /** El turno en que el agente contesta a la salida de la terminal, sin que nadie escriba. */
  async function contestarALaTerminal(session: string, lanzado: TerminalLanzada) {
    try {
      await abrirRespuestaALaTerminal(session, lanzado);
    } finally {
      setPorContestar((ss) => ss.filter((s) => s !== session));
    }
  }

  async function abrirRespuestaALaTerminal(session: string, lanzado: TerminalLanzada) {
    if (vivas().includes(session) || settlingTurns().includes(session)) return;
    pendingStarts.set(session, Symbol());
    marcarViva(session);
    try {
      const abrio = await invoke<boolean>("answer_shell_output", {
        provider: lanzado.provider,
        project: lanzado.project,
        session,
        model: lanzado.model,
        effort: lanzado.effort,
        permissionMode: lanzado.permission_mode,
      }, deLaTarea(session));
      if (abrio) {
        threads.appendPersisted(session, [{ role: "system", text: "", meta: "shell_reply", agent: lanzado.provider }]);
        return;
      }
    } catch (error) {
      threads.appendLive(session, [{ role: "system", ...mensajeDeFallo(error), meta: "fallo" }]);
    }
    pendingStarts.delete(session);
    marcarQuieta(session);
  }

  /** Corre un `!` y devuelve el error, o `null` si corrió. */
  async function ejecutarComando(session: string, lanzado: TerminalLanzada, command: string, queueId: string | null) {
    lanzados.set(session, lanzado);
    pendingStarts.set(session, Symbol());
    // Sin id hasta `shell_started`: hasta entonces la tarea tampoco es del agente.
    batch(() => {
      marcarViva(session);
      ponerTerminal(session, {
        id: "",
        command: command.trim(),
        cwd: carpetasDeTerminal()[session] ?? null,
        output: "",
        truncated: false,
        desde: Date.now(),
      });
    });
    try {
      await invoke<Corrida>("run_shell_command", { project: lanzado.project, session, command, queueId }, deLaTarea(session));
      return null;
    } catch (error) {
      if (lanzados.get(session) === lanzado) {
        lanzados.delete(session);
        pendingStarts.delete(session);
        if (!terminales()[session]?.id) {
          soltarTerminal(session);
          marcarQuieta(session);
        }
      }
      threads.appendLive(session, [{ role: "system", ...mensajeDeFallo(error), meta: "fallo" }]);
      return error;
    }
  }

  /** La tarea que abrió un `!` de esta ventana toma su fila, su pestaña y, si se sigue mirando, la vista. */
  function adoptarComando(runId: string, session: string) {
    const nace = nacenConComando.get(runId);
    if (!nace) return false;
    nacenConComando.delete(runId);
    nace.session = session;
    if (nace.generation !== workspaceContext.generation()) return true;
    lanzados.set(session, nace.lanzado);
    batch(() => {
      soltarTerminal("");
      setArrancando(false);
      adoptarNacida(session, { provisional: nace.provisional, proyecto: nace.lanzado.project, titulo: nace.titulo, claveBorrador: nace.claveBorrador });
      if (claveAbierta() !== nace.claveBorrador) return;
      setSessionId(session);
      setHablandoCon(null);
      taskQueues.adopt(session);
    });
    return true;
  }

  /** Corre un `!` escrito sin tarea: Rust la abre con lo que la caja tiene puesto. Dice si corrió. */
  async function abrirConComando(command: string): Promise<boolean> {
    const proyecto = project();
    const claveBorrador = claveAbierta();
    const encargado = hablandoCon()?.name ?? null;
    const lanzado = { project: proyecto, provider: agent(), model: model() || null, effort: effort() || null, permission_mode: modo() || null };
    const titulo = tituloProvisional(command);
    const runId = crypto.randomUUID();
    const nace: ComandoQueNace = {
      lanzado,
      provisional: pintarNaciendo(proyecto, titulo, lanzado, encargado),
      titulo,
      claveBorrador,
      generation: workspaceContext.generation(),
      session: null,
    };
    nacenConComando.set(runId, nace);
    deps.lifecycleRevision++;
    batch(() => {
      setArrancando(true);
      ponerTerminal("", { id: "", command: command.trim(), cwd: null, output: "", truncated: false, desde: Date.now() });
    });
    try {
      const enOtra = draftOptions();
      const corrida = await invoke<Corrida>("run_shell_command", {
        project: proyecto,
        session: null,
        command,
        queueId: null,
        provider: lanzado.provider,
        model: lanzado.model,
        effort: lanzado.effort,
        permissionMode: lanzado.permission_mode,
        space: espacioPara(escritorio(), enOtra?.headers["x-terminus-machine"]),
        agent: encargado,
        baseRef: draftBases()[claveBorrador] ?? null,
        runId,
      }, enOtra);
      // Sin su `shell_started` no hay nada pintado: se adopta aquí y se lee del disco.
      if (adoptarComando(runId, corrida.session) && nace.generation === workspaceContext.generation()) void settleTurn(corrida.session, true);
      return true;
    } catch (error) {
      // Tras arrancar, la tarea queda con el fallo escrito y llega al releerla.
      if (nace.session) return false;
      nacenConComando.delete(runId);
      batch(() => {
        soltarTerminal("");
        setArrancando(false);
        retirarNaciendo(nace.provisional);
        pestanas.close(nace.provisional);
        olvidarPestana(nace.provisional);
      });
      if (nace.generation !== workspaceContext.generation()) return false;
      // La frase de un modo que el agente no sostiene nombra al agente.
      const label = agents().find((a) => a.id === lanzado.provider)?.label ?? lanzado.provider;
      threads.appendLive("", [{ role: "system", ...mensajeDeFallo(error, { agent: label }), meta: "fallo" }]);
      return false;
    }
  }

  // Sale de la cola al arrancar (`shell_started`), no al terminar: mientras corre
  // ya se ve en su tarjeta.
  async function ejecutarDeLaCola(item: Encolado) {
    const abierta = sessionId();
    if (!abierta) return;
    setInjecting((items) => [...items, { session: abierta, id: item.id }]);
    comandosDeLaCola.set(abierta, item.id);
    const sesion = configDeLaSesion(abierta);
    const lanzado = {
      project: project(),
      provider: sesion.provider,
      model: sesion.model,
      effort: sesion.effort,
      permission_mode: item.permission_mode,
    };
    const error = await ejecutarComando(abierta, lanzado, item.text.trimStart().slice(1), item.id);
    if (comandosDeLaCola.get(abierta) === item.id) comandosDeLaCola.delete(abierta);
    setInjecting((items) => items.filter((q) => q.id !== item.id));
    const clave = error === null ? null : claveDe(error);
    if (error === null || clave === "chat.shell.not_queued" || clave === "chat.shell.not_from_person") quitarDeLaCola(abierta, item.id);
  }

  /** Le teclea al `!` en marcha de una tarea. La terminal no hace eco: lo pinta la ventana. */
  async function teclearAlComando(id: string | null | undefined, texto: string, eco: boolean): Promise<boolean> {
    const vivo = id ? terminales()[id] : null;
    if (!id || !vivo?.id) return false;
    try {
      if (!(await invoke<boolean>("write_shell_input", { session: id, input: texto }, deLaTarea(id)))) return false;
    } catch (e) {
      threads.appendLive(id, [{ role: "system", ...mensajeDeFallo(e), meta: "fallo" }]);
      return false;
    }
    // Una tecla suelta (flecha, Enter de menú) no se pinta: la dibuja el propio programa.
    const tecla = texto.length <= 3 && !/^[^\u001b\r\t ]+\r$/.test(texto);
    const linea = tecla ? "" : texto.replace(/\u0004/g, "").replace(/\r$/, "\n");
    const pintado = eco ? linea : linea && "\n";
    if (pintado) {
      setTerminales((ts) => {
        const actual = ts[id];
        if (!actual || actual.id !== vivo.id) return ts;
        return { ...ts, [id]: { ...actual, output: actual.output + pintado } };
      });
    }
    return true;
  }

  async function detener() {
    const id = sessionId();
    if (!busy() || !id || stopping()) return;
    setPermissionError(null);
    await handoff.requestStop(conversationScope(id));
  }

  /**
   * Un elemento de la cola sale porque la persona lo pidió: una vez, con su id como
   * `clientMessageId` (otro en «Enviar de nuevo»), y deja la cola solo si el motor lo aceptó.
   */
  async function enviarDeLaCola(session: string, id: string, clientMessageId = id) {
    const scope = conversationScope(session);
    const item = (session === sessionId() ? cola() : taskQueues.saved(session)?.items ?? []).find((q: any) => q.id === id);
    if (!item || injecting().some((q) => q.session === session && q.id === id)) return;
    handoff.observe({ kind: "dispatching", scope, itemIds: [id] });
    setInjecting((items) => [...items, { session, id }]);
    try {
      if (!(await enviar(item, undefined, session === sessionId() ? undefined : { project: scope.project, session }, undefined, clientMessageId))) return;
      taskQueues.remove(id, session);
      if (session !== sessionId()) void taskQueues.persist(session, scope.project, taskQueues.saved(session)?.items ?? []).catch(() => {});
    } catch {
      // `enviar` ya lo dijo en el hilo: el elemento se queda en la cola.
    } finally {
      setInjecting((items) => items.filter((q) => q.session !== session || q.id !== id));
    }
  }

  /** «Detener y enviar»: el elegido sale cuando el turno cerró y Detener tuvo recibo; con el motor, se lo suelta. */
  function mandarElegido(session: string) {
    const view = handoffAt(session), id = view?.pending?.queueItemId;
    if (!id || !view.released || view.error || view.pending?.phase !== "waiting-close" || vivas().includes(session) || settlingTurns().includes(session)) return;
    if (!engineCanDispatch(session)) return void enviarDeLaCola(session, id);
    handoff.observe({ kind: "dispatching", scope: conversationScope(session), itemIds: [id] });
    void reanudarCola(session);
  }

  /** «Enviar», un elemento por clic: con el turno vivo lo detiene y manda; un `!` lo corre aquí; con el motor, le suelta la cola. */
  function mandarCola() {
    const id = sessionId(), view = handoffAt(id);
    if (!id) return;
    const libres = cola().filter((item) => !item.uncertain && !injecting().some((q) => q.session === id && q.id === item.id));
    const next = libres.find(interrumpible), head = libres[0];
    if (busy()) { if (next) void detenerYEnviar(next.id); return; }
    if (view?.error && view.pending?.phase === "waiting-close") return void handoff.replaceWithQueued(conversationScope(id), view.pending.queueItemId);
    if (head && esDeLaTerminal(head)) void ejecutarDeLaCola(head);
    else if (engineCanDispatch(id)) void reanudarCola(id);
    else if (head) void enviarDeLaCola(id, head.id);
  }

  /** Por qué la cola no sale sola; `manual`: no se sabe si su motor la despacha (no anuncia el rasgo, o es la web). */
  function razonDeLaCola(): RazonDeRetencion | null {
    const id = sessionId(), head = cola().find((item) => !item.uncertain);
    if (esperando()) return "pregunta";
    if (!engineCanDispatch(id)) return "manual";
    if (retenidaPorElMotor()) return "motor";
    return head && esDeLaTerminal(head) && !busy() ? "terminal" : null;
  }

  // Al cerrar un turno se refresca el historial, y la carpeta: una tarea
  // recién nacida no pasó por `abrirSesion`, y sin carpeta la tarjeta de
  // entrega no tiene contra qué armar la ruta.
  createEffect(
    on([busy, sessionId], ([ocupado, id], antes) => {
      if (ocupado || !id) return;
      // Pasar de una tarea a otra no: `abrirSesion` ya lee su carpeta, y el
      // historial entero parsea cada `session.json` del workspace.
      const previa = antes?.[1];
      if (previa && previa !== id && !esProvisional(previa)) return;
      void refreshFolder(project(), id);
      void refreshSessions(grupos());
    }),
  );

  // Cambiar de tarea NO cierra la tercera columna: todo lo que enseña viene
  // por props derivadas de la tarea (`session()`) y se repinta sola.

  // El historial se recarga cuando cambia la lista de proyectos, no el activo.
  // Antes del motor no: el arranque reinicia las lecturas y las relee en `aplicar`.
  const confirmedSessionGroups = createMemo((previous: {
    scope: NonNullable<ReturnType<typeof projectCatalog.readyScope>>; groups: string[];
  } | null) => {
    const scope = projectCatalog.readyScope(), groups = grupos();
    if (!scope || !scope.workspace || scope.workspace !== workspaceActivo()) return null;
    return previous?.scope === scope && previous?.groups === groups ? previous : { scope, groups };
  }, null);
  createEffect(on(confirmedSessionGroups, (current) => {
    // Cached startup already reads its known folders in parallel; only new folders need another read.
    if (current && connected() && !(enCache() && current.groups.every(group => group in sesiones()))) void refreshSessions(current.groups);
  }));

  const composerMachine = createMemo(() => {
    const id = sessionId();
    const active = machines().find((m) => m.active)?.id ?? null;
    return id
      ? machineOf(id)?.headers["x-terminus-machine"] ?? active
      : draftMachine();
  });
  composer.installEffects();

  onMount(() => {
    const onDefaultMode = (e: Event) => {
      const change = (e as CustomEvent<DefaultPermissionModeChange>).detail;
      workspaceContext.modeChanged(change.workspace, change.mode);
    };
    window.addEventListener(DEFAULT_PERMISSION_MODE_EVENT, onDefaultMode);
    onCleanup(() => window.removeEventListener(DEFAULT_PERMISSION_MODE_EVENT, onDefaultMode));
  });
  return { abrirConComando, adoptarComando, composerMachine, contestarALaTerminal, detener, ejecutarComando, enviarDeLaCola, mandarCola, mandarElegido, razonDeLaCola, teclearAlComando };
}
