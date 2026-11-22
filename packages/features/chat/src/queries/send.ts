import { type ObservedTurnActivity } from "../../../../../apps/desktop/src/lib/activityObservation.ts";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { type Trigger } from "../../../../../apps/desktop/src/lib/mentions.ts";
import { type Agent, type Source } from "../../../../../apps/desktop/src/lib/model.ts";
import { type CatalogosDeModelos } from "../../../../../apps/desktop/src/lib/models.ts";
import { type Recipient } from "../../../../../apps/desktop/src/lib/recipients.ts";
import { type ContentTab, type FileTab, type Tab } from "../../../../../apps/desktop/src/lib/tabs.ts";
import { esProvisional, tituloProvisional } from "../../../../../apps/desktop/src/lib/taskDraft";
import { type MentionTarget, type TaskMention, type TextEdit } from "../../../../../apps/desktop/src/lib/taskMentions.ts";
import { type OlderState } from "../model/history.ts";
import { invoke } from "../../../../engine-client/src/client.ts";
import { capabilities } from "../../../../host/src/platform";
import { claveDe, prosaDe } from "../../../../ui/src/Failure";
import { type Encolado } from "../components/MessageQueue";
import { type Respuesta, type RespuestaEnviada } from "../components/Questions";
import { mensajeDeFallo } from "../model/failures";
import { handoverInForce } from "../model/handover";
import { type HandoverPending, type HandoverState } from "../model/handover.ts";
import { type Author } from "../model/messageTypes.ts";
import { comandoEscrito } from "../model/slashOutput";
import { type Signatures } from "../model/transcript";
import { type ChatEvent, type Session, type TranscriptOrigin } from "../model/transcript.ts";
import { type Msg } from "../screens/Chat";
import { OPENCODE, canonicalAgentId, isFreeRouterModel } from "@terminus/tasks";
import { batch, type Accessor, type Setter } from "solid-js";
import type { CarriedBase, CarryMod, ContextSource, ConversationScope, Draft, DraftConfiguration, HandoffFact, HandoffPresentation, HandoffView, Hilo, HistoryEntry, IdsDeTurnos, Machine, MachineWait, ProviderVal, Saved, SessionRow, StartupContext, TranscriptMetadata, Transition } from "./types.js";


/** Lo que corta un envío cuya copia se detuvo: el fallo y su arreglo quedan en el encabezado. */
const CARRY_STOPPED = Symbol("carry-stopped");

/** Lo que el bloque usaba del cuerpo de App. */
export type SendDeps = { adoptarNacida: (id: string, nacida: { provisional: string | null; proyecto: string; titulo: string; claveBorrador: string; }) => void; advanceTurn: (id: string) => number; agents: Accessor<Agent[]>; apagadas: Accessor<Readonly<Record<string, string>>>; attachmentsFor: (paths: string[], options: { headers: Record<string, string>; } | undefined, proyecto: string) => Promise<string[]>; carryModule: Accessor<CarryMod>; catalogos: Accessor<CatalogosDeModelos>; claveAbierta: () => string; conversationScope: (id: string, projectId?: string) => ConversationScope; deLaTarea: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; draftBases: Accessor<Record<string, string>>; draftOptions: () => { headers: { "x-terminus-machine": string; }; } | undefined; drafts: { peek: (key: string) => Draft; current: () => Draft; sourceIds: Accessor<string[]>; excludedSourceIds: Accessor<string[]>; attached: Accessor<string[]>; pendingMaterial: Accessor<Source[]>; context: Accessor<Source[]>; input: () => string; files: () => string[]; changeText: (value: string, inputType?: string, change?: TextEdit) => void; history: (redo: boolean) => boolean; addFiles: (paths: string[]) => Promise<void>; addSource: (id: string) => void; removeSource: (id: string) => void; recipient: (name: string, label: string, trigger: Trigger) => void; reference: (target: MentionTarget, label: string, trigger: Trigger) => void; replaceFiles: (files: string[]) => { [x: string]: Draft; }; replaceAttached: (ids: string[]) => string[]; acceptSources: (ids: string[]) => string[]; configure: (configuration: DraftConfiguration, key?: string) => { [x: string]: Draft; }; handover: (provider: HandoverPending | null | undefined, key?: string) => { [x: string]: Draft; }; invalidateProvider: (key: string, provider: string) => { [x: string]: Draft | { input: string; task_mentions?: TaskMention[]; recipients?: Recipient[]; mentionHistory?: HistoryEntry[]; mentionFuture?: HistoryEntry[]; sourceIds: string[]; excludedSourceIds: string[]; archivos: string[]; configuration?: DraftConfiguration; }; }; restoreSession: (key: string, excluded: string[]) => { [x: string]: Draft; }; retryText: (text: string, mentions?: TaskMention[]) => { [x: string]: Draft; }; takeFiles: (key: string, files: string[]) => { [x: string]: Draft; }; restoreFailed: (key: string, message: HistoryEntry, files: string[]) => { [x: string]: Draft; }; sentSources: (key: string, ids: string[]) => { [x: string]: Draft; }; continueFrom: (prompt: string, path: string, sources: string[], excluded: string[]) => { [x: string]: Draft; }; promote: (from: string, to: string) => { [x: string]: Draft; }; drop: (key: string) => Record<string, Draft>; reset: () => void; dispose: () => void; }; espacioPara: (space: string | null | undefined, machine: string | null | undefined) => string | null; excludedSourceIds: Accessor<string[]>; filaDe: (id: string) => SessionRow | undefined; finishedTurns: Map<string, boolean | null | undefined>; firmas: Record<string, Author | null>; grupos: Accessor<string[]>; hablandoCon: Accessor<{ project: string; name: string; } | null>; handoff: { requestStop: (scope: ConversationScope) => Promise<void>; replaceWithQueued: (scope: ConversationScope, id: string) => Promise<void>; observe: (fact: HandoffFact) => void; view: (scope: ConversationScope) => HandoffView; presentation: (scope: ConversationScope) => HandoffPresentation; blocked: (scope: ConversationScope) => boolean; reset: () => void; dispose: () => void; }; leerTarea: (project: string, id: string, before?: number | null | undefined) => Promise<Session>; lifecycleRevision: number; loadResult: (id: string, session: Session, clear: boolean, generation: number) => void; machineWaits: Accessor<Readonly<Record<string, MachineWait>>>; machines: Accessor<Machine[]>; marcarQuieta: (id: string) => void; marcarViva: (id: string, desde?: number, startConfirmed?: boolean) => void; modelosEnVivo: Record<string, string | null>; olvidarPestana: (session: string) => void; opcionesDeLaTarea: (id: string | null | undefined, workspace: string | null | undefined) => { headers: { [k: string]: string; }; }; pendingStarts: Map<string, symbol>; pestanas: { pinned: Accessor<ReadonlySet<string>>; isPinned: (id: string) => boolean; pin: (id: string) => void; restorable: () => string[]; replacePreviews(groups: readonly (readonly string[])[], visible: readonly (string | null)[]): void; open: Accessor<Tab[]>; active: Accessor<string | null>; activeTab: () => Tab | null; load(ws: string | null, desk?: string | null): string | null; ensure(p: { id: string; project: string; titulo: string; }): void; commitDraft(draft: string, p: { id: string; project: string; titulo: string; }): void; openObservability(title: string): void; openScreen(machine: string, title: string): void; openContent(p: ContentTab): void; activate: (id: string | null) => void; close: (id: string) => Tab | null; closeMany: (ids: readonly string[], opts?: { remember?: boolean; }) => Tab | null; canReopen: () => boolean; reopen(alive: (p: Tab) => boolean): Tab | null; attachPreviewFiles(project: string, session: string, tree: string): [string, string][]; renameFiles(session: string, tree: string, from: string, end: string): [string, string][]; navigate(id: string, url: string): void; moveToProject(session: string, project: string): void; markChanged(id: string): void; dirty: Accessor<ReadonlySet<string>>; setDirty(id: string, dirty: boolean): void; registerSaver(id: string, save: (() => Promise<boolean>) | null): void; dirtyTabsToClose(ids: string | readonly string[]): FileTab[]; saveFiles(ids: string[]): Promise<boolean>; sync(find: (id: string) => { project: string; titulo: string; } | null): string[]; }; pintarNaciendo: (proyecto: string, titulo: string, con: { provider: string; model: string | null; }, encargado: string | null) => string; project: Accessor<string>; reconcileActiveTurns: () => Promise<void>; refetchMachines: () => Promise<void | never[]>; refreshSessions: (proyectos: string[]) => Promise<void>; retirarNaciendo: (id: string) => { project: string; row: SessionRow; }[]; sessionId: Accessor<string | null>; setArrancando: Setter<boolean>; setError: Setter<string | null>; setHablandoCon: Setter<{ project: string; name: string; } | null>; setSessionId: Setter<string | null>; settleTurn: (session: string, ok?: boolean | null, unsaved?: boolean) => Promise<void>; sourceIds: Accessor<string[]>; taskQueues: { items: Accessor<Encolado[]>; owner: Accessor<string | null>; editing: Accessor<boolean>; saved: (session: string) => Readonly<Saved> | undefined; openSession: (session: string, project: string, isCurrent?: () => boolean, fromEngine?: boolean) => Promise<void>; detach: () => void; remove: (id: string, session?: string | null) => void; persist: (session: string, project: string, queued: Encolado[]) => Promise<unknown>; adopt: (session: string) => string; editMode: (value: boolean) => boolean; enqueue: (message: Encolado, front?: boolean) => Encolado[]; edit: (id: string, text: string, mentions?: TaskMention[]) => Encolado[]; prioritize: (id: string) => Encolado[]; workspaceChanged: () => void; dispose: () => void; }; taskSources: Accessor<Source[] | null>; threads: { read: (project: string, id: string, before?: number | null | undefined) => Promise<Session>; acceptSession: (id: string, session: Session, clear: boolean, generation: number, latest?: boolean | undefined) => boolean; activities: (id: string, visible: readonly Msg[]) => ObservedTurnActivity<Msg>[]; beginActivity: (id: string, startedAt: number | null, startConfirmed?: boolean) => void; finishActivity: (id: string, workspace?: string | null) => void; rows: Accessor<Record<string, Hilo>>; current: Accessor<Hilo>; messages: Accessor<Msg[]>; loading: Accessor<string | null>; origins: Accessor<Readonly<Record<string, TranscriptOrigin | null>>>; offline: Accessor<Readonly<Record<string, string>>>; machineWaits: Accessor<Readonly<Record<string, MachineWait>>>; handovers: Accessor<Readonly<Record<string, HandoverState>>>; olderAvailable: Accessor<Readonly<Record<string, boolean>>>; recentAvailable: Accessor<Readonly<Record<string, boolean>>>; olderStatus: Accessor<Readonly<Record<string, OlderState>>>; recentTail: Accessor<Readonly<Record<string, Msg[]>>>; appendLive: (session: string, messages: Msg[], workspace?: string | null) => void; appendPersisted: (session: string, messages: Msg[]) => void; appendOptimistic: (session: string, messages: Msg[]) => void; acknowledgeOptimistic: (session: string, messages: Msg[]) => void; commitUniqueTurn: (session: string, message: Msg) => void; replaceTurn: (session: string, message: Msg) => void; reviseOptimistic: (session: string, target: Msg, patch: Pick<Msg, "respuestas" | "author">) => void; rejectOptimistic: (session: string, messages: Msg[]) => void; question: (session: string, fields: Pick<Msg, "turno" | "preguntas" | "questionRequestId" | "agent">, workspace?: string | null) => void; replay: (session: string, workspace?: string | null, replayId?: string) => void; finishSteps: (session: string) => void; event: (payload: ChatEvent, metadata: TranscriptMetadata) => void; older: (project: string, id: string) => Promise<(() => void) | null>; latest: (id: string) => Promise<void>; replaceHistory: (session: string, leida: Msg[], vaciarVivo: boolean, antepuesta?: boolean, guardados?: IdsDeTurnos, cola?: IdsDeTurnos, readRevision?: number) => void; saveWorkspace: (previous: string | null) => void; activateWorkspace: (workspace: string | null) => void; resetService: () => void; adoptDraft: (id: string) => void; dropSaved: (workspace: string, id: string) => void; flush: () => void; markMachineWait: (id: string, wait: MachineWait | null) => void; markAwake: (id: string) => void; startLoading: (id: string) => void; finishLoading: (id: string) => void; reading: (id: string, active: boolean) => void; drop: (session: string) => void; dispose: () => void; }; traspasos: Accessor<Readonly<Record<string, HandoverState>>>; workspaceActivo: Accessor<string | null>; workspaceContext: { active: Accessor<string | null>; mode: Accessor<string | null>; root: Accessor<string | null>; confirmed: Accessor<boolean>; generation: () => number; beginTransition: (startup: StartupContext) => Transition; activate: (token: Transition) => boolean; beginMaterial: () => Readonly<{ generation: number; material: number; }>; current: (token: Readonly<{ generation: number; material: number; }>) => boolean; currentMaterial: (token: Readonly<{ generation: number; material: number; }>) => boolean; confirmContext: (token: Readonly<{ generation: number; material: number; }>, candidate: string | null, listed: ContextSource[]) => "obsolete" | "unavailable" | "accepted"; modeChanged: (workspace: string | null, value: string | null, requestedGeneration?: number) => void; dispose: () => void; } };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 4892–5203, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createSend(deps: SendDeps) {
  const { adoptarNacida, advanceTurn, agents, apagadas, attachmentsFor, catalogos, claveAbierta, conversationScope, deLaTarea, draftBases, draftOptions, drafts, espacioPara, excludedSourceIds, filaDe, finishedTurns, firmas, grupos, hablandoCon, handoff, leerTarea, loadResult, machineWaits, machines, marcarQuieta, marcarViva, modelosEnVivo, opcionesDeLaTarea, pendingStarts, pestanas, pintarNaciendo, project, reconcileActiveTurns, refetchMachines, refreshSessions, retirarNaciendo, sessionId, setArrancando, setError, setHablandoCon, setSessionId, settleTurn, sourceIds, taskQueues, taskSources, threads, traspasos, workspaceActivo, workspaceContext } = deps;
  const carryModule: SendDeps["carryModule"] = (...a: Parameters<SendDeps["carryModule"]>) => deps.carryModule(...a);
  const olvidarPestana: SendDeps["olvidarPestana"] = (...a: Parameters<SendDeps["olvidarPestana"]>) => deps.olvidarPestana(...a);
  /**
   * Lanza un turno. Devuelve si llegó a arrancar: con `false`, quien
   * vació la caja le devuelve los adjuntos. Toma con qué correr del
   * mensaje, no de los selectores: mover el selector con la cola llena
   * no reescribe lo que esos mensajes van a hacer.
   */
  async function enviar(
    m: Omit<Encolado, "id">,
    /**
     * Lo que se contesta, en sus dos formas: `manda` son referencias que Rust
     * resuelve contra la transcripción, y `pinta` es lo mismo ya legible para
     * no dejar la pantalla en blanco mientras vuelve.
     */
    respuestas?: { manda: RespuestaEnviada[]; pinta: Respuesta[] },
    destination?: { project: string; session: string },
    /** La copia del trabajo a la otra máquina, antes de crear la tarea allá. */
    llevar?: (claveBorrador: string) => Promise<CarriedBase | null>,
    /** El `clientMessageId` de lo que sale de la cola; uno nuevo en un envío directo. */
    deLaCola?: string,
  ): Promise<boolean> {
    if (!destination && sourceIds().some((id) => !taskSources()?.some((source) => source.id === id))) {
      setError(t("projects.context.task_unavailable"));
      return false;
    }
    // Antes de cualquier `await`: es lo que impide que el despacho de
    // la cola saque dos mensajes en el mismo respiro.
    // Se marca la sesión si ya existe, y si no, la ventana sin id: un
    // turno que reanuda tiene su id desde el principio; el primero de
    // una tarea nueva lo recibe al volver de Rust, más abajo.
    const generation = workspaceContext.generation();
    const abierta = destination?.session ?? sessionId();
    if (abierta && !esProvisional(abierta) && capabilities().taskWritable?.(abierta) === false) return false;
    // La identidad del envío: un reintento la repite y el motor no lo manda dos veces.
    const clientMessageId = deLaCola ?? crypto.randomUUID();
    const creationOptions = abierta ? undefined : draftOptions();
    if (abierta) advanceTurn(abierta);
    else deps.lifecycleRevision++;
    const start = Symbol();
    if (abierta) pendingStarts.set(abierta, start);
    if (abierta) finishedTurns.delete(abierta);
    const proyecto = destination?.project ?? project();
    const agenteDelBorrador = abierta ? null : hablandoCon()?.name ?? null;
    // De qué hilo y de qué borrador es este turno, capturado aquí: el
    // primero de una tarea nueva cambia la sesión abierta a mitad de
    // camino, y hay que soltar la clave con la que se mandó.
    const clave = abierta ?? "";
    const claveBorrador = destination?.session ?? claveAbierta();
    const selectedBase = draftBases()[claveBorrador] ?? null;
    const pendientes = destination ? drafts.peek(claveBorrador)?.sourceIds ?? [] : sourceIds();
    const excluidas = destination ? drafts.peek(claveBorrador)?.excludedSourceIds ?? [] : excludedSourceIds();
    if (abierta) marcarViva(abierta, Date.now());
    else { threads.beginActivity("", Date.now()); setArrancando(true); }
    // Conversar es editar: la pestaña de la tarea deja de ser vista.
    if (abierta) pestanas.pin(abierta);
    // La tarea se pinta antes de que Rust la cree. Lo que la retrasaba no era
    // su nombre —`mentions::titulo_desde` lo saca del encargo antes de lanzar
    // nada— sino el evento `started`, que `chat::acp` emite cuando el proceso
    // del agente ya contestó al saludo.
    const provisional = abierta ? null : pintarNaciendo(proyecto, tituloProvisional(m.text), m, agenteDelBorrador);
    // Con qué se firma este turno. Se pregunta por el agente de ESTE mensaje y
    // no por el del selector: la cola guarda con qué se escribió cada uno, y
    // moverlo a mitad de un turno no puede reescribir hacia atrás quién
    // contestó los que ya estaban esperando.
    const signatureReady = invoke<Signatures>("turn_authors", {
      provider: m.provider,
    }).catch(() => null);
    const firmaDelTurno = respuestas ? await signatureReady : null;
    firmas[abierta ?? ""] = firmaDelTurno?.agent ?? null;
    modelosEnVivo[abierta ?? ""] = m.model || null;
    // El material que entra con este mensaje se dice en el hilo y
    // ahora, no al reabrir la tarea. Solo en una conversación
    // empezada: en el primer turno el preámbulo enumera el material
    // entero.
    const entrando: Msg[] =
      abierta && pendientes.length > 0
        ? [
            {
              role: "system",
              text: "",
              contexto: { entraron: pendientes },
            },
          ]
        : [];
    // El globo puede existir mientras se manda; su procedencia no. Afirmar aquí
    // que una persona contestó fabricaría ese dato si Rust rechazara la
    // relación. Se conserva la misma referencia para completarlo solo después
    // de que `send_message` haya validado y persistido la respuesta.
    const turnoPropio: Msg = {
      role: "user",
      text: m.text,
      task_mentions: m.task_mentions,
      // La línea de dirección se pinta con el globo y no al recargar: quien
      // manda tiene que ver a quién se le entregó en el momento de mandarlo.
      recipients: m.recipients?.length ? m.recipients : undefined,
      author: firmaDelTurno?.person ?? null,
      // Las rutas absolutas preparadas al adjuntar también sirven al releer del disco.
      attachments: m.attachments.length ? m.attachments : undefined,
    };
    threads.appendOptimistic(clave, [...entrando, turnoPropio]);
    // Mandar a una tarea de una máquina apagada la enciende: el proxy espera a que
    // conteste y entrega una sola vez.
    const dormida = abierta ? apagadas()[abierta] ?? null : null;
    if (abierta && dormida) threads.markMachineWait(abierta, { machine: dormida, phase: "waking" });
    // Y crear en la elegida en «Ejecutar en» si está apagada: el aviso cuelga de la pestaña que nace.
    const destino = creationOptions?.headers["x-terminus-machine"] ?? null;
    const naceDormida = destino && machines().find((x) => x.id === destino)?.on === false ? destino : null;
    if (provisional && naceDormida) threads.markMachineWait(provisional, { machine: naceDormida, phase: "waking" });
    try {
      const llevado = llevar ? await llevar(claveBorrador) : null;
      if (llevar && !llevado) throw CARRY_STOPPED;
      // La respuesta de una persona no existe en la interfaz hasta que Rust la
      // validó y la escribió: primero persistir, y solo entonces pintarla.
      const opciones = abierta ? deLaTarea(abierta) : llevado ? { headers: { "x-terminus-machine": llevado.target } } : creationOptions;
      const attachments = await attachmentsFor(m.attachments, opciones, proyecto);
      if (canonicalAgentId(m.provider) === OPENCODE && !isFreeRouterModel(m.model)) {
        const selected = catalogos()[m.provider]?.models.find((model) => model.id === m.model);
        if (!selected || selected.gratis === true) throw new Error(t("surfaces.free_off"));
      }
      const mandarTurno = () => invoke<string>("send_message", {
        provider: m.provider,
        project: proyecto,
        session: abierta,
        prompt: m.text,
        taskMentions: m.task_mentions ?? [],
        // A quién va dirigido. Lista aparte del material: con destinatarios,
        // el turno no lo contesta esta conversación —`chat::send_message` lo
        // entrega al buzón de cada uno y deja aquí a quién se entregó—.
        recipients: m.recipients ?? [],
        model: m.model,
        effort: m.effort,
        permissionMode: m.permission_mode,
        attachments,
        // Viaja con el turno: en el primero la tarea aún no existe, y guardarlo
        // después llegaba tarde a su propio contexto.
        sources: pendientes,
        excludedSources: excluidas,
        respuestas: respuestas?.manda ?? null,
        baseRef: abierta ? null : (llevado?.baseRef ?? selectedBase),
        // La tarea nace en la foto del trabajo llevado y la deshace en cambios sin commit.
        ...(llevado?.unwrapSnapshot ? { unwrapSnapshot: true } : {}),
        // Solo al crear: el encargado sale de haber pulsado su fila en el
        // riel, no de un selector. Una tarea ya abierta lleva el suyo
        // sellado y volver a mandarlo lo reescribiría.
        agent: agenteDelBorrador,
        taskFromAgent: !!agenteDelBorrador,
        // Quién escribió esto, cuando no fue la persona: una entrega que la
        // cola guardó mientras el chat contestaba sale por aquí, y sin este
        // renglón aterriza firmada por quien mira la pantalla.
        fromAgent: m.agent ?? null,
        // Y por dónde lo escribió la persona: sin esto, lo que llegó por
        // Telegram mientras el chat contestaba ya no vuelve por Telegram.
        fromChannel: m.channel ?? null,
        // Y la otra mitad del sobre. El remitente sin dirección de retorno
        // firma la entrega pero no dice dónde se contesta: quien preguntó se
        // queda esperando una respuesta que no vuelve
        // (`docs/specs/handler-mentions.md` § 3).
        replyTo: m.reply_to ?? null,
        hops: m.hops ?? null,
        fromTask: m.from_task ?? null,
        // El escritorio que la persona tenía delante al escribirlo, sellado en el
        // mensaje; lo que llega de otro canal no trae ninguno.
        space: espacioPara(m.space, opciones?.headers?.["x-terminus-machine"]),
        clientMessageId,
      }, opciones);
      // El consentimiento del traspaso va justo antes del turno: el motor lo
      // consume en `send_message` y deja de valer para el siguiente.
      const pendiente = abierta ? drafts.peek(claveBorrador)?.provider ?? null : null;
      const actual = abierta ? (traspasos()[abierta]?.provider ?? filaDe(abierta)?.provider ?? null) : null;
      const vigente = handoverInForce(pendiente, actual);
      // Otro cliente cambió el CLI: el gesto confirmado ya no parte del que la
      // sesión tiene. Se suelta en vez de traspasar desde otro.
      if (pendiente && !vigente) {
        drafts.handover(null, claveBorrador);
      }
      const { sendWithHandover } = await import("./handoverSend");
      const traspaso = await sendWithHandover({
        session: abierta,
        pending: vigente?.to ?? null,
        current: actual,
        provider: m.provider,
        command: m.text.trimStart().startsWith("!"),
        setProvider: (provider: ProviderVal) =>
          invoke("set_session_provider", { project: proyecto, session: abierta ?? "", provider }, opcionesDeLaTarea(abierta, workspaceActivo())),
        send: () => {
          const target = opciones?.headers?.["x-terminus-machine"];
          const machine = target ? machines().find((row) => row.id === target) : undefined;
          if (dormida || naceDormida || !machine || machine.local || !machine.on || machine.connection !== "unknown") return mandarTurno();
          const waitingId = abierta ?? provisional ?? claveBorrador;
          const wait = { machine: machine.id, phase: "connecting" } as const;
          threads.markMachineWait(waitingId, wait);
          return mandarTurno().finally(() => {
            if (machineWaits()[waitingId] === wait) threads.markMachineWait(waitingId, null);
          });
        },
      });
      const id = traspaso.answer;
      if (generation === workspaceContext.generation()) handoff.observe({ kind: "accepted", scope: conversationScope(id, proyecto) });
      threads.acknowledgeOptimistic(clave, [...entrando, turnoPropio]);
      // El gesto quedó consumido: se escribió el consentimiento o el mensaje ya
      // salió con el CLI que pedía. Un `!` no lo consume.
      if (traspaso.settled) {
        drafts.handover(null, claveBorrador);
      }
      if (provisional && naceDormida) {
        threads.markMachineWait(provisional, null);
        void refetchMachines();
      }
      if (abierta && dormida) {
        threads.markMachineWait(abierta, null);
        threads.markAwake(abierta);
        void refreshSessions(grupos());
        void leerTarea(proyecto, abierta)
          .then((s) => loadResult(abierta, s, false, generation))
          .catch(() => {});
      }
      if (generation !== workspaceContext.generation()) return true;
      if (respuestas) {
        threads.reviseOptimistic(clave, turnoPropio, { respuestas: respuestas.pinta });
      }
      // El turno ya tiene a qué colgarse: deja de ser «la ventana sin id».
      firmas[id] = firmas[id] ?? firmas[""] ?? null;
      modelosEnVivo[id] = modelosEnVivo[id] ?? modelosEnVivo[""] ?? null;
      // Antes de adoptarla: su encabezado lee de dónde vino al pintarse.
      if (llevado) carryModule()?.adoptOrigin(claveBorrador, id);
      if (!abierta) adoptarNacida(id, { provisional, proyecto, titulo: tituloProvisional(m.text), claveBorrador });
      void leerTarea(proyecto, id)
        .then((s) => loadResult(id, s, false, generation))
        .catch((error) => { if (generation === workspaceContext.generation()) setError(prosaDe(error)); });
      if (!finishedTurns.has(id)) marcarViva(id);
      void signatureReady.then((signature) => {
        if (generation !== workspaceContext.generation()) return;
        firmas[id] = signature?.agent ?? null;
        if (!respuestas) {
          threads.reviseOptimistic(id, turnoPropio, { author: signature?.person ?? null });
        }
      });
      if (!abierta) { threads.finishActivity(""); setArrancando(false); }
      // Las fuentes de este mensaje salen del borrador; las de otro
      // que siga esperando, no. Va por id: da igual qué se esté mirando.
      drafts.sentSources(id, pendientes);
      // Lo que cuelga de la vista, solo si la vista sigue donde
      // arrancó el turno: el primer mensaje crea la tarea en Rust
      // mientras se puede mirar otra, y ponerla delante aquí dejaba
      // `colaDe` nombrando la recién nacida con la cola de la que se
      // mira en la mano —lo escrito para aquélla se guardaba en la
      // carpeta de ésta. Lo de la tarea ya quedó hecho arriba, por id.
      if (
        abierta
          ? sessionId() === abierta
          : claveAbierta() === claveBorrador
      ) {
        setSessionId(id);
        if (!abierta) setHablandoCon(null);
        // Ya viajaron: dejan de ser pendientes y pasan a ser el contexto de la
        // conversación, que se sigue viendo mientras esté abierta.
        if (pendientes.length > 0)
          drafts.acceptSources(pendientes);
        // La cola escrita durante el primer turno es de la sesión que ese turno
        // acaba de crear.
        taskQueues.adopt(id);
      }
      if (finishedTurns.has(id)) void settleTurn(id, finishedTurns.get(id));
      return true;
    } catch (e) {
      if (abierta && dormida) threads.markMachineWait(abierta, null);
      if (provisional && naceDormida) threads.markMachineWait(provisional, null);
      // Sin esto queda una tarea que nadie creó: la fila y la pestaña se
      // pintaron contando con que Rust aceptara el turno.
      if (provisional) {
        retirarNaciendo(provisional);
        pestanas.close(provisional);
        olvidarPestana(provisional);
      }
      threads.rejectOptimistic(clave, [turnoPropio, ...entrando]);
      if (generation !== workspaceContext.generation()) return false;
      if (abierta) handoff.observe({ kind: "rejected", scope: conversationScope(abierta, proyecto), error: e });
      if (e === CARRY_STOPPED) {
        // El texto vuelve a la caja: el globo se iría duplicado.
        setArrancando(false);
        return false;
      }
      if (destination && claveDe(e) === "history.error.busy") {
        marcarQuieta(destination.session);
        throw e;
      }
      // Lo escrito para una tarea que otro turno ocupa espera en su cola, con la misma identidad.
      if (!respuestas && !deLaCola && claveDe(e) === "history.error.busy" && abierta === sessionId()) {
        batch(() => { taskQueues.enqueue({ ...m, id: clientMessageId }, true); setArrancando(false); if (abierta) marcarQuieta(abierta); });
        return true;
      }
      if (!abierta) { threads.finishActivity(""); setArrancando(false); }
      if (abierta) marcarQuieta(abierta);
      threads.appendLive(clave, [{
                  role: "system",
                  // Una negativa de comando llega como clave: la frase nombra lo escrito.
                  ...mensajeDeFallo(e, {
                    command: comandoEscrito(m.text),
                    agent: agents().find((a) => a.id === m.provider)?.label ?? m.provider,
                  }),
                  meta: "fallo",
                }]);
      if (respuestas) throw e;
      return false;
    } finally {
      if (abierta && pendingStarts.get(abierta) === start) pendingStarts.delete(abierta);
      void reconcileActiveTurns();
    }
  }

  type Pendientes = {
    records?: { permissions: { id: string; request_id: string; state: string; [key: string]: unknown }[] };
    // `id` y `revision` faltan en un motor anterior a los pendientes durables.
    questions: { id?: string; request_id: string; revision?: number; turn: string }[];
    permissions: { id?: string; request_id: string; revision?: number; tool: string; target: string | null }[];
  };
  /** Lo que esa tarea tiene esperando. No lanza: sin respuesta, no hay nada. */
  const pendientesDe = (session: string, workspace = workspaceActivo()) =>
    invoke<Pendientes>("pending_requests", { session }, opcionesDeLaTarea(session, workspace)).catch(() => null);
  return { enviar, pendientesDe };
}
