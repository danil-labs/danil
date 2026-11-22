
import { pasoDe } from "../../../../../apps/desktop/src/lib/steps";
import { type Superficie } from "../../../../../apps/desktop/src/lib/surfaces.ts";
import { invoke } from "../../../../engine-client/src/client.ts";
import { prosaDe } from "../../../../ui/src/Failure";
import { type ComandoEnVivo } from "../components/ShellCard";
import { contestaALaTerminal } from "../../../../ui/src/lib/queue.ts";
import { type Turn } from "../model/transcript";
import { type Msg, type PermissionRequest } from "../screens/Chat";
import { batch, createSignal, type Accessor } from "solid-js";
import type { createThreadsStore } from "./types.js";
import type { createAttachmentsMount } from "./attachments-mount.ts";
import type { createSendGates } from "./send-gates.ts";
import type { createSendNow } from "./send-now.ts";
import type { createSend } from "./send.ts";
import type { createShellCommand } from "./shell-command.ts";
import type { createThreadStream } from "./thread-stream.ts";


/** Lo que el bloque usaba del cuerpo de App. */
export type ResyncCommandsDeps = { adoptarComando: ReturnType<typeof createShellCommand>["adoptarComando"]; advanceTurn: ReturnType<typeof createThreadStream>["advanceTurn"];
  cola: ReturnType<typeof createThreadStream>["cola"]; comandosDeLaCola: ReturnType<typeof createThreadStream>["comandosDeLaCola"];
  contestarALaTerminal: ReturnType<typeof createShellCommand>["contestarALaTerminal"]; detenidos: ReturnType<typeof createThreadStream>["detenidos"];
  engineCanDispatch: ReturnType<typeof createThreadStream>["engineCanDispatch"]; finishedTurns: ReturnType<typeof createThreadStream>["finishedTurns"];
  lanzados: ReturnType<typeof createThreadStream>["lanzados"]; marcarViva: ReturnType<typeof createThreadStream>["marcarViva"];
  opcionesDeLaTarea: (id: string | null | undefined, workspace: string | null | undefined) => { headers: { [k: string]: string; }; }; pendientesDe: ReturnType<typeof createSend>["pendientesDe"];
  pendingStarts: ReturnType<typeof createThreadStream>["pendingStarts"]; reanudarCola: ReturnType<typeof createSendNow>["reanudarCola"];
  reponerGates: ReturnType<typeof createSendGates>["reponerGates"]; retenidaPorElMotor: ReturnType<typeof createThreadStream>["retenidaPorElMotor"]; sessionId: Accessor<string | null>;
  setCarpetasDeTerminal: ReturnType<typeof createThreadStream>["setCarpetasDeTerminal"]; setPermissionError: ReturnType<typeof createThreadStream>["setPermissionError"];
  setPermissions: ReturnType<typeof createThreadStream>["setPermissions"]; setRespondiendoPermiso: ReturnType<typeof createThreadStream>["setRespondiendoPermiso"];
  setSettlingTurns: ReturnType<typeof createThreadStream>["setSettlingTurns"]; setTerminales: ReturnType<typeof createThreadStream>["setTerminales"];
  settleTurn: ReturnType<typeof createAttachmentsMount>["settleTurn"]; superficies: Accessor<Superficie[] | null>; taskQueues: ReturnType<typeof createThreadStream>["taskQueues"];
  terminales: ReturnType<typeof createThreadStream>["terminales"]; threads: ReturnType<typeof createThreadsStore>; workspaceActivo: Accessor<string | null>; };

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
        ? (await pendientesDe(p.session, workspace))?.permissions.find((x) => (x.request_id === p.requestId || x.id === p.requestId))
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
