import { type ObservedTurnActivity } from "../../../../../../apps/desktop/src/lib/activityObservation.ts";
import { t } from "../../../../../../apps/desktop/src/lib/i18n";
import { type Trigger } from "../../../../../../apps/desktop/src/lib/mentions.ts";
import { type Project, type Source } from "../../../../../../apps/desktop/src/lib/model.ts";
import { trimDraft } from "../../../../../../apps/desktop/src/lib/recipients";
import { type Recipient } from "../../../../../../apps/desktop/src/lib/recipients.ts";
import { preguntaAlMargen } from "../../../../../../apps/desktop/src/lib/side-question";
import { type MentionTarget, type TaskMention, type TextEdit } from "../../../../../../apps/desktop/src/lib/taskMentions.ts";
import { type OlderState } from "../../model/history.ts";
import { invoke } from "../../../../../engine-client/src/client.ts";
import { capabilities } from "../../../../../host/src/platform";
import { prosaDe } from "../../../../../ui/src/Failure";
import { type Encolado } from "../../components/MessageQueue.tsx";
import { type Respuesta, type RespuestaEnviada } from "../../components/Questions";
import { type PreguntasAMedias } from "../../components/Questions.tsx";
import { mensajeDeFallo } from "../../model/failures";
import { type HandoverPending, type HandoverState } from "../../model/handover.ts";
import { type Msg } from "../../model/messageTypes.ts";
import { mergeGates } from "../../model/permissionGates";
import { comandoDeTerminal } from "../../model/terminalIndent";
import { type Turn } from "../../model/transcript";
import { type ChatEvent, type Session, type TranscriptOrigin } from "../../model/transcript.ts";
import { type PermissionRequest } from "../../screens/Chat.tsx";
import { type TerminalLanzada } from "../sleepSession.ts";
import { createSignal, type Accessor, type Setter } from "solid-js";

type CarriedBase = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type CarryCheck = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type CarryModule = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type ContextSource = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Draft = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type DraftConfiguration = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Hilo = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type HistoryEntry = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type IdsDeTurnos = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Machine = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type MachineWait = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type ProjectPlace = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type SessionRow = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type StartupContext = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type TranscriptMetadata = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Transition = any; // pendiente: el tipo llega de otra feature por el shell (R3)

/** Lo que el bloque usaba del cuerpo de App. */
export type SendGatesDeps = { importCarry: () => Promise<CarryModule>; abrirConComando: (command: string) => Promise<boolean>; agent: Accessor<string>; archivos: () => string[]; attachmentsFor: (paths: string[], options: { headers: Record<string, string>; } | undefined, proyecto: string) => Promise<string[]>; borrador: () => Draft; busy: () => boolean; claveAbierta: () => string; cola: Accessor<Encolado[]>; configDeLaSesion: (id: string) => { provider: string; model: string | null; effort: string | null; }; deLaTarea: (id: string | null | undefined) => { headers: { "x-terminus-machine": string; }; } | undefined; drafts: { peek: (key: string) => Draft; current: () => Draft; sourceIds: Accessor<string[]>; excludedSourceIds: Accessor<string[]>; attached: Accessor<string[]>; pendingMaterial: Accessor<Source[]>; context: Accessor<Source[]>; input: () => string; files: () => string[]; changeText: (value: string, inputType?: string, change?: TextEdit) => void; history: (redo: boolean) => boolean; addFiles: (paths: string[]) => Promise<void>; addSource: (id: string) => void; removeSource: (id: string) => void; recipient: (name: string, label: string, trigger: Trigger) => void; reference: (target: MentionTarget, label: string, trigger: Trigger) => void; replaceFiles: (files: string[]) => { [x: string]: Draft; }; replaceAttached: (ids: string[]) => string[]; acceptSources: (ids: string[]) => string[]; configure: (configuration: DraftConfiguration, key?: string) => { [x: string]: Draft; }; handover: (provider: HandoverPending | null | undefined, key?: string) => { [x: string]: Draft; }; invalidateProvider: (key: string, provider: string) => { [x: string]: Draft | { input: string; task_mentions?: TaskMention[]; recipients?: Recipient[]; mentionHistory?: HistoryEntry[]; mentionFuture?: HistoryEntry[]; sourceIds: string[]; excludedSourceIds: string[]; archivos: string[]; configuration?: DraftConfiguration; }; }; restoreSession: (key: string, excluded: string[]) => { [x: string]: Draft; }; retryText: (text: string, mentions?: TaskMention[]) => { [x: string]: Draft; }; takeFiles: (key: string, files: string[]) => { [x: string]: Draft; }; restoreFailed: (key: string, message: HistoryEntry, files: string[]) => { [x: string]: Draft; }; sentSources: (key: string, ids: string[]) => { [x: string]: Draft; }; continueFrom: (prompt: string, path: string, sources: string[], excluded: string[]) => { [x: string]: Draft; }; promote: (from: string, to: string) => { [x: string]: Draft; }; drop: (key: string) => Record<string, Draft>; reset: () => void; dispose: () => void; }; effortDelTurno: () => string | null; ejecutarComando: (session: string, lanzado: TerminalLanzada, command: string, queueId: string | null) => Promise<unknown>; encolar: (text: string, attachments: string[], task_mentions?: TaskMention[], recipients?: Recipient[]) => `${string}-${string}-${string}-${string}-${string}`; encolarYSoltar: (text: string, attachments: string[], task_mentions?: TaskMention[], recipients?: Recipient[]) => void; engineCanDispatch: (session: string | null | undefined) => boolean; enviar: (m: Omit<Encolado, "id">, respuestas?: { manda: RespuestaEnviada[]; pinta: Respuesta[]; }, destination?: { project: string; session: string; }, llevar?: (claveBorrador: string) => Promise<CarriedBase | null>, deLaCola?: string) => Promise<boolean>; escritorio: Accessor<string | null>; filaDe: (id: string) => SessionRow | undefined; gateSeq: number; input: () => string; leerTarea: (project: string, id: string, before?: number | null | undefined) => Promise<Session>; machineName: (id: string, local?: boolean) => string; machines: Accessor<Machine[]>; model: Accessor<string>; modo: Accessor<string>; msgs: Accessor<Msg[]>; nuevaSesion: (enProyecto?: string) => void; opcionesDeLaTarea: (id: string | null | undefined, workspace: string | null | undefined) => { headers: { [k: string]: string; }; }; pendientesDe: any; preguntarAlMargen: (question: string) => Promise<void>; project: Accessor<string>; projectList: Accessor<Project[]>; queueBusy: () => boolean; runOn: (workspace: string | null, project?: ProjectPlace) => string | null; sessionId: Accessor<string | null>; setArchivos: any; setAviso: Setter<{ texto: string; boton?: string; ir?: () => void; } | null>; setError: Setter<string | null>; setInput: (value: string, inputType?: string, change?: TextEdit) => void; setPermissions: Setter<PermissionRequest[]>; setRunOn: (workspace: string | null, id: string | null) => void; sideCommand: Accessor<string | null>; soltarPreguntas: (session: string, turno?: string) => ReadonlyMap<string, PreguntasAMedias>; threads: { read: (project: string, id: string, before?: number | null | undefined) => Promise<Session>; acceptSession: (id: string, session: Session, clear: boolean, generation: number, latest?: boolean | undefined) => boolean; activities: (id: string, visible: readonly Msg[]) => ObservedTurnActivity<Msg>[]; beginActivity: (id: string, startedAt: number | null, startConfirmed?: boolean) => void; finishActivity: (id: string, workspace?: string | null) => void; rows: Accessor<Record<string, Hilo>>; current: Accessor<Hilo>; messages: Accessor<Msg[]>; loading: Accessor<string | null>; origins: Accessor<Readonly<Record<string, TranscriptOrigin | null>>>; offline: Accessor<Readonly<Record<string, string>>>; machineWaits: Accessor<Readonly<Record<string, MachineWait>>>; handovers: Accessor<Readonly<Record<string, HandoverState>>>; olderAvailable: Accessor<Readonly<Record<string, boolean>>>; recentAvailable: Accessor<Readonly<Record<string, boolean>>>; olderStatus: Accessor<Readonly<Record<string, OlderState>>>; recentTail: Accessor<Readonly<Record<string, Msg[]>>>; appendLive: (session: string, messages: Msg[], workspace?: string | null) => void; appendPersisted: (session: string, messages: Msg[]) => void; appendOptimistic: (session: string, messages: Msg[]) => void; acknowledgeOptimistic: (session: string, messages: Msg[]) => void; commitUniqueTurn: (session: string, message: Msg) => void; replaceTurn: (session: string, message: Msg) => void; reviseOptimistic: (session: string, target: Msg, patch: Pick<Msg, "respuestas" | "author">) => void; rejectOptimistic: (session: string, messages: Msg[]) => void; question: (session: string, fields: Pick<Msg, "turno" | "preguntas" | "questionRequestId" | "agent">, workspace?: string | null) => void; replay: (session: string, workspace?: string | null, replayId?: string) => void; finishSteps: (session: string) => void; event: (payload: ChatEvent, metadata: TranscriptMetadata) => void; older: (project: string, id: string) => Promise<(() => void) | null>; latest: (id: string) => Promise<void>; replaceHistory: (session: string, leida: Msg[], vaciarVivo: boolean, antepuesta?: boolean, guardados?: IdsDeTurnos, cola?: IdsDeTurnos, readRevision?: number) => void; saveWorkspace: (previous: string | null) => void; activateWorkspace: (workspace: string | null) => void; resetService: () => void; adoptDraft: (id: string) => void; dropSaved: (workspace: string, id: string) => void; flush: () => void; markMachineWait: (id: string, wait: MachineWait | null) => void; markAwake: (id: string) => void; startLoading: (id: string) => void; finishLoading: (id: string) => void; reading: (id: string, active: boolean) => void; drop: (session: string) => void; dispose: () => void; }; vivas: Accessor<string[]>; workspaceActivo: Accessor<string | null>; workspaceContext: { active: Accessor<string | null>; mode: Accessor<string | null>; root: Accessor<string | null>; confirmed: Accessor<boolean>; generation: () => number; beginTransition: (startup: StartupContext) => Transition; activate: (token: Transition) => boolean; beginMaterial: () => Readonly<{ generation: number; material: number; }>; current: (token: Readonly<{ generation: number; material: number; }>) => boolean; currentMaterial: (token: Readonly<{ generation: number; material: number; }>) => boolean; confirmContext: (token: Readonly<{ generation: number; material: number; }>, candidate: string | null, listed: ContextSource[]) => "obsolete" | "unavailable" | "accepted"; modeChanged: (workspace: string | null, value: string | null, requestedGeneration?: number) => void; dispose: () => void; } };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 5209–5507, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createSendGates(deps: SendGatesDeps) {
  const { abrirConComando, agent, archivos, attachmentsFor, borrador, busy, claveAbierta, cola, configDeLaSesion, deLaTarea, drafts, effortDelTurno, ejecutarComando, engineCanDispatch, enviar, escritorio, filaDe, input, leerTarea, machineName, machines, model, modo, msgs, nuevaSesion, opcionesDeLaTarea, pendientesDe, preguntarAlMargen, project, projectList, queueBusy, runOn, sessionId, setArchivos, setAviso, setError, setInput, setPermissions, setRunOn, sideCommand, soltarPreguntas, threads, vivas, workspaceActivo, workspaceContext } = deps;
  const encolar: SendGatesDeps["encolar"] = (...a: Parameters<SendGatesDeps["encolar"]>) => deps.encolar(...a);
  const encolarYSoltar: SendGatesDeps["encolarYSoltar"] = (...a: Parameters<SendGatesDeps["encolarYSoltar"]>) => deps.encolarYSoltar(...a);
  /**
   * El `request_id` de la pregunta viva de este turno, si alguien espera.
   * Sin él queda el camino de archivo.
   */
  async function atadura(
    session: string | null,
    turno: string,
  ): Promise<string | undefined> {
    if (!session) return undefined;
    const pendientes = await pendientesDe(session);
    return pendientes?.questions.find((q: any) => q.turn === turno)?.request_id;
  }

  /**
   * Repinta los gates que esta ventana no vio: el evento del permiso viajó
   * mientras no había nadie escuchando, y sin gate el turno espera una
   * decisión que nadie puede tomar.
   */
  const permissionReads = new Map<string, number>();
  async function reponerGates(session: string, workspace = workspaceActivo()) {
    const generation = workspaceContext.generation();
    const reading = (permissionReads.get(session) ?? 0) + 1;
    permissionReads.set(session, reading);
    const desde = deps.gateSeq;
    const pendientes = await pendientesDe(session, workspace);
    if (!pendientes || generation !== workspaceContext.generation() || reading !== permissionReads.get(session)) return;
    setPermissions((ps) => mergeGates(ps, session, workspace, pendientes.permissions, desde));
  }

  /**
   * Cierra una pregunta sin contestarla. Al agente se le dice que no hay
   * respuesta: mientras espere, no vuelve la caja de escribir.
   */
  async function cancelarPregunta(turno: string): Promise<void> {
    const sid = sessionId();
    if (!sid) throw new Error(t("shell.answer.no_session"));
    try {
      const guardado = await invoke<Turn>("cancel_question", {
        project: project(),
        session: sid,
        turn: turno,
      }, deLaTarea(sid));
      soltarPreguntas(sid, turno);
      threads.appendPersisted(sid, [{
                  role: "user",
                  text: guardado.text,
                  turno: guardado.id ?? undefined,
                  respuestas: guardado.answers ?? undefined,
                  author: guardado.author ?? undefined,
                }]);
    } catch (error) {
      threads.appendLive(sid, [{ role: "system", ...mensajeDeFallo(error), meta: "fallo" }]);
      throw error;
    }
  }

  /**
   * Contesta lo que el agente preguntó. Es un turno como cualquier
   * otro —gasta tokens, se registra, reanuda la sesión— y sale por el
   * mismo camino. Lo distingue que va atado a la pregunta que lo
   * provocó, y esa atadura es el entregable.
   */
  async function responder(
    turno: string,
    manda: RespuestaEnviada[],
  ): Promise<boolean> {
    const questionSession = sessionId();
    const questionWorkspace = workspaceActivo();
    const mensaje = msgs().find((m) => m.turno === turno);
    if (!mensaje)
      throw new Error(t("shell.answer.question_missing"));
    // Las preguntas por archivo llegan después de que el proceso cerró, pero
    // `done` puede tardar un instante más en apagar `busy`. No se debe exigir
    // `questionRequestId`: ese campo solo existe para el canal vivo de Claude.
    if (busy() && !(mensaje.preguntas && mensaje.preguntas.length > 0))
      throw new Error(t("shell.answer.turn_busy"));
    const preguntas = mensaje?.preguntas ?? [];
    // Sin atadura en esta ventana, la tiene Rust: su registro dura lo que el
    // proceso.
    const viva = mensaje?.questionRequestId
      ? mensaje.questionRequestId
      : await atadura(questionSession, turno);
    if (viva) {
      const sid = questionSession;
      if (!sid) throw new Error(t("shell.answer.no_session"));
      try {
        const pending = (await pendientesDe(sid, questionWorkspace))?.questions.find((q: any) => (q.request_id === viva || q.id === viva) && q.turn === turno);
        if (!pending) throw new Error(t("shell.answer.question_missing"));
        const guardado = await invoke<Turn>("answer_question", {
          session: sid,
          requestId: pending.id ?? pending.request_id,
          revision: pending.revision,
          respuestas: manda,
        }, opcionesDeLaTarea(questionSession, questionWorkspace));
        soltarPreguntas(sid, turno);
        threads.appendPersisted(sid, [{
                      role: "user",
                      text: guardado.text,
                      turno: guardado.id ?? undefined,
                      respuestas: guardado.answers ?? undefined,
                      author: guardado.author ?? undefined,
                    }]);
        return true;
      } catch (error) {
        threads.appendLive(sid, [{ role: "system", ...mensajeDeFallo(error), meta: "fallo" }]);
        throw error;
      }
    }
    const cuando = Date.now();
    const pinta: Respuesta[] = manda.flatMap((r) => {
      const p = preguntas.find((x) => x.id === r.question);
      if (!p) return [];
      const partes = [
        ...r.chosen.map(
          (v: string) => p.options.find((o) => o.value === v)?.label ?? v,
        ),
        ...(r.free_text ? [r.free_text] : []),
      ];
      return [
        {
          turn: turno,
          question: r.question,
          question_text: p.question,
          chosen: r.chosen,
          text: partes.join(" · "),
          // Dicha por una persona, nunca inferida.
          source: "persona",
          when: cuando,
        },
      ];
    });
    if (pinta.length === 0)
      throw new Error(t("shell.answer.options_missing"));
    const sesion = sessionId();
    const salio = await enviar(
      {
        text: "",
        provider: mensaje.agent ?? agent(),
        model: model() || null,
        effort: effortDelTurno(),
        permission_mode: modo() || null,
        attachments: [],
      },
      { manda, pinta },
    );
    if (salio && sesion) soltarPreguntas(sesion, turno);
    return salio;
  }

  const [carryModule, setCarryModule] = createSignal<CarryModule | null>(null);
  const [hojaDeLlevar, setHojaDeLlevar] = createSignal<{ key: string; check: CarryCheck; busy?: boolean } | null>(null);
  const maquinaDeLaVentana = () => capabilities().windowMachine?.()?.id ?? machines().find((m) => m.active)?.id ?? "local";
  async function moduloDeLlevar(): Promise<CarryModule> {
    const mod = carryModule() ?? (await deps.importCarry());
    setCarryModule(() => mod);
    return mod;
  }
  /** Lo que se eligió hacer después de traer, por la clave de la copia. */
  const despuesDeTraer = new Map<string, "continue" | "branch">();
  const esRemota = (id: string) => {
    const machine = filaDe(id)?.machine;
    return !!machine && machine !== maquinaDeLaVentana();
  };

  /** «Traer a esta Mac»: despierta la otra máquina, pregunta qué hay en el worktree de la tarea y abre la hoja. */
  async function abrirTraer(proyecto: string | undefined, id: string) {
    const fila = filaDe(id);
    const workspace = workspaceActivo();
    const carpeta = projectList().find((p) => p.id === proyecto);
    if (!fila?.machine || !workspace || !carpeta) return;
    const mod = await moduloDeLlevar();
    try {
      const check = await mod.checkBring({ workspace, project: carpeta, source: fila.machine, target: maquinaDeLaVentana(), task: { id, title: fila.title } });
      setHojaDeLlevar({ key: `bring:${id}`, check, busy: vivas().includes(id) });
    } catch (e) {
      setError(prosaDe(e));
    }
  }

  /**
   * «Llevar a otra máquina…» desde el menú de la carpeta: abre su tarea nueva en
   * la máquina elegida (o la primera encendida) y la hoja, aunque no haya nada
   * sin subir. La copia corre al enviar el primer mensaje.
   */
  async function abrirLlevarCarpeta(id: string, machine?: string) {
    const workspace = workspaceActivo();
    const carpeta = projectList().find((p) => p.id === id);
    if (!workspace || !carpeta) return;
    const mod = await moduloDeLlevar();
    const source = machine || mod.sourceOf(carpeta, maquinaDeLaVentana());
    const elegida = runOn(workspace, carpeta);
    const target = elegida && elegida !== source ? elegida : machines().find((m) => m.id !== source && m.on && m.hosts !== false)?.id;
    if (!source || !target) {
      setError(t("shell.machines.carry_none"));
      return;
    }
    nuevaSesion(id);
    setRunOn(workspace, target);
    const check = await mod.checkCarry({ workspace, project: carpeta, source, target }, true).catch(() => null);
    if (check) setHojaDeLlevar({ key: claveAbierta(), check });
    else setError(t("work.failure.export", { machine: machineName(source) }));
  }

  /**
   * Corre la copia de vuelta. Con «Seguir aquí» abre una tarea nueva en esta
   * máquina sobre lo traído, con un resumen corto como primer contexto (D4).
   */
  async function traer(key: string) {
    const mod = carryModule();
    const plan = mod?.carries()[key];
    const task = plan?.check.task;
    if (!mod || !plan || !task) return;
    const result = await mod.runCarry(key);
    if (!result) return;
    const branch = result.imported?.branch ?? plan.job.branchAs ?? null;
    if (despuesDeTraer.get(key) === "branch") {
      despuesDeTraer.delete(key);
      setAviso({ texto: t("work.bring.done", { here: machineName(plan.check.target), branch: branch ?? "" }) });
      return;
    }
    despuesDeTraer.delete(key);
    const leida = await leerTarea(plan.check.project.id, task.id).catch(() => null);
    const ultimo = leida?.turns.filter((turn) => turn.role === "agent" && turn.text.trim()).at(-1)?.text ?? null;
    nuevaSesion(plan.check.project.id);
    setRunOn(workspaceActivo(), plan.check.target);
    const draft = claveAbierta();
    mod.planCarry(draft, plan.check, plan.job, plan.state, result);
    setInput(mod.bringSummary(plan.check, ultimo, branch));
  }

  /** Manda si no hay turno corriendo; encola si lo hay. */
  async function mandar(attachments: string[]): Promise<boolean> {
    // Las dos listas se recortan con el mismo gesto: recortar solo las
    // menciones dejaría las etiquetas de destinatario apuntando al texto de
    // antes del `trim`, y el backend rechaza el tramo que no case.
    const message = trimDraft({ text: input(), task_mentions: borrador().task_mentions, recipients: borrador().recipients });
    const prompt = message.text;
    // Sin proyecto también se manda: elegirlo era un peaje para
    // escribir la primera línea. Nombrar el trabajo se decide cuando
    // hay algo que nombrar: la tarea nace suelta y se mueve después.
    if (!prompt && attachments.length === 0) return false;
    // No es un turno: no toca la cola ni el turno vivo, y los adjuntos se quedan.
    const pregunta = preguntaAlMargen(prompt, sideCommand());
    if (pregunta !== null) {
      setInput("");
      void preguntarAlMargen(pregunta);
      return true;
    }
    if (prompt.startsWith("!")) {
      const comando = comandoDeTerminal(prompt);
      if (!comando.trim()) return false;
      setInput("");
      // Con el agente trabajando espera su turno, como en Claude Code. Los
      // adjuntos se quedan en el borrador: un comando no los lleva.
      if (queueBusy() || cola().length > 0) {
        encolar(`!${comando}`, []);
        return true;
      }
      const id = sessionId();
      if (!id) {
        const corrio = await abrirConComando(comando);
        if (!corrio && !input()) setInput(prompt);
        return corrio;
      }
      // Un `!` corre y contesta con lo que la sesión ya tiene: el traspaso
      // confirmado en el borrador espera a su propio turno y no se gasta aquí.
      const sesion = configDeLaSesion(id);
      const lanzado = { project: project(), provider: sesion.provider, model: sesion.model, effort: sesion.effort, permission_mode: modo() || null };
      return (await ejecutarComando(id, lanzado, comando, null)) === null;
    }
    if (queueBusy() || cola().length > 0) {
      // El motor manda lo encolado tal como está guardado: con sus adjuntos ya en su máquina.
      const abierta = sessionId(), listos = engineCanDispatch(abierta) ? await attachmentsFor(attachments, deLaTarea(abierta), project()).catch((e) => void setError(prosaDe(e))) : attachments;
      if (!listos || sessionId() !== abierta) return false;
      encolarYSoltar(prompt, listos, message.task_mentions, message.recipients);
      setInput("");
      // Encolado se los lleva puestos: salen del borrador ya.
      setArchivos(archivos().filter((a) => !attachments.includes(a)));
      return true;
    }
    const draftKey = claveAbierta();
    const generation = workspaceContext.generation();
    if (hojaDeLlevar()?.key === draftKey) return false;
    const llevar = !sessionId() && !!carryModule()?.carries()[draftKey];
    setInput("");
    // Salen con el texto: el globo los pinta antes de que `send_message` vuelva.
    drafts.takeFiles(draftKey, attachments);
    const sent = await enviar({
      text: prompt,
      task_mentions: message.task_mentions,
      recipients: message.recipients,
      provider: agent(),
      model: model() || null,
      effort: effortDelTurno(),
      permission_mode: modo() || null,
      attachments,
      space: escritorio(),
    }, undefined, undefined, llevar ? (clave) => (carryModule() as CarryModule).runCarry(clave) : undefined);
    if (!sent && generation === workspaceContext.generation()) {
      drafts.restoreFailed(draftKey, message, attachments);
    }
    return sent;
  }
  return { abrirLlevarCarpeta, abrirTraer, cancelarPregunta, carryModule, despuesDeTraer, esRemota, hojaDeLlevar, mandar, maquinaDeLaVentana, permissionReads, reponerGates, responder, setHojaDeLlevar, traer };
}
