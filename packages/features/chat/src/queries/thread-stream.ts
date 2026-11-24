
import { lastRoster, rememberRoster } from "../../../../ui/src/lib/handlerRoster.ts";
import { t } from "../../../../ui/src/lib/i18n";
import { type MentionSources } from "../../../../ui/src/lib/mentions";
import { type HandlerDefinition, type HandlerList, type HandlerStatusRow } from "../../../../ui/src/lib/model";
import { type Project } from "../../../../ui/src/lib/model.ts";
import { recipientCandidatesOf, type RecipientCandidate } from "../../../../ui/src/lib/recipients";
import { type SenderTask } from "../../../../ui/src/lib/recipients.ts";
import { alHilo } from "../../../../ui/src/lib/side-question";
import { type PlaceCandidate, type TaskCandidate } from "../../../../ui/src/lib/taskMentions";
import { type TextEdit } from "../../../../ui/src/lib/taskMentions.ts";
import { type Ventana } from "../../../../ui/src/lib/usage";
import { callEngine } from "../../../../engine-client/src/client.ts";
import { capabilities } from "../../../../host/src/platform";
import { asFailure, prosaDe } from "../../../../ui/src/Failure";
import { type Encolado } from "../components/MessageQueue";
import { type AlmacenDePreguntas, type PreguntasAMedias } from "../components/Questions";
import { type ComandoEnVivo } from "../components/ShellCard";
import { type AlMargen } from "../components/SideQuestion";
import { type Session } from "../model/transcript.ts";
import { type PermissionRequest } from "../screens/Chat";
import { type ComandoQueNace, type TerminalLanzada } from "./sleepSession.ts";
import { batch, createEffect, createMemo, createResource, createSignal, on, onCleanup, type Accessor } from "solid-js";
import type { ConversationScope, CreateConversationHandoff, CreateEngineQueue, CreateTaskQueues, MachineWait, MachinesPort, SessionRow, WatchProfilesPort, WorkspaceContextPort, createThreadsStore } from "./types.ts";
import type { createTabs } from "../../../../ui/src/lib/tabs.ts";
import type { createResync } from "./resync.ts";
import type { createShellCommand } from "./shell-command.ts";


/** Lo que el bloque usaba del cuerpo de App. */
export type ThreadStreamDeps = { apagadas: Accessor<Readonly<Record<string, string>>>; claveAbierta: () => string; createConversationHandoff: CreateConversationHandoff;
  createEngineQueue: CreateEngineQueue; createTaskQueues: CreateTaskQueues; deLaTarea: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined;
  enviarFiltro: ReturnType<typeof createResync>["enviarFiltro"]; filaDe: (id: string) => SessionRow | undefined; input: () => string;
  leerTarea: (project: string, id: string, before?: number | null | undefined) => Promise<Session>; lifecycleRevision: number;
  loadResult: (id: string, session: Session, clear: boolean, generation: number) => void; machineName: (id: string, local?: boolean) => string;
  machineOf: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; machineWaits: Accessor<Readonly<Record<string, MachineWait>>>;
  machineWakes: (id: string) => boolean; machines: MachinesPort; mandarElegido: ReturnType<typeof createShellCommand>["mandarElegido"];
  opcionesDeLaTarea: (id: string | null | undefined, workspace: string | null | undefined) => { headers: { [k: string]: string; }; }; pestanas: ReturnType<typeof createTabs>;
  project: Accessor<string>; projectList: Accessor<Project[]>; reconcileActiveTurns: ReturnType<typeof createResync>["reconcileActiveTurns"]; sesiones: Accessor<Record<string, SessionRow[]>>;
  sessionId: Accessor<string | null>; setInput: (value: string, inputType?: string, change?: TextEdit) => void; tareaDelRiel: (id: string) => SenderTask | null;
  threads: ReturnType<typeof createThreadsStore>; watchHandlerStatuses: (project: string) => () => HandlerStatusRow[]; watchProfiles: WatchProfilesPort; workspaceActivo: Accessor<string | null>;
  workspaceContext: WorkspaceContextPort; };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 1131–1449, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createThreadStream(deps: ThreadStreamDeps) {
  const { apagadas, claveAbierta, createConversationHandoff, createEngineQueue, createTaskQueues, deLaTarea, filaDe, input, leerTarea, loadResult, machineName, machineOf, machineWaits, machineWakes, machines, opcionesDeLaTarea, pestanas, project, projectList, sesiones, sessionId, setInput, tareaDelRiel, threads, watchHandlerStatuses, watchProfiles, workspaceActivo, workspaceContext } = deps;
  const enviarFiltro: ThreadStreamDeps["enviarFiltro"] = (...a: Parameters<ThreadStreamDeps["enviarFiltro"]>) => deps.enviarFiltro(...a);
  const mandarElegido: ThreadStreamDeps["mandarElegido"] = (...a: Parameters<ThreadStreamDeps["mandarElegido"]>) => deps.mandarElegido(...a);
  const reconcileActiveTurns: ThreadStreamDeps["reconcileActiveTurns"] = (...a: Parameters<ThreadStreamDeps["reconcileActiveTurns"]>) => deps.reconcileActiveTurns(...a);
  /**
   * El destino que demora el envío. Si la tarea aún no tiene id,
   * la espera se muestra en su pestaña provisional o en el borrador.
   */
  const esperaMaquinaEn = (sesion: string | null | undefined) => {
    const id = sesion ?? (sessionId() ? null : pestanas.active());
    const wait = (id ? machineWaits()[id] : undefined) ?? (sesion || sessionId() ? undefined : machineWaits()[claveAbierta()]);
    return wait ? { phase: wait.phase, name: machineName(wait.machine), wakes: machineWakes(wait.machine) } : null;
  };
  // Encendida por otra vía (otra ventana, otra acción), la tarea se vuelve a leer de su motor.
  createEffect(on(() => {
    const id = sessionId();
    return id && apagadas()[id] && filaDe(id)?.machine_on === true ? id : null;
  }, (id) => {
    if (!id) return;
    const generation = workspaceContext.generation();
    void leerTarea(project(), id).then((s) => loadResult(id, s, false, generation)).catch(() => {});
  }));
  // Lo contestado a medias de cada pregunta, por sesión y turno: los ids
  // `q1..qN` se repiten entre turnos. Aquí y no en la tarjeta, que se desmonta
  // con su pestaña.
  const [preguntasAMedias, setPreguntasAMedias] = createSignal<ReadonlyMap<string, PreguntasAMedias>>(new Map());
  const claveDePregunta = (session: string, turno: string) => `${session}\u0000${turno}`;
  const almacenDePreguntas = (session: () => string | null): AlmacenDePreguntas => ({
    leer: (turno) => preguntasAMedias().get(claveDePregunta(session() ?? "", turno)),
    escribir: (turno, aMedias) =>
      setPreguntasAMedias((m) => new Map(m).set(claveDePregunta(session() ?? "", turno), aMedias)),
  });
  const soltarPreguntas = (session: string, turno?: string) =>
    setPreguntasAMedias((m) => {
      const suyas = [...m.keys()].filter((k) =>
        turno === undefined ? k.startsWith(`${session}\u0000`) : k === claveDePregunta(session, turno),
      );
      if (suyas.length === 0) return m;
      const resto = new Map(m);
      for (const k of suyas) resto.delete(k);
      return resto;
    });
  // Qué tareas están contestando ahora mismo, por id. Era un `busy` de la
  // aplicación entera: con un turno vivo, la caja de CUALQUIER otra tarea
  // enseñaba «Detener turno» en `type="button"`, y empezar algo mientras el
  // agente pensaba era imposible. El backend nunca tuvo ese límite
  // —`chat::vivos()` es un conjunto de sesiones, cada turno corre en su
  // propio hilo—: lo que faltaba estaba aquí.
  const [vivas, setVivas] = createSignal<string[]>([]);
  const finishedTurns = new Map<string, boolean | null | undefined>();
  const [settlingTurns, setSettlingTurns] = createSignal<string[]>([]);
  const turnRevisions = new Map<string, number>();
  function advanceTurn(id: string) {
    deps.lifecycleRevision++;
    const revision = (turnRevisions.get(id) ?? 0) + 1;
    turnRevisions.set(id, revision);
    return revision;
  }
  const pendingStarts = new Map<string, symbol>();
  const [injecting, setInjecting] = createSignal<{ session: string; id: string }[]>([]);
  /**
   * Los agentes que ya contestaron que no reciben mensajes a mitad del turno
   * (`chat.steer.unsupported`) o que dejaron la entrega sin confirmar. Con uno
   * de ellos «Mandar ahora» no haría nada: el mensaje se queda en la cola. Es
   * del agente y no de la tarea, y abrir la ventana lo olvida.
   */
  const [sinSteer, setSinSteer] = createSignal<string[]>([]);
  const queueBusy = () => handoffBlocked(sessionId()) || busy() || settlingTurns().includes(sessionId() ?? "") || injecting().some((item) => item.session === sessionId());
  const [desdeDeTurno, setDesdeDeTurno] = createSignal<Record<string, number>>({});
  const liveThreads = new Set<string>();
  const liveThreadKey = (workspace: string, session: string) => `${workspace}/${session}`;
  // El turno que ya arrancó y todavía no tiene sesión en disco. El primer
  // mensaje de una tarea crea la sesión en Rust: entre que sale y vuelve el
  // id no hay a qué apuntar. Sin esto, esa ventana deja la caja libre y un
  // segundo Enter manda dos primeros turnos.
  const [arrancando, setArrancando] = createSignal(false);
  /** Si la tarea que se está mirando está contestando. */
  const busy = () => {
    const id = sessionId();
    return id ? vivas().includes(id) : arrancando();
  };
  const marcarViva = (id: string, desde?: number, startConfirmed = false) =>
    batch(() => {
      const workspace = workspaceActivo();
      if (workspace) liveThreads.add(liveThreadKey(workspace, id));
      enviarFiltro();
      setVivas((v) => (v.includes(id) ? v : [...v, id]));
      setDesdeDeTurno((d) => (id in d || desde === undefined ? d : { ...d, [id]: desde }));
      threads.beginActivity(id, desdeDeTurno()[id] ?? null, startConfirmed);
    });
  const marcarQuieta = (id: string) =>
    batch(() => {
      const workspace = workspaceActivo();
      if (workspace) liveThreads.delete(liveThreadKey(workspace, id));
      enviarFiltro();
      threads.finishActivity(id);
      setVivas((v) => v.filter((x) => x !== id));
      setDesdeDeTurno((d) => {
        if (!(id in d)) return d;
        const { [id]: _, ...resto } = d;
        return resto;
      });
    });
  /**
   * ¿Este evento es de la tarea que se está mirando? Solo filtra el
   * consumo y la ventana de contexto; el chat cae directo en el hilo de
   * su sesión. Un `sessionId() &&` delante aceptaría TODO: «sin tarea» y
   * «tarea recién arrancada» son indistinguibles.
   */
  const esDeLaAbierta = (session: string) => session === sessionId();

  /**
   * ¿Este evento es del workspace que se está mirando? Segundo cinturón,
   * no reemplazo de `esDeLaAbierta`: workspace puede cambiar con una tarea
   * contestando, y solo evitaba pintarse aquí por suerte —ids de sesión
   * aleatorios sin colisión, no una comprobación real.
   */

  /**
   * Solo descarta cuando sabe contra qué comparar, y en esa dirección tiene
   * que fallar: equivocarse hacia «pasa» cuesta lo que el filtro por
   * sesión ya cubría; hacia «descarta» deja corriendo un turno mudo, sin
   * nada que lo explique.
   */

  /**
   * Rust deja el campo fuera cuando el evento no viene de un turno de
   * fondo, y ahí no hay nada que descartar (`chat::emitir_chat`). La
   * cadena vacía cuenta igual —consumo escrito antes de los workspaces—:
   * esconder un gasto real por no saber de quién es sería peor.
   */
  const esDelWorkspaceAbierto = (ws?: string) => {
    const abierto = workspaceActivo();
    return !ws || !abierto || ws === abierto;
  };
  // El `!` que ocupa cada tarea mientras corre, pintado con sus `shell_*`.
  const [terminales, setTerminales] = createSignal<Record<string, ComandoEnVivo>>({});
  const [carpetasDeTerminal, setCarpetasDeTerminal] = createSignal<Record<string, string>>({});
  // Con qué se escribió cada `!` que lanzó esta ventana: es con lo que el agente
  // contesta a su salida. Otra ventana no pide esa respuesta.
  const lanzados = new Map<string, TerminalLanzada>();
  // Por el id de ejecución que esta ventana propuso: es lo que trae el
  // `shell_started` de la tarea que su `!` acaba de abrir.
  const nacenConComando = new Map<string, ComandoQueNace>();
  const detenidos = new Set<string>();
  const comandosDeLaCola = new Map<string, string>();
  const [permissions, setPermissions] = createSignal<PermissionRequest[]>([]);
  const [respondiendoPermiso, setRespondiendoPermiso] = createSignal(false);
  const [permissionError, setPermissionError] = createSignal<string | null>(null);
  // De cuánta ventana de contexto va la conversación, aparte del total: no
  // es un acumulado. Cada turno reenvía la conversación entera, y el
  // último reporte ya es el total —sumarlos daría una ventana imposible.

  // Se llama `ventana` y no `contexto`: en este archivo «contexto» ya es
  // el material que la tarea lee.
  const [ventana, setVentana] = createSignal<Ventana>(null);

  const { engineCanDispatch, resumeQueue, stopTurn, turnClosed, turnStarted } = createEngineQueue({ invoke: callEngine, machines, machineOf, nativeWindow: () => capabilities().nativeWindow, notStoppableYet: (id) => threads.appendLive(id, [{ role: "system", text: t("shell.turn.not_stoppable_yet"), meta: "aviso" }]) });
  const taskQueues = createTaskQueues({
    scope: () => ({ workspace: workspaceActivo(), generation: workspaceContext.generation(), session: sessionId(), project: project() }),
    readQueue: (scope) => callEngine<Encolado[]>("load_queue", { project: scope.project, session: scope.session }, opcionesDeLaTarea(scope.session, scope.workspace)),
    // Siempre: un motor que no lo conoce ignora el argumento, y el que sí no toma esta ventana por una vieja.
    writeQueue: (scope, queued) => callEngine("save_queue", { project: scope.project, session: scope.session, queued, engineDispatch: true }, opcionesDeLaTarea(scope.session, scope.workspace)),
    onSaveFailure: (error, scope) => threads.appendLive(scope.session, [{ role: "system", text: t("shell.queue.save_failed", { error: prosaDe(error) }), meta: "aviso" }]),
  });
  onCleanup(taskQueues.dispose);
  const conversationScope = (id: string, projectId = id === sessionId() ? project() : taskQueues.saved(id)?.project ?? pestanas.open().find(tab => tab.id === id)?.project ?? tareaDelRiel(id)?.folder ?? project()): ConversationScope => ({
    workspace: workspaceActivo(), generation: workspaceContext.generation(), project: projectId, session: id,
    route: opcionesDeLaTarea(id, workspaceActivo()),
  });
  const handoff = createConversationHandoff({
    current: () => ({ workspace: workspaceActivo(), generation: workspaceContext.generation() }),
    runtime: { active: (scope) => vivas().includes(scope.session), stop: async (scope) => {
      const id = scope.session, shell = Boolean(terminales()[id] || lanzados.has(id));
      const current = () => scope.workspace === workspaceActivo() && scope.generation === workspaceContext.generation();
      if (shell) detenidos.add(id);
      try {
        const stopped = shell ? await callEngine<boolean>("stop_shell_command", { session: id }, scope.route) : await stopTurn(scope);
        if (current()) {
          if (shell && stopped === false) detenidos.delete(id);
          if (!shell) { void reconcileActiveTurns(); if (stopped !== false) setPermissions(ps => ps.filter(p => p.session !== id)); }
        }
        return stopped;
      } catch (error) {
        if (current()) {
          if (shell) detenidos.delete(id);
          void reconcileActiveTurns();
          if (vivas().includes(id)) threads.appendLive(id, [{ role: "system", text: t("shell.turn.stop_failed", { error: prosaDe(error) }), meta: "fallo" }]);
        }
        throw error;
      }
    } },
    queue: { message: (scope, id: string) => (scope.session === sessionId() ? taskQueues.items() : taskQueues.saved(scope.session)?.items ?? []).find((item) => item.id === id),
      select: (scope, id: string) => { if (scope.session !== sessionId() || !taskQueues.items().some(item => item.id === id)) return false; taskQueues.prioritize(id); return true; },
      release: (scope) => mandarElegido(scope.session), failed: () => {} },
  });
  onCleanup(handoff.dispose);
  const handoffAt = (id: string | null, projectId?: string) => id ? handoff.view(conversationScope(id, projectId)) : null;
  const handoffBlocked = (id: string | null) => !!id && handoff.blocked(conversationScope(id));
  const stopping = () => handoffAt(sessionId())?.stopping ?? false;

  const cola = taskQueues.items;
  const colaDe = taskQueues.owner;
  const editando = taskQueues.editing;
  // `load_queue` marca `held` lo que el motor retiene: no sale hasta «Enviar».
  const retenidaPorElMotor = () => cola().some((item) => item.held);
  // Con su aviso `queue` y con `done`, tenga o no el rasgo: lo que el motor ya mandó no se queda en la mano.
  const releerCola = (id: string) => { if (id === sessionId()) void taskQueues.openSession(id, project(), undefined, true).catch(() => {}); };

  // El CLI está reintentando contra su proveedor, en esta sesión: los eventos
  // de otra tarea siguen llegando a esta ventana, y sin la sesión un turno de
  // fondo que reintenta encendería el rótulo del que se está mirando. `null`
  // es lo normal: solo Claude anuncia sus reintentos, y solo mientras duran.
  const [reintento, setReintento] = createSignal<{
    session: string;
    intento: number;
    total: number;
    clase: string;
  } | null>(null);
  // Tareas cuyo agente ya contestó y solo espera a una hija en segundo plano: el
  // turno sigue abierto, pero un mensaje entra ya en vez de esperar al cierre.
  const [enFondo, setEnFondo] = createSignal<string[]>([]);
  // Editar pausa la cola: si el turno cierra a mitad de la edición, no se manda
  // el texto a medias.

  // La pregunta al margen vive en memoria y es de una tarea: al cambiar de
  // tarea se pierde, y la respuesta que llegue tarde no se pinta en otra.
  const [alMargen, setAlMargen] = createSignal<AlMargen | null>(null);
  let preguntasAlMargen = 0;
  createEffect(on(sessionId, (id) => {
    if (alMargen() && alMargen()?.session !== id) cerrarAlMargen();
  }));
  function cerrarAlMargen() {
    preguntasAlMargen++;
    setAlMargen(null);
  }
  async function preguntarAlMargen(question: string) {
    const session = sessionId();
    const turno = ++preguntasAlMargen;
    if (!session) {
      setAlMargen({ session: "", question, answer: null, failure: { what: { clave: "chat.side.error.no_session" }, detail: "" } });
      return;
    }
    setAlMargen({ session, question, answer: null, failure: null });
    const vigente = () => turno === preguntasAlMargen && sessionId() === session;
    try {
      const { answer } = await callEngine<{ answer: string }>("ask_side_question", { project: project(), session, question }, deLaTarea(session));
      if (vigente()) setAlMargen({ session, question, answer, failure: null });
    } catch (e) {
      if (vigente()) setAlMargen({ session, question, answer: null, failure: asFailure(e) });
    }
  }
  function pasarAlHilo() {
    const m = alMargen();
    if (!m?.answer) return;
    const texto = t("chat.side.thread_text", { question: m.question, answer: m.answer });
    setInput(alHilo(input(), texto));
    cerrarAlMargen();
  }
  // Lo que se puede mencionar. Sale de las fuentes que ESTA tarea tiene
  // adjuntas y solo de ellas: la frontera de lo mencionable es la del agente.
  const [mentionSources, setMentionSources] = createSignal<MentionSources | null>(null);
  const [taskCandidates, setTaskCandidates] = createSignal<TaskCandidate[]>([]);
  let taskCandidateRequest = 0;
  const refreshTaskCandidates = async () => {
    const request = ++taskCandidateRequest;
    const workspace = workspaceActivo();
    const session = sessionId();
    try {
      const items = await callEngine<TaskCandidate[]>("list_task_mentions");
      if (request === taskCandidateRequest && workspace === workspaceActivo() && session === sessionId()) setTaskCandidates(items);
    } catch {
      if (request === taskCandidateRequest) setTaskCandidates([]);
    }
  };
  /**
   * Los encargados de la carpeta abierta, para el menú de `@`. Sale de la
   * misma llamada que el riel ya hace, y el último listado conocido cubre la
   * lectura que falle: mejor el nombre de ayer que un menú sin encargados.
   */
  const [rosterDelProyecto] = createResource(project, async (id) => {
    if (!id) return [] as HandlerDefinition[];
    try {
      const listado = (await callEngine<HandlerList>("list_agents", { project: id })).agents;
      rememberRoster(id, listado);
      return listado;
    } catch {
      return lastRoster(id) ?? [];
    }
  });
  /**
   * La presencia sigue a la carpeta abierta: suscribirse a una fija dejaría
   * las caras del proyecto anterior. Misma forma que `watchHandlerStatus`.
   */
  const [presenciaDeEncargados, setPresenciaDeEncargados] = createSignal<HandlerStatusRow[]>([]);
  createEffect(() => {
    const id = project();
    if (!id) {
      setPresenciaDeEncargados([]);
      return;
    }
    const filas = watchHandlerStatuses(id);
    createEffect(() => setPresenciaDeEncargados(filas()));
  });
  // Los ocultos salen del menú como salen del riel; sin carpeta no hay perfiles que leer.
  const perfilesDeLaCarpeta = createMemo(() => {
    const id = project();
    return id ? watchProfiles(id) : () => ({});
  });
  const recipientCandidates = createMemo<RecipientCandidate[]>(() =>
    recipientCandidatesOf(rosterDelProyecto() ?? lastRoster(project()) ?? [], {
      profiles: perfilesDeLaCarpeta()(),
      // `undefined` no es un estado: es que todavía no se sabe, y el menú
      // pinta la cara despierta en vez de inventar que duerme.
      statuses: presenciaDeEncargados(),
    }),
  );
  const placeCandidates = createMemo<PlaceCandidate[]>(() => {
    return projectList().map(f => ({ target: { kind: "folder" as const, projectId: f.id }, name: f.name, detail: "", updatedAt: f.updated_at }));
  });
  createEffect(on([workspaceActivo, sessionId, sesiones], () => {
    taskCandidateRequest++;
    setTaskCandidates([]);
    if (input().includes("@")) void refreshTaskCandidates();
  }));

  const [folder, setFolder] = createSignal<string | null>(null);
  return { advanceTurn, alMargen, almacenDePreguntas, arrancando, busy, carpetasDeTerminal, cerrarAlMargen, cola, colaDe, comandosDeLaCola, conversationScope, desdeDeTurno, detenidos, editando, enFondo, engineCanDispatch, esDeLaAbierta, esDelWorkspaceAbierto, esperaMaquinaEn, finishedTurns, folder, handoff, handoffAt, injecting, lanzados, liveThreadKey, liveThreads, marcarQuieta, marcarViva, mentionSources, nacenConComando, pasarAlHilo, pendingStarts, permissionError, permissions, placeCandidates, preguntarAlMargen, queueBusy, recipientCandidates, refreshTaskCandidates, reintento, releerCola, respondiendoPermiso, resumeQueue, retenidaPorElMotor, rosterDelProyecto, setArrancando, setCarpetasDeTerminal, setDesdeDeTurno, setEnFondo, setFolder, setInjecting, setMentionSources, setPermissionError, setPermissions, setPreguntasAMedias, setReintento, setRespondiendoPermiso, setSettlingTurns, setSinSteer, setTerminales, setVentana, setVivas, settlingTurns, sinSteer, soltarPreguntas, stopping, taskCandidates, taskQueues, terminales, turnClosed, turnRevisions, turnStarted, ventana, vivas };
}
