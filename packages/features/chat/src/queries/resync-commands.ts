type Pendientes = any;
type Perm = any;
import { type ObservedTurnActivity } from "../../../../../apps/desktop/src/lib/activityObservation.ts";
import { pasoDe } from "../../../../../apps/desktop/src/lib/steps";
import { type Superficie } from "../../../../../apps/desktop/src/lib/surfaces.ts";
import { type TaskMention } from "../../../../../apps/desktop/src/lib/taskMentions.ts";
import { type OlderState } from "../model/history.ts";
import { invoke } from "../../../../engine-client/src/client.ts";
import { prosaDe } from "../../../../ui/src/Failure";
import { type Encolado } from "../components/MessageQueue.tsx";
import { type ComandoEnVivo } from "../components/ShellCard";
import { type HandoverState } from "../model/handover.ts";
import { contestaALaTerminal } from "../model/queue";
import { type Turn } from "../model/transcript";
import { type ChatEvent, type Session, type TranscriptOrigin } from "../model/transcript.ts";
import { type Msg, type PermissionRequest } from "../screens/Chat";
import { type TerminalLanzada } from "./sleepSession.ts";
import { batch, createSignal, type Accessor, type Setter } from "solid-js";

type Hilo = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type IdsDeTurnos = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type MachineWait = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type Saved = any; // pendiente: el tipo llega de otra feature por el shell (R3)
type TranscriptMetadata = any; // pendiente: el tipo llega de otra feature por el shell (R3)

/** Lo que el bloque usaba del cuerpo de App. */
export type ResyncCommandsDeps = { adoptarComando: (runId: string, session: string) => boolean; advanceTurn: (id: string) => number; cola: Accessor<Encolado[]>; comandosDeLaCola: Map<string, string>; contestarALaTerminal: (session: string, lanzado: TerminalLanzada) => Promise<void>; detenidos: Set<string>; engineCanDispatch: (session: string | null | undefined) => boolean; finishedTurns: Map<string, boolean | null | undefined>; lanzados: Map<string, TerminalLanzada>; marcarViva: (id: string, desde?: number, startConfirmed?: boolean) => void; opcionesDeLaTarea: (id: string | null | undefined, workspace: string | null | undefined) => { headers: { [k: string]: string; }; }; pendientesDe: (session: string, workspace?: string | null) => Promise<Pendientes>; pendingStarts: Map<string, symbol>; reanudarCola: (id: string) => Promise<void>; reponerGates: (session: string, workspace?: string | null) => Promise<void>; retenidaPorElMotor: () => boolean; sessionId: Accessor<string | null>; setCarpetasDeTerminal: Setter<Record<string, string>>; setPermissionError: Setter<string | null>; setPermissions: Setter<PermissionRequest[]>; setRespondiendoPermiso: Setter<boolean>; setSettlingTurns: Setter<string[]>; setTerminales: Setter<Record<string, ComandoEnVivo>>; settleTurn: (session: string, ok?: boolean | null, unsaved?: boolean) => Promise<void>; superficies: Accessor<Superficie[] | null>; taskQueues: { items: Accessor<Encolado[]>; owner: Accessor<string | null>; editing: Accessor<boolean>; saved: (session: string) => Readonly<Saved> | undefined; openSession: (session: string, project: string, isCurrent?: () => boolean, fromEngine?: boolean) => Promise<void>; detach: () => void; remove: (id: string, session?: string | null) => void; persist: (session: string, project: string, queued: Encolado[]) => Promise<unknown>; adopt: (session: string) => string; editMode: (value: boolean) => boolean; enqueue: (message: Encolado, front?: boolean) => Encolado[]; edit: (id: string, text: string, mentions?: TaskMention[]) => Encolado[]; prioritize: (id: string) => Encolado[]; workspaceChanged: () => void; dispose: () => void; }; terminales: Accessor<Record<string, ComandoEnVivo>>; threads: { read: (project: string, id: string, before?: number | null | undefined) => Promise<Session>; acceptSession: (id: string, session: Session, clear: boolean, generation: number, latest?: boolean | undefined) => boolean; activities: (id: string, visible: readonly Msg[]) => ObservedTurnActivity<Msg>[]; beginActivity: (id: string, startedAt: number | null, startConfirmed?: boolean) => void; finishActivity: (id: string, workspace?: string | null) => void; rows: Accessor<Record<string, Hilo>>; current: Accessor<Hilo>; messages: Accessor<Msg[]>; loading: Accessor<string | null>; origins: Accessor<Readonly<Record<string, TranscriptOrigin | null>>>; offline: Accessor<Readonly<Record<string, string>>>; machineWaits: Accessor<Readonly<Record<string, MachineWait>>>; handovers: Accessor<Readonly<Record<string, HandoverState>>>; olderAvailable: Accessor<Readonly<Record<string, boolean>>>; recentAvailable: Accessor<Readonly<Record<string, boolean>>>; olderStatus: Accessor<Readonly<Record<string, OlderState>>>; recentTail: Accessor<Readonly<Record<string, Msg[]>>>; appendLive: (session: string, messages: Msg[], workspace?: string | null) => void; appendPersisted: (session: string, messages: Msg[]) => void; appendOptimistic: (session: string, messages: Msg[]) => void; acknowledgeOptimistic: (session: string, messages: Msg[]) => void; commitUniqueTurn: (session: string, message: Msg) => void; replaceTurn: (session: string, message: Msg) => void; reviseOptimistic: (session: string, target: Msg, patch: Pick<Msg, "respuestas" | "author">) => void; rejectOptimistic: (session: string, messages: Msg[]) => void; question: (session: string, fields: Pick<Msg, "turno" | "preguntas" | "questionRequestId" | "agent">, workspace?: string | null) => void; replay: (session: string, workspace?: string | null, replayId?: string) => void; finishSteps: (session: string) => void; event: (payload: ChatEvent, metadata: TranscriptMetadata) => void; older: (project: string, id: string) => Promise<(() => void) | null>; latest: (id: string) => Promise<void>; replaceHistory: (session: string, leida: Msg[], vaciarVivo: boolean, antepuesta?: boolean, guardados?: IdsDeTurnos, cola?: IdsDeTurnos, readRevision?: number) => void; saveWorkspace: (previous: string | null) => void; activateWorkspace: (workspace: string | null) => void; resetService: () => void; adoptDraft: (id: string) => void; dropSaved: (workspace: string, id: string) => void; flush: () => void; markMachineWait: (id: string, wait: MachineWait | null) => void; markAwake: (id: string) => void; startLoading: (id: string) => void; finishLoading: (id: string) => void; reading: (id: string, active: boolean) => void; drop: (session: string) => void; dispose: () => void; }; workspaceActivo: Accessor<string | null> };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 2812–2959, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createResyncCommands(deps: ResyncCommandsDeps) {
  const { advanceTurn, cola, comandosDeLaCola, detenidos, engineCanDispatch, finishedTurns, lanzados, marcarViva, opcionesDeLaTarea, pendingStarts, retenidaPorElMotor, sessionId, setCarpetasDeTerminal, setPermissionError, setPermissions, setRespondiendoPermiso, setSettlingTurns, setTerminales, settleTurn, superficies, taskQueues, terminales, threads, workspaceActivo } = deps;
  const adoptarComando: ResyncCommandsDeps["adoptarComando"] = (...a: Parameters<ResyncCommandsDeps["adoptarComando"]>) => deps.adoptarComando(...a);
  const contestarALaTerminal: ResyncCommandsDeps["contestarALaTerminal"] = (...a: Parameters<ResyncCommandsDeps["contestarALaTerminal"]>) => deps.contestarALaTerminal(...a);
  const pendientesDe: ResyncCommandsDeps["pendientesDe"] = (...a) => deps.pendientesDe(...a);
  const reanudarCola: ResyncCommandsDeps["reanudarCola"] = (...a: Parameters<ResyncCommandsDeps["reanudarCola"]>) => deps.reanudarCola(...a);
  const reponerGates: ResyncCommandsDeps["reponerGates"] = (...a: Parameters<ResyncCommandsDeps["reponerGates"]>) => deps.reponerGates(...a);
  async function responderPermiso(p: PermissionRequest, allow: boolean) {
    setRespondiendoPermiso(true);
    setPermissionError(null);
    const workspace = p.workspace ?? workspaceActivo();
    try {
      const current = p.revision === undefined
        ? (await pendientesDe(p.session, workspace))?.permissions.find((x: Perm) => (x.request_id === p.requestId || x.id === p.requestId))
        : { revision: p.revision, id: p.durableId };
      // Un motor anterior a los pendientes durables los lista sin `id` ni
      // `revision` y contesta por `request_id`; exigir la revisión dejaba el
      // gate sin forma de aprobarse. El motor nuevo acepta la misma forma.
      const guardado = await invoke<Turn>("respond_permission", {
        session: p.session,
        requestId: current?.id ?? p.requestId,
        revision: current?.revision,
        allow,
      }, opcionesDeLaTarea(p.session, workspace));
      // El `permission_resolved` de esta misma decisión puede haber llegado
      // antes que la respuesta: ese turno ya está pintado.
      const fila: Msg = {
        role: "user",
        text: guardado.text,
        turno: guardado.id ?? undefined,
        permission: guardado.permission ?? undefined,
        author: guardado.author ?? undefined,
      };
      threads.replaceTurn(p.session, fila);
      setPermissions((ps) => ps.filter((x) => x.session !== p.session || x.requestId !== p.requestId));
    } catch (e) {
      const { sinRespuesta } = await import("../model/permissionRecovery");
      const cerrada = sinRespuesta(p, await pendientesDe(p.session, workspace), e);
      if (cerrada) {
        setPermissions(ps => ps.filter(x => x.session !== p.session || x.requestId !== p.requestId));
        if (cerrada !== "respondida") threads.appendPersisted(p.session, [cerrada]);
        return;
      }
      await reponerGates(p.session, workspace);
      setPermissionError(prosaDe(e));
    } finally {
      setRespondiendoPermiso(false);
    }
  }

  function ponerTerminal(session: string, comando: ComandoEnVivo) {
    setTerminales((ts) => ({ ...ts, [session]: comando }));
  }

  function soltarTerminal(session: string) {
    setTerminales((ts) => {
      if (!(session in ts)) return ts;
      const { [session]: _, ...resto } = ts;
      return resto;
    });
  }

  function quitarDeLaCola(session: string, id: string) {
    taskQueues.remove(id, session);
  }

  // Lo que se pinta de un `!` en marcha. Más atrás no se lee y volver a pintarlo
  // entero en cada trozo es lo que cuesta.
  const SALIDA_EN_VIVO = 64_000;

  function alComando(session: string, kind: string, ev: { id: string; text: string; meta?: string | null; target?: string | null }) {
    if (kind === "shell_started") {
      adoptarComando(ev.id, session);
      const previo = terminales()[session];
      batch(() => {
        pendingStarts.delete(session);
        advanceTurn(session);
        setSettlingTurns((ids) => ids.filter((id) => id !== session));
        finishedTurns.delete(session);
        marcarViva(session);
        // El diario repite el arranque y los trozos al recargar: se empieza de cero.
        ponerTerminal(session, {
          id: ev.id,
          command: ev.text,
          cwd: ev.target ?? null,
          output: "",
          truncated: false,
          desde: previo?.id === ev.id ? previo.desde : Date.now(),
        });
        const carpeta = ev.target;
        if (carpeta) setCarpetasDeTerminal((cs) => ({ ...cs, [session]: carpeta }));
        const enCola = comandosDeLaCola.get(session);
        if (enCola) quitarDeLaCola(session, enCola);
      });
      return;
    }
    if (kind === "shell_output") {
      setTerminales((ts) => {
        const vivo = ts[session];
        if (!vivo || vivo.id !== ev.id) return ts;
        const output = vivo.output + ev.text;
        const sobra = output.length - SALIDA_EN_VIVO;
        return {
          ...ts,
          [session]: {
            ...vivo,
            output: sobra > 0 ? output.slice(sobra) : output,
            truncated: vivo.truncated || sobra > 0 || ev.meta === "truncated",
          },
        };
      });
      return;
    }
    const vivo = terminales()[session];
    const lanzado = lanzados.get(session);
    lanzados.delete(session);
    comandosDeLaCola.delete(session);
    const detenido = detenidos.delete(session);
    const codigo = ev.meta ? Number(ev.meta) : null;
    const restantes = session === sessionId() ? cola() : taskQueues.saved(session)?.items ?? [];
    // Sin superficie utilizable nadie contesta: la salida viaja con el primer mensaje.
    const hayQuienConteste = (superficies() ?? []).some((s) => s.usable && s.provider === lanzado?.provider);
    const contestar = lanzado && codigo !== null && contestaALaTerminal(restantes, detenido, hayQuienConteste) ? lanzado : null;
    // Hasta que se relea el disco: sin esto la tarjeta desaparece un instante.
    if (vivo && codigo !== null) threads.appendLive(session, [mensajeDeTerminal(vivo, codigo)]);
    if (contestar) setPorContestar((ss) => [...ss, session]);
    void settleTurn(session, true).then(() => {
      if (contestar) void contestarALaTerminal(session, contestar);
      // El motor no lanza un `!`: lo que esperaba detrás se lo devuelve la ventana.
      else if (!detenido && session === sessionId() && cola().length && !retenidaPorElMotor() && engineCanDispatch(session)) void reanudarCola(session);
    });
  }

  function mensajeDeTerminal(vivo: ComandoEnVivo, codigo: number): Msg {
    const shell = {
      cwd: vivo.cwd ?? "",
      output: vivo.output,
      exit_code: codigo,
      truncated: vivo.truncated,
      duration_ms: Date.now() - vivo.desde,
    };
    return {
      role: "system",
      text: vivo.command,
      meta: "usó",
      shell,
      paso: pasoDe("command_execution", vivo.command, {
        ok: codigo === 0,
        detalle: { kind: "output", text: shell.output, exit_code: codigo, truncated: shell.truncated, cwd: shell.cwd },
      }),
    };
  }

  // Sin esta marca, entre releer el disco y abrir la respuesta la tarjeta dice que nadie contesta.
  const [porContestar, setPorContestar] = createSignal<readonly string[]>([]);
  return { alComando, ponerTerminal, porContestar, quitarDeLaCola, responderPermiso, setPorContestar, soltarTerminal };
}
