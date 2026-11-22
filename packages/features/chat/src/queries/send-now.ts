import { type ObservedTurnActivity } from "../../../../../apps/desktop/src/lib/activityObservation.ts";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { type Trigger } from "../../../../../apps/desktop/src/lib/mentions.ts";
import { type Source } from "../../../../../apps/desktop/src/lib/model.ts";
import { type Recipient } from "../../../../../apps/desktop/src/lib/recipients";
import { type TaskMention } from "../../../../../apps/desktop/src/lib/taskMentions";
import { type MentionTarget, type TextEdit } from "../../../../../apps/desktop/src/lib/taskMentions.ts";
import { type OlderState } from "../model/history.ts";
import { invoke } from "../../../../engine-client/src/client.ts";
import { claveDe, detalleDe, prosaDe } from "../../../../ui/src/Failure";
import { type Encolado } from "../components/MessageQueue.tsx";
import { type Respuesta, type RespuestaEnviada } from "../components/Questions.tsx";
import { mensajeDeFallo } from "../model/failures";
import { type HandoverPending, type HandoverState } from "../model/handover.ts";
import { type Msg } from "../model/messageTypes.ts";
import { ENTREGA_SIN_CONFIRMAR, interrumpible, inyectable } from "../model/queue";
import { type Turn } from "../model/transcript";
import { type ChatEvent, type Session, type TranscriptOrigin } from "../model/transcript.ts";
import { type Accessor, type Setter } from "solid-js";

type CarriedBase = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type ConversationScope = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Draft = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type DraftConfiguration = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type EngineScope = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type HandoffFact = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type HandoffPresentation = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type HandoffView = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Hilo = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type HistoryEntry = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type IdsDeTurnos = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type MachineWait = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Saved = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type SessionRow = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type TranscriptMetadata = any; // pendiente: el tipo llega de otra feature por el shell (R3)

/** Lo que el bloque usaba del cuerpo de App. */
export type SendNowDeps = { agent: Accessor<string>; attachmentsFor: (paths: string[], options: { headers: Record<string, string>; } | undefined, proyecto: string) => Promise<string[]>; cola: Accessor<Encolado[]>; conversationScope: (id: string, projectId?: string) => ConversationScope; deLaTarea: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; drafts: { peek: (key: string) => Draft; current: () => Draft; sourceIds: Accessor<string[]>; excludedSourceIds: Accessor<string[]>; attached: Accessor<string[]>; pendingMaterial: Accessor<Source[]>; context: Accessor<Source[]>; input: () => string; files: () => string[]; changeText: (value: string, inputType?: string, change?: TextEdit) => void; history: (redo: boolean) => boolean; addFiles: (paths: string[]) => Promise<void>; addSource: (id: string) => void; removeSource: (id: string) => void; recipient: (name: string, label: string, trigger: Trigger) => void; reference: (target: MentionTarget, label: string, trigger: Trigger) => void; replaceFiles: (files: string[]) => { [x: string]: Draft; }; replaceAttached: (ids: string[]) => string[]; acceptSources: (ids: string[]) => string[]; configure: (configuration: DraftConfiguration, key?: string) => { [x: string]: Draft; }; handover: (provider: HandoverPending | null | undefined, key?: string) => { [x: string]: Draft; }; invalidateProvider: (key: string, provider: string) => { [x: string]: Draft | { input: string; task_mentions?: TaskMention[]; recipients?: Recipient[]; mentionHistory?: HistoryEntry[]; mentionFuture?: HistoryEntry[]; sourceIds: string[]; excludedSourceIds: string[]; archivos: string[]; configuration?: DraftConfiguration; }; }; restoreSession: (key: string, excluded: string[]) => { [x: string]: Draft; }; retryText: (text: string, mentions?: TaskMention[]) => { [x: string]: Draft; }; takeFiles: (key: string, files: string[]) => { [x: string]: Draft; }; restoreFailed: (key: string, message: HistoryEntry, files: string[]) => { [x: string]: Draft; }; sentSources: (key: string, ids: string[]) => { [x: string]: Draft; }; continueFrom: (prompt: string, path: string, sources: string[], excluded: string[]) => { [x: string]: Draft; }; promote: (from: string, to: string) => { [x: string]: Draft; }; drop: (key: string) => Record<string, Draft>; reset: () => void; dispose: () => void; }; effortDelTurno: () => string | null; enFondo: Accessor<string[]>; engineCanDispatch: (session: string | null | undefined) => boolean; enviar: (m: Omit<Encolado, "id">, respuestas?: { manda: RespuestaEnviada[]; pinta: Respuesta[]; }, destination?: { project: string; session: string; }, llevar?: (claveBorrador: string) => Promise<CarriedBase | null>, deLaCola?: string) => Promise<boolean>; escritorio: Accessor<string | null>; filaDe: (id: string) => SessionRow | undefined; handoff: { requestStop: (scope: ConversationScope) => Promise<void>; replaceWithQueued: (scope: ConversationScope, id: string) => Promise<void>; observe: (fact: HandoffFact) => void; view: (scope: ConversationScope) => HandoffView; presentation: (scope: ConversationScope) => HandoffPresentation; blocked: (scope: ConversationScope) => boolean; reset: () => void; dispose: () => void; }; handoffAt: (id: string | null, projectId?: string) => HandoffView | null; hilos: Accessor<Record<string, Hilo>>; injecting: Accessor<{ session: string; id: string; }[]>; mandar: (attachments: string[]) => Promise<boolean>; model: Accessor<string>; modo: Accessor<string>; msgs: Accessor<Msg[]>; project: Accessor<string>; queueBusy: () => boolean; resumeQueue: (scope: EngineScope) => Promise<unknown>; sessionId: Accessor<string | null>; setDesdeDeTurno: Setter<Record<string, number>>; setError: Setter<string | null>; setInjecting: Setter<{ session: string; id: string; }[]>; setSinSteer: Setter<string[]>; sinSteer: Accessor<string[]>; taskQueues: { items: Accessor<Encolado[]>; owner: Accessor<string | null>; editing: Accessor<boolean>; saved: (session: string) => Readonly<Saved> | undefined; openSession: (session: string, project: string, isCurrent?: () => boolean, fromEngine?: boolean) => Promise<void>; detach: () => void; remove: (id: string, session?: string | null) => void; persist: (session: string, project: string, queued: Encolado[]) => Promise<unknown>; adopt: (session: string) => string; editMode: (value: boolean) => boolean; enqueue: (message: Encolado, front?: boolean) => Encolado[]; edit: (id: string, text: string, mentions?: TaskMention[]) => Encolado[]; prioritize: (id: string) => Encolado[]; workspaceChanged: () => void; dispose: () => void; }; threads: { read: (project: string, id: string, before?: number | null | undefined) => Promise<Session>; acceptSession: (id: string, session: Session, clear: boolean, generation: number, latest?: boolean | undefined) => boolean; activities: (id: string, visible: readonly Msg[]) => ObservedTurnActivity<Msg>[]; beginActivity: (id: string, startedAt: number | null, startConfirmed?: boolean) => void; finishActivity: (id: string, workspace?: string | null) => void; rows: Accessor<Record<string, Hilo>>; current: Accessor<Hilo>; messages: Accessor<Msg[]>; loading: Accessor<string | null>; origins: Accessor<Readonly<Record<string, TranscriptOrigin | null>>>; offline: Accessor<Readonly<Record<string, string>>>; machineWaits: Accessor<Readonly<Record<string, MachineWait>>>; handovers: Accessor<Readonly<Record<string, HandoverState>>>; olderAvailable: Accessor<Readonly<Record<string, boolean>>>; recentAvailable: Accessor<Readonly<Record<string, boolean>>>; olderStatus: Accessor<Readonly<Record<string, OlderState>>>; recentTail: Accessor<Readonly<Record<string, Msg[]>>>; appendLive: (session: string, messages: Msg[], workspace?: string | null) => void; appendPersisted: (session: string, messages: Msg[]) => void; appendOptimistic: (session: string, messages: Msg[]) => void; acknowledgeOptimistic: (session: string, messages: Msg[]) => void; commitUniqueTurn: (session: string, message: Msg) => void; replaceTurn: (session: string, message: Msg) => void; reviseOptimistic: (session: string, target: Msg, patch: Pick<Msg, "respuestas" | "author">) => void; rejectOptimistic: (session: string, messages: Msg[]) => void; question: (session: string, fields: Pick<Msg, "turno" | "preguntas" | "questionRequestId" | "agent">, workspace?: string | null) => void; replay: (session: string, workspace?: string | null, replayId?: string) => void; finishSteps: (session: string) => void; event: (payload: ChatEvent, metadata: TranscriptMetadata) => void; older: (project: string, id: string) => Promise<(() => void) | null>; latest: (id: string) => Promise<void>; replaceHistory: (session: string, leida: Msg[], vaciarVivo: boolean, antepuesta?: boolean, guardados?: IdsDeTurnos, cola?: IdsDeTurnos, readRevision?: number) => void; saveWorkspace: (previous: string | null) => void; activateWorkspace: (workspace: string | null) => void; resetService: () => void; adoptDraft: (id: string) => void; dropSaved: (workspace: string, id: string) => void; flush: () => void; markMachineWait: (id: string, wait: MachineWait | null) => void; markAwake: (id: string) => void; startLoading: (id: string) => void; finishLoading: (id: string) => void; reading: (id: string, active: boolean) => void; drop: (session: string) => void; dispose: () => void; }; workspaceActivo: Accessor<string | null> };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 5514–5723, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createSendNow(deps: SendNowDeps) {
  const { agent, attachmentsFor, cola, conversationScope, deLaTarea, drafts, effortDelTurno, enFondo, engineCanDispatch, enviar, escritorio, filaDe, handoff, handoffAt, hilos, injecting, mandar, model, modo, msgs, project, queueBusy, resumeQueue, sessionId, setDesdeDeTurno, setError, setInjecting, setSinSteer, sinSteer, taskQueues, threads, workspaceActivo } = deps;
  /**
   * Una respuesta rápida del agente, mandada como si la persona la hubiera
   * escrito. No toca el borrador, y nunca es un comando `!`: el texto lo
   * escribió el agente y un clic no puede correrlo en la máquina de la persona.
   */
  async function mandarTexto(texto: string): Promise<boolean> {
    if (queueBusy() || cola().length > 0) {
      // En la cola, un `!` de la persona y uno del agente no se distinguen.
      if (texto.trimStart().startsWith("!")) return false;
      encolarYSoltar(texto, []);
      return true;
    }
    return enviar({
      text: texto,
      provider: agent(),
      model: model() || null,
      effort: effortDelTurno(),
      permission_mode: modo() || null,
      attachments: [],
    });
  }

  function encolarYSoltar(text: string, attachments: string[], task_mentions?: TaskMention[], recipients?: Recipient[]) {
    const libre = cola().length === 0 && enFondo().includes(sessionId() ?? "") &&
      !injecting().some((item) => item.session === sessionId());
    const encolado = encolar(text, attachments, task_mentions, recipients);
    if (libre) void mandarAhora(encolado);
  }

  /**
   * Volver a mandar lo último que escribió la persona: es el mismo
   * camino que la caja, no uno paralelo. Repone el texto en el
   * borrador y manda con `mandar`, con el agente, modelo y modo de
   * ahora. Un reenvío por su cuenta divergiría en cuanto algo cambiara.
   */

  /**
   * No reintenta solo, ni encadena: lo dispara un clic en la fila del
   * fallo, solo donde puede arreglar algo (`Chat.tsx`, `gestoDelFallo`).
   * Automático gastaría la suscripción de otra persona sin gesto.
   */

  /**
   * Si no hay nada que reponer —una tarea abierta cuyo primer turno
   * murió antes de guardarse— no hace nada visible en vez de mandar
   * un mensaje vacío.
   */

  /**
   * Reenvía el texto y no los adjuntos: diferencia real de rutas. La
   * caja manda rutas de origen; el turno guarda rutas relativas a la
   * carpeta de trabajo, donde el archivo ya está. Pasarle las
   * relativas al camino de las de origen buscaría donde no hay nada.
   */
  async function reintentar() {
    const previos = msgs();
    for (let i = previos.length - 1; i >= 0; i--) {
      const m = previos[i];
      if (m.meta === "fallo" && m.resume === "deliveries") {
        const abierta = sessionId();
        if (!abierta) return;
        try {
          await invoke("reintentar_reanudacion_por_entregas", { project: project(), session: abierta }, deLaTarea(abierta));
        } catch (e) {
          setError(prosaDe(e));
        }
        return;
      }
      if (m.role !== "user" || !m.text.trim()) continue;
      drafts.retryText(m.text, m.task_mentions);
      await mandar([]);
      return;
    }
  }

  // Con qué se escribió, capturado aquí: el mensaje se lleva agente, modelo y
  // esfuerzo del momento. Los adjuntos viajan como ruta de origen, copiados
  // al enviar: quitarlo de la cola no deja archivos sueltos.
  function encolar(text: string, attachments: string[], task_mentions?: TaskMention[], recipients?: Recipient[]) {
    const id = crypto.randomUUID();
    taskQueues.enqueue({
        id,
        text,
        task_mentions,
        recipients,
        provider: agent(),
        model: model() || null,
        effort: effortDelTurno(),
        permission_mode: modo() || null,
        attachments,
        space: escritorio(),
      });
    const session = sessionId(), intent = handoffAt(session);
    if (session && intent?.stopping && !intent.pending && !text.trimStart().startsWith("!")) void handoff.replaceWithQueued(conversationScope(session), id);
    return id;
  }

  function editarEncolado(id: string, text: string, mentions?: TaskMention[]) {
    if (injecting().some((item) => item.id === id)) return;
    taskQueues.edit(id, text, mentions);
  }

  function quitarEncolado(id: string) {
    if (injecting().some((item) => item.id === id)) return;
    taskQueues.remove(id);
    if (sessionId()) handoff.observe({ kind: "queue-removed", scope: conversationScope(sessionId()!), queueItemId: id });
  }

  /**
   * Deja de ofrecer «Mandar ahora» para ese agente y lo explica una vez. El
   * mensaje no se toca: sigue en la cola y sale cuando cierre el turno — es el
   * camino que el motor ya eligió al negarse.
   */
  function noRecibeAMedias(session: string, provider: string | null, aviso: string, workspace = workspaceActivo()) {
    if (!provider) return;
    const primera = !sinSteer().includes(provider);
    if (primera) setSinSteer((lista) => [...lista, provider]);
    if (!primera) return;
    threads.appendLive(session, [{ role: "system", text: t(aviso), meta: "steer_refused" }], workspace);
  }

  /**
   * Lo que la persona ya hace a mano cuando el agente no recibe mensajes a
   * medias: parar el turno y mandar lo encolado. No es un steer y no se
   * disfraza: el paso que corría se pierde, y el título del botón lo dice.
   */
  async function detenerYEnviar(id: string) {
    const abierta = sessionId(), message = cola().find(item => item.id === id);
    if (!abierta || !message || !interrumpible(message) || injecting().some(item => item.session === abierta && item.id === id)) return;
    if (!engineCanDispatch(abierta)) return handoff.replaceWithQueued(conversationScope(abierta), id);
    // Lo manda el motor: con el recibo de Detener, la cola sale al cerrar el turno.
    taskQueues.prioritize(id);
    await handoff.requestStop(conversationScope(abierta));
    if (!handoffAt(abierta)?.error) await reanudarCola(abierta);
  }

  /** Suelta la cola que retiene el motor, con el orden que se ve ya guardado. */
  async function reanudarCola(id: string) {
    try { if (id === sessionId()) await taskQueues.persist(id, project(), cola()); await resumeQueue(conversationScope(id)); }
    catch (e) { threads.appendLive(id, [{ role: "system", ...mensajeDeFallo(e), meta: "fallo" }]); }
  }

  /**
   * Mete un encolado en el turno que ya corre. Solo sale de la cola si el
   * backend lo aceptó: un mensaje que se borra de la lista sin haber entrado
   * en ningún sitio desaparece sin que nadie sepa que se perdió.
   */
  async function mandarAhora(id: string) {
    const abierta = sessionId();
    const m = cola().find((q) => q.id === id);
    if (!abierta || !m || !inyectable(m) || injecting().some((item) => item.id === id)) return;
    const sourceProject = project();
    const sourceWorkspace = workspaceActivo();
    // Quién contesta el turno vivo: la fila de la tarea, no el agente con que se
    // escribió lo encolado — el mensaje entra en el turno que corre, no en otro.
    const proveedor = filaDe(abierta)?.provider ?? m.provider;
    setInjecting((items) => [...items, { session: abierta, id }]);
    // Lo último del disco antes de meterlo: con un motor que no devuelve el turno,
    // lo guardado después con su texto es él (`mensajesDelHilo`).
    const tras = [...(hilos()[abierta]?.base ?? [])].reverse().find((msg) => msg.turno)?.turno ?? null;
    try {
      const attachments = await attachmentsFor(m.attachments, deLaTarea(abierta), sourceProject);
      // El turno tal como queda en la transcripción; `null` en un motor que todavía no lo devuelve.
      const guardado = await invoke<Turn | null>("inject_message", {
        project: sourceProject,
        session: abierta,
        prompt: m.text,
        taskMentions: m.task_mentions ?? [],
        queueId: id,
        attachments,
      }, deLaTarea(abierta));
      if (workspaceActivo() !== sourceWorkspace) return;
      // El turno sigue siendo el mismo, pero lo que contesta cambió: sin esto
      // el rótulo sigue contando desde el arranque hasta el próximo sondeo, y
      // bajo el mensaje recién escrito afirma una espera que no es suya.
      // Solo si ya había reloj: apuntarlo aquí encendería una fila quieta.
      setDesdeDeTurno((d) => (abierta in d ? { ...d, [abierta]: Date.now() } : d));
      taskQueues.remove(id, abierta);
      // Con su `turno`: la relectura de la tarea a mitad del turno ya lo trae de disco, y sin id salía dos veces.
      threads.appendLive(abierta, [{
                role: "user",
                text: m.text,
                task_mentions: m.task_mentions,
                attachments: attachments.length ? attachments : undefined,
                turno: guardado?.id ?? undefined,
                author: guardado?.author ?? undefined,
                inyectado: guardado?.id ? undefined : { tras },
              }]);
    } catch (e) {
      const clave = claveDe(e);
      // El turno acaba de cerrar: el mensaje sigue en la cola y sale como el siguiente.
      if (clave === "chat.steer.not_running" || clave === "chat.steer.stopping") return;
      if (clave === "chat.steer.delivered") {
        taskQueues.remove(id, abierta);
        return;
      }
      // Este agente no recibe mensajes a medias: sigue en la cola y sale al cerrar
      // el turno. Cortarlo mataba turnos de Claude que solo esperaban su canal.
      if (clave === "chat.steer.unsupported") {
        noRecibeAMedias(abierta, proveedor, "chat.steer.unsupported", sourceWorkspace);
        return;
      }
      // El ejecutor no pudo saber si entró. Se queda en la cola —borrarlo
      // perdería lo escrito— y se avisa en la lengua de la ventana: la clave es
      // interna y en el hilo se leía tal cual, con un reintento que repetía el
      // mismo rechazo.
      if (detalleDe(e) === ENTREGA_SIN_CONFIRMAR) {
        noRecibeAMedias(abierta, proveedor, "chat.steer.unconfirmed", sourceWorkspace);
        return;
      }
      threads.appendLive(abierta, [{ role: "system", ...mensajeDeFallo(e), meta: "fallo" }]);
    } finally {
      setInjecting((items) => items.filter((item) => item.id !== id));
    }
  }
  return { detenerYEnviar, editarEncolado, encolar, encolarYSoltar, mandarAhora, mandarTexto, quitarEncolado, reanudarCola, reintentar };
}
