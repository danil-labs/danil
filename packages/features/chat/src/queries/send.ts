
import { t } from "../../../../ui/src/lib/i18n";
import { type Agent, type Source } from "../../../../ui/src/lib/model.ts";
import { type CatalogosDeModelos } from "../../../../ui/src/lib/models.ts";
import { esProvisional, tituloProvisional } from "../../../../ui/src/lib/taskDraft";
import { callEngine } from "../../../../engine-client/src/client.ts";
import { capabilities } from "../../../../host/src/platform";
import { claveDe, prosaDe } from "../../../../ui/src/Failure";
import { type Encolado } from "../components/MessageQueue";
import { type Respuesta, type RespuestaEnviada } from "../components/Questions";
import { mensajeDeFallo } from "../model/failures";
import { handoverInForce } from "../model/handover";
import { type HandoverState } from "../model/handover.ts";
import { type Author } from "../model/messageTypes.ts";
import { comandoEscrito } from "../model/slashOutput";
import { type Signatures } from "../model/transcript";
import { type Session } from "../model/transcript.ts";
import { type Msg } from "../screens/Chat";
import { OPENCODE, canonicalAgentId, isFreeRouterModel } from "../../../../ui/src/lib/tasks/index.ts";
import { batch, type Accessor, type Setter } from "solid-js";
import type { CarriedBase, DraftsPort, MachineWait, MachinesPort, SessionRow, WorkspaceContextPort, createThreadsStore } from "./types.ts";
import type { createTabs } from "../../../../ui/src/lib/tabs.ts";
import type { createPanelDeChat } from "../screens/PanelDeChat.tsx";
import type { createAttachmentsMount } from "./attachments-mount.ts";
import type { createAttachments } from "./attachments.ts";
import type { createHandover } from "./handover.ts";
import type { createResync } from "./resync.ts";
import type { createSendGates } from "./send-gates.ts";
import type { createThreadStream } from "./thread-stream.ts";


/** Lo que corta un envío cuya copia se detuvo: el fallo y su arreglo quedan en el encabezado. */
const CARRY_STOPPED = Symbol("carry-stopped");

/** Lo que el bloque usaba del cuerpo de App. */
export type SendDeps = { adoptarNacida: ReturnType<typeof createHandover>["adoptarNacida"]; advanceTurn: ReturnType<typeof createThreadStream>["advanceTurn"]; agents: Accessor<Agent[]>;
  apagadas: Accessor<Readonly<Record<string, string>>>; attachmentsFor: ReturnType<typeof createAttachments>["attachmentsFor"]; carryModule: ReturnType<typeof createSendGates>["carryModule"];
  catalogos: Accessor<CatalogosDeModelos>; claveAbierta: () => string; conversationScope: ReturnType<typeof createThreadStream>["conversationScope"];
  deLaTarea: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; draftBases: Accessor<Record<string, string>>;
  draftOptions: () => { headers: { "x-terminus-machine": string; }; } | undefined; drafts: DraftsPort;
  excludedSourceIds: Accessor<string[]>; filaDe: (id: string) => SessionRow | undefined;
  finishedTurns: ReturnType<typeof createThreadStream>["finishedTurns"]; firmas: Record<string, Author | null>; grupos: Accessor<string[]>;
  hablandoCon: Accessor<{ project: string; name: string; } | null>; handoff: ReturnType<typeof createThreadStream>["handoff"];
  leerTarea: (project: string, id: string, before?: number | null | undefined) => Promise<Session>; lifecycleRevision: number;
  loadResult: (id: string, session: Session, clear: boolean, generation: number) => void; machineWaits: Accessor<Readonly<Record<string, MachineWait>>>; machines: MachinesPort;
  marcarQuieta: ReturnType<typeof createThreadStream>["marcarQuieta"]; marcarViva: ReturnType<typeof createThreadStream>["marcarViva"]; modelosEnVivo: Record<string, string | null>;
  olvidarPestana: ReturnType<typeof createPanelDeChat>["olvidarPestana"];
  opcionesDeLaTarea: (id: string | null | undefined, workspace: string | null | undefined) => { headers: { [k: string]: string; }; };
  pendingStarts: ReturnType<typeof createThreadStream>["pendingStarts"]; pestanas: ReturnType<typeof createTabs>; pintarNaciendo: ReturnType<typeof createHandover>["pintarNaciendo"];
  paneles: { showDraft(): void };
  project: Accessor<string>; reconcileActiveTurns: ReturnType<typeof createResync>["reconcileActiveTurns"]; refetchMachines: () => Promise<void | never[]>;
  refreshSessions: (proyectos: string[]) => Promise<void>; retirarNaciendo: (id: string) => { project: string; row: SessionRow; }[]; sessionId: Accessor<string | null>;
  setArrancando: ReturnType<typeof createThreadStream>["setArrancando"]; setError: Setter<string | null>; setHablandoCon: Setter<{ project: string; name: string; } | null>;
  setSessionId: Setter<string | null>; settleTurn: ReturnType<typeof createAttachmentsMount>["settleTurn"]; sourceIds: Accessor<string[]>;
  taskQueues: ReturnType<typeof createThreadStream>["taskQueues"]; taskSources: Accessor<Source[] | null>;
  taskSpaceCreate?: (requested: string | null | undefined) => { engineSpace: string | null; record: (taskId: string) => void };
  threads: ReturnType<typeof createThreadsStore>;
  traspasos: Accessor<Readonly<Record<string, HandoverState>>>; workspaceActivo: Accessor<string | null>; workspaceContext: WorkspaceContextPort; };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 4892–5203, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createSend(deps: SendDeps) {
  const { adoptarNacida, advanceTurn, agents, apagadas, attachmentsFor, catalogos, claveAbierta, conversationScope, deLaTarea, draftBases, draftOptions, drafts, excludedSourceIds, filaDe, finishedTurns, firmas, grupos, hablandoCon, handoff, leerTarea, loadResult, machineWaits, machines, marcarQuieta, marcarViva, modelosEnVivo, opcionesDeLaTarea, pendingStarts, pestanas, pintarNaciendo, paneles, project, reconcileActiveTurns, refetchMachines, refreshSessions, retirarNaciendo, sessionId, setArrancando, setError, setHablandoCon, setSessionId, settleTurn, sourceIds, taskQueues, taskSources, taskSpaceCreate, threads, traspasos, workspaceActivo, workspaceContext } = deps;
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
    const marcarArranque = () => {
      if (abierta) {
        marcarViva(abierta, Date.now());
        // Conversar es editar: la pestaña de la tarea deja de ser vista.
        pestanas.pin(abierta);
      } else {
        threads.beginActivity("", Date.now());
        setArrancando(true);
      }
    };
    // Con respuestas hay `await` antes del globo: marcar el turno antes impide
    // que el despacho de la cola saque dos mensajes en el mismo respiro.
    if (respuestas) marcarArranque();
    // Con qué se firma este turno. Se pregunta por el agente de ESTE mensaje y
    // no por el del selector: la cola guarda con qué se escribió cada uno, y
    // moverlo a mitad de un turno no puede reescribir hacia atrás quién
    // contestó los que ya estaban esperando.
    const signatureReady = callEngine<Signatures>("turn_authors", {
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
      // Sin turno todavía: al releer, el del disco con este texto después de `tras` es él.
      inyectado: { tras: [...(threads.rows()[clave]?.base ?? [])].reverse().find((row) => row.turno)?.turno ?? null },
    };
    // Mandar a una tarea de una máquina apagada la enciende: el proxy espera a que
    // conteste y entrega una sola vez.
    const dormida = abierta ? apagadas()[abierta] ?? null : null;
    // Y crear en la elegida en «Ejecutar en» si está apagada: el aviso cuelga de la pestaña que nace.
    const destino = creationOptions?.headers["x-terminus-machine"] ?? null;
    const naceDormida = destino && machines().find((x) => x.id === destino)?.on === false ? destino : null;
    // Arranque, globo optimista y pestaña provisional en un único lote: la nueva
    // pestaña ya nace con su primer mensaje y sin montar el selector de carpetas.
    let provisional: string | null = null;
    batch(() => {
      if (!respuestas) marcarArranque();
      threads.appendOptimistic(clave, [...entrando, turnoPropio]);
      // La tarea se pinta antes de que Rust la cree. Lo que la retrasaba no era
      // su nombre —`mentions::titulo_desde` lo saca del encargo antes de lanzar
      // nada— sino el evento `started`, que `chat::acp` emite cuando el proceso
      // del agente ya contestó al saludo.
      if (!abierta) provisional = pintarNaciendo(proyecto, tituloProvisional(m.text), m, agenteDelBorrador);
      if (abierta && dormida) threads.markMachineWait(abierta, { machine: dormida, phase: "waking" });
      if (provisional && naceDormida) threads.markMachineWait(provisional, { machine: naceDormida, phase: "waking" });
    });
    let enviado = false;
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
      const spacePlan = !abierta && taskSpaceCreate
        ? taskSpaceCreate(m.space)
        : { engineSpace: m.space ?? null, record: () => {} };
      const mandarTurno = () => callEngine<string>("send_message", {
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
        // mensaje; con spaces en workspaces el motor usa su espacio por defecto y
        // el mapeo del usuario se graba inmediatamente al volver el id.
        space: spacePlan.engineSpace,
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
        setProvider: (provider) =>
          callEngine("set_session_provider", { project: proyecto, session: abierta ?? "", provider }, opcionesDeLaTarea(abierta, workspaceActivo())),
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
      enviado = true;
      const id = traspaso.answer;
      if (!abierta) spacePlan.record(id);
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
      // Adopción, estado vivo y sesión abierta en un solo lote: no parpadea `busy`
      // ni vuelve a quedar vacío el hilo al mudar de la pestaña provisional al id real.
      batch(() => {
        // Antes de adoptarla: su encabezado lee de dónde vino al pintarse.
        if (llevado) carryModule()?.adoptOrigin(claveBorrador, id);
        if (!abierta) adoptarNacida(id, { provisional, proyecto, titulo: tituloProvisional(m.text), claveBorrador });
        if (!finishedTurns.has(id)) {
          // Protege el turno recién aceptado hasta que `started` o `list_active_turns`
          // lo confirme; sin esto, `reconcileActiveTurns()` al salir de `enviar` lo
          // asentaba antes de tiempo en máquinas lentas o remotas.
          pendingStarts.set(id, start);
          marcarViva(id);
        }
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
            : claveAbierta() === claveBorrador || (provisional !== null && pestanas.active() === id)
        ) {
          if (!abierta) {
            setSessionId(id);
            setHablandoCon(null);
            // La cola escrita durante el primer turno es de la sesión que ese turno
            // acaba de crear.
            taskQueues.adopt(id);
          }
          // Ya viajaron: dejan de ser pendientes y pasan a ser el contexto de la
          // conversación, que se sigue viendo mientras esté abierta.
          if (pendientes.length > 0)
            drafts.acceptSources(pendientes);
        }
      });
      void leerTarea(proyecto, id)
        .then((s) => loadResult(id, s, false, generation))
        .catch((error) => { if (generation === workspaceContext.generation()) setError(prosaDe(error)); });
      void signatureReady.then((signature) => {
        if (generation !== workspaceContext.generation()) return;
        firmas[id] = signature?.agent ?? null;
        if (!respuestas) {
          threads.reviseOptimistic(id, turnoPropio, { author: signature?.person ?? null });
        }
      });
      if (finishedTurns.has(id)) void settleTurn(id, finishedTurns.get(id));
      return true;
    } catch (e) {
      if (abierta && dormida) threads.markMachineWait(abierta, null);
      if (provisional && naceDormida) threads.markMachineWait(provisional, null);
      // Sin esto queda una tarea que nadie creó: la fila y la pestaña se
      // pintaron contando con que Rust aceptara el turno.
      const retirarProvisional = () => {
        if (!provisional || enviado) return;
        retirarNaciendo(provisional);
        // Cerrar la pestaña provisional con `close` deja delante a su vecina
        // (la tarea anterior) y la vista volvía a lo que se estaba mirando.
        // Se vuelve al blanco en el mismo lote: el fallo se pinta en la celda
        // vacía y el texto vuelve a la caja (`mandar` lo repone con `false`).
        pestanas.close(provisional);
        pestanas.activate(null);
        paneles.showDraft();
        olvidarPestana(provisional);
      };
      if (generation !== workspaceContext.generation()) {
        batch(() => {
          retirarProvisional();
          threads.rejectOptimistic(clave, [turnoPropio, ...entrando]);
        });
        return false;
      }
      if (abierta && !enviado) handoff.observe({ kind: "rejected", scope: conversationScope(abierta, proyecto), error: e });
      if (e === CARRY_STOPPED) {
        // El texto vuelve a la caja: el globo se iría duplicado y el blanco recupera su selector.
        batch(() => {
          retirarProvisional();
          threads.rejectOptimistic(clave, [turnoPropio, ...entrando]);
          if (!abierta) { threads.finishActivity("", undefined, "failed"); setArrancando(false); }
        });
        return false;
      }
      if (destination && claveDe(e) === "history.error.busy") {
        batch(() => {
          retirarProvisional();
          threads.rejectOptimistic(clave, [turnoPropio, ...entrando]);
          marcarQuieta(destination.session, "failed");
        });
        throw e;
      }
      // Lo escrito para una tarea que otro turno ocupa espera en su cola, con la misma identidad.
      if (!respuestas && !deLaCola && claveDe(e) === "history.error.busy" && abierta === sessionId()) {
        batch(() => {
          retirarProvisional();
          threads.rejectOptimistic(clave, [turnoPropio, ...entrando]);
          taskQueues.enqueue({ ...m, id: clientMessageId }, true);
          if (!abierta) { threads.finishActivity("", undefined, "failed"); setArrancando(false); }
          if (abierta) marcarQuieta(abierta);
        });
        return true;
      }
      // Ya salió: un fallo posterior no es un envío fallido ni devuelve el texto a la caja.
      if (enviado) { threads.acknowledgeOptimistic(clave, [...entrando, turnoPropio]); return true; }
      // Error real de envío: el globo se queda con «Reintentar» y la caja no lo repone.
      batch(() => {
        retirarProvisional();
        threads.acknowledgeOptimistic(clave, [...entrando, turnoPropio]);
        if (!abierta) { threads.finishActivity("", undefined, "failed"); setArrancando(false); }
        if (abierta) marcarQuieta(abierta, "failed");
        threads.appendLive(clave, [{
                    role: "system",
                    // Una negativa de comando llega como clave: la frase nombra lo escrito.
                    ...mensajeDeFallo(e, {
                      command: comandoEscrito(m.text),
                      agent: agents().find((a) => a.id === m.provider)?.label ?? m.provider,
                    }),
                    meta: "fallo",
                  }]);
      });
      if (respuestas) throw e;
      return false;
    } finally {
      if (!enviado && abierta && pendingStarts.get(abierta) === start) pendingStarts.delete(abierta);
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
    callEngine<Pendientes>("pending_requests", { session }, opcionesDeLaTarea(session, workspace)).catch(() => null);
  return { enviar, pendientesDe };
}
