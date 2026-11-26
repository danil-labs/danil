import { type createThreadStream as T_createThreadStream } from "./thread-stream.ts";
import { t } from "../../../../ui/src/lib/i18n";
import { type Encolado } from "../../../../ui/src/lib/queue.ts";
import { type Author } from "../model/messageTypes.ts";
import { type ChatEvent } from "../model/transcript";
import { type PermissionRequest } from "../screens/Chat.tsx";
import type { ComposerPort, ConversationScope, SessionRow, createThreadsStore } from "./types.ts";
import { type EventCallback } from "../../../../host/src/native.ts";
import { type Accessor, type Setter } from "solid-js";


/** Lo que el bloque usaba del cuerpo de App. */
export type ChatEventsDeps = { advanceTurn: (id: string) => number; agent: Accessor<string>; alComando: (session: string, kind: string, ev: { id: string; text: string; meta?: string | null; target?: string | null; }) => void; avisarDeLosArboles: (session: string) => void; carpetasDeTarea: (session: string, project?: string | null) => string[]; cola: Accessor<Encolado[]>; composer: ComposerPort; conversationScope: (id: string, projectId?: string) => ConversationScope; editando: Accessor<boolean>; enFondo: Accessor<string[]>; enviarFiltro: () => void; esDelWorkspaceAbierto: (ws?: string) => boolean; filaDe: (id: string) => SessionRow | undefined; finishedTurns: Map<string, boolean | null | undefined>; firmas: Record<string, Author | null>; gateSeq: number; handoff: ReturnType<typeof T_createThreadStream>["handoff"]; liveThreadKey: (workspace: string, session: string) => string; liveThreads: Set<string>; mandarAhora: (id: string) => Promise<void>; marcarViva: (id: string, desde?: number, startConfirmed?: boolean) => void; modelosEnVivo: Record<string, string | null>; noteMcpSignIn: (session: string, text: string) => void; pendingStarts: Map<string, symbol>; permissionReads: Map<string, number>; permissions: Accessor<PermissionRequest[]>; refreshSessionsOnEvent: (proyectos: string[]) => Promise<void>; reintento: Accessor<{ session: string; intento: number; total: number; clase: string; } | null>; releerCola: (id: string) => void; releerUna: (session: string) => void; reponerGates: (session: string, workspace?: string | null) => Promise<void>; sessionId: Accessor<string | null>; setEnFondo: Setter<string[]>; setPermissionError: Setter<string | null>; setPermissions: Setter<PermissionRequest[]>; setReintento: Setter<{ session: string; intento: number; total: number; clase: string; } | null>; setSettlingTurns: Setter<string[]>; settleTurn: (session: string, ok?: boolean | null, unsaved?: boolean) => Promise<void>; threads: ReturnType<typeof createThreadsStore>; turnClosed: (session: string) => void; turnStarted: ReturnType<typeof T_createThreadStream>["turnStarted"]; workspaceActivo: Accessor<string | null> };

/** Movido tal cual de packages/shell/src/app/App.tsx (líneas 482–706, tarea 2.5). Lo que usaba del cuerpo de App llega por `deps`. */
export function createChatEvents(deps: ChatEventsDeps) {
  const { advanceTurn, agent, avisarDeLosArboles, carpetasDeTarea, cola, composer, conversationScope, editando, enFondo, enviarFiltro, esDelWorkspaceAbierto, filaDe, finishedTurns, firmas, handoff, liveThreadKey, liveThreads, marcarViva, modelosEnVivo, noteMcpSignIn, pendingStarts, permissions, refreshSessionsOnEvent, reintento, releerCola, releerUna, sessionId, setEnFondo, setPermissionError, setPermissions, setReintento, setSettlingTurns, settleTurn, threads, turnClosed, turnStarted, workspaceActivo } = deps;
  const alComando: ChatEventsDeps["alComando"] = (...a: Parameters<ChatEventsDeps["alComando"]>) => deps.alComando(...a);
  const mandarAhora: ChatEventsDeps["mandarAhora"] = (...a: Parameters<ChatEventsDeps["mandarAhora"]>) => deps.mandarAhora(...a);
  const reponerGates: ChatEventsDeps["reponerGates"] = (...a: Parameters<ChatEventsDeps["reponerGates"]>) => deps.reponerGates(...a);
  const alEventoDeChat: EventCallback<ChatEvent> = (e) => {
      const {
        workspace,
        session,
        kind,
        text,
        meta,
        id,
        target,
        ok,
        request_id,
        origin,
      } = e.payload;
      const paintTranscript = () => threads.event(e.payload, {
        provider: filaDe(session)?.provider ?? (session === sessionId() ? agent() : undefined),
        author: firmas[session] ?? firmas[""] ?? null,
        model: modelosEnVivo[session] ?? modelosEnVivo[""] ?? null,
      });
      // Lo que no es texto ni razonamiento se ordena detrás de los fragmentos que llegaron antes.
      if (kind !== "delta" && kind !== "reasoning") threads.flush();
      // Que un turno terminó se apunta ANTES del filtro de abajo: es la mitad
      // que hace posible trabajar en dos tareas. El filtro descarta lo que no
      // se está mirando, correcto para pintar, pero el cierre no es pintura:
      // si se descartara, la tarea que terminó mientras mirabas otra seguiría
      // marcada como viva para siempre, con su caja en «Detener» y sin nada
      // corriendo detrás.
      if (kind === "done") {
        turnClosed(session);
        threads.finishActivity(session, workspace || workspaceActivo(), ok === false ? "failed" : "done");
        setEnFondo((ids) => ids.filter((id) => id !== session));
        if (!esDelWorkspaceAbierto(workspace)) {
          advanceTurn(session);
          if (workspace) {
            liveThreads.delete(liveThreadKey(workspace, session));
            enviarFiltro();
            threads.dropSaved(workspace, session);
          }
          setPermissions((items) => items.filter((permission) => permission.session !== session));
        }
        if (esDelWorkspaceAbierto(workspace)) finishedTurns.set(session, ok);
        if (esDelWorkspaceAbierto(workspace)) handoff.observe({ kind: "terminal", scope: conversationScope(session) });
        // Un turno que acaba libera el material que tenía delante, y hay quien
        // está esperando justo eso para traerlo (`AvisoDeMaterial`). Se avisa
        // aquí, antes del filtro por tarea abierta: el turno que termina puede
        // ser de otra.
        window.dispatchEvent(new CustomEvent("harness:turno-cerrado"));
      // Y el árbol de esa tarea quedó como quedó: el panel de código tiene
      // archivos abiertos que el turno pudo reescribir. Sin este aviso siguen
      // enseñando la versión de antes, y guardar encima escribiría el archivo
      // viejo entero sobre lo que el agente acaba de hacer
      // (`features/code/refresh.ts`). Va antes del filtro por tarea abierta,
      // como el cierre: el panel decide por su cuenta si le toca.
        avisarDeLosArboles(session);
      }

      // Una tarea puede arrancar sin que esta pantalla la lance: las hijas de
      // orquestación las despacha el backend al cerrar el turno del padre
      // (`workspace/orchestration.rs`), y su `started` es la única señal de que
      // existen. Se apunta antes del filtro, como el cierre, y el historial
      // se recarga para que la fila aparezca —o, en un `done` de una tarea
      // que no se está mirando, para que deje de decir que trabaja—.
      if (kind === "started" || kind === "done") {
        if (kind === "started" && workspace) liveThreads.add(liveThreadKey(workspace, session));
        enviarFiltro();
        if (kind === "started" && esDelWorkspaceAbierto(workspace)) {
          const lanzadoAqui = pendingStarts.delete(session);
          advanceTurn(session);
          // Lo que el servicio escribió al lanzarlo solo —la línea del cupo— está en disco y no llega por eventos.
          if (!lanzadoAqui) releerUna(session);
          setSettlingTurns((ids) => ids.filter((id) => id !== session));
          finishedTurns.delete(session);
          setEnFondo((ids) => ids.filter((id) => id !== session));
          marcarViva(session, undefined, true);
        }
        if (esDelWorkspaceAbierto(workspace)) void refreshSessionsOnEvent(carpetasDeTarea(session));
      }

      // Cada evento cae en el hilo de SU sesión, esté abierta o no (ver
      // `hilos`). Lo único que se descarta es lo que corre en otro workspace:
      // lo que hay en memoria es de este cliente.

      // El permiso se salta esa comprobación para RECIBIRSE, no para
      // pintarse: descartarlo aquí lo perdería —es la única copia, y el turno
      // que lo espera se quedaría parado sin que nadie pudiera ya
      // contestarle—. Dejarlo entrar no es dejarlo aparecer: quién lo pinta
      // elige el de la tarea abierta, y el resto espera en la suya.

      // Pintarlo al llegar mete el comando de una conversación al pie de otra
      // —y, cambiando de workspace con algo contestando, de otro cliente— con
      // su aviso de procedencia calculado contra el material equivocado. El
      // gate espera en su conversación; el punto del historial y el de la
      // pestaña dicen en cuál.
      if (kind === "shell_started" || kind === "shell_output" || kind === "shell_done") {
        if (esDelWorkspaceAbierto(workspace) && id) alComando(session, kind, { id, text, meta, target });
        return;
      }

      const esGate = kind === "permission" || kind === "permission_resolved";
      const retainedStream = Boolean(workspace && liveThreads.has(liveThreadKey(workspace, session))) &&
        ["delta", "reasoning", "image", "tool", "tool_done", "notice", "task_launched", "segment_saved", "command_output", "command_running"].includes(kind);
      if (!esGate && !esDelWorkspaceAbierto(workspace) && !retainedStream) return;

      if (kind === "started") { const scope = conversationScope(session); handoff.observe({ kind: "started", scope }); turnStarted(scope); return; }

      if (kind === "task_launched") {
        paintTranscript();
        if (esDelWorkspaceAbierto(workspace)) void refreshSessionsOnEvent(carpetasDeTarea(session));
        return;
      }
      if (kind === "segment_saved") { paintTranscript(); return; }
      if (kind === "queue") { releerCola(session); return; }

      if (kind === "mcp_auth") {
        noteMcpSignIn(session, text);
        return;
      }

      if (kind === "model") {
        if (session === sessionId()) composer.runtimeFact({ kind: "model", value: text });
        return;
      }
      if (kind === "effort") {
        if (session === sessionId()) composer.runtimeFact({ kind: "effort", value: text });
        return;
      }

      // Tras un Detener optimista el frente ya cerró el turno; descarta deltas/herramientas/reintentos
      // rezagados del turno moribundo hasta que llegue el `done` del backend.
      const wsKey = workspace ?? workspaceActivo();
      const stoppedOptimistically =
        handoff.view(conversationScope(session)).stopping &&
        !(wsKey && liveThreads.has(liveThreadKey(wsKey, session)));
      if (stoppedOptimistically && kind !== "done" && kind !== "permission_resolved") return;

      // El CLI está reintentando contra su proveedor. No entra en la
      // transcripción —cinco intentos serían cinco filas permanentes por algo
      // que puede resolverse solo—: enciende el indicador de estado del
      // turno, que es lo único que contesta «¿esto sigue vivo?» mientras el
      // proveedor no contesta. Se apaga en cuanto el turno vuelve a avanzar,
      // unas líneas más abajo.
      if (kind === "retry") {
        const [intento, total] = (meta ?? "").split("/").map(Number);
        setReintento({
          session,
          intento: intento || 0,
          total: total || 0,
          clase: text,
        });
        return;
      }

      // Y se apaga con la primera señal de que el turno avanzó otra vez. Sin
      // esto, un reintento que sale bien deja el rótulo puesto hasta el cierre
      // y la pantalla afirma una espera que ya terminó.
      if (reintento()?.session === session) setReintento(null);

      if (kind === "background") {
        setEnFondo((ids) => (ids.includes(session) ? ids : [...ids, session]));
        const primero = session === sessionId() && !editando() ? cola()[0] : undefined;
        if (primero) void mandarAhora(primero.id);
        return;
      }
      if (enFondo().includes(session)) setEnFondo((ids) => ids.filter((id) => id !== session));

      if (kind === "tool" || kind === "tool_done") { paintTranscript(); return; }

      if (kind === "done") {
        void settleTurn(session, ok, text === "unsaved");
        // Si este cliente tiene un mensaje encolado esperando el cierre (`handoff.pending`),
        // releer `load_queue` en paralelo pisaría `cola()` antes de que `settleTurn` lo despache.
        if (!handoff.view(conversationScope(session)).pending) releerCola(session);
        return;
      }

      // El pedido ya tiene decisión, tomada aquí o en otra ventana sobre la
      // misma tarea. Sin esto el gate se quedaba hasta que el turno cerrara,
      // y pulsarlo solo devolvía «ya se contestó». La fila de la decisión se
      // pinta con lo que trae el evento; la relectura del cierre la reemplaza.
      if (kind === "permission_resolved") {
        if (!request_id) return;
        deps.permissionReads.set(session, (deps.permissionReads.get(session) ?? 0) + 1);
        const gate = permissions().find((p) => p.session === session && (p.requestId === request_id || p.durableId === request_id));
        setPermissions((ps) => ps.filter((p) => p.session !== session || (p.requestId !== request_id && p.durableId !== request_id)));
        if (gate && id && esDelWorkspaceAbierto(workspace)) {
          threads.commitUniqueTurn(session, {
                          role: "user",
                          text: "",
                          turno: id,
                          permission: {
                            request_id,
                            tool: text || gate.tool,
                            target: target ?? gate.target,
                            allow: ok === true,
                            when: Date.now(),
                          },
                        });
        }
        return;
      }

      if (kind === "permission") {
        setPermissionError(null);
        if (!request_id) {
          threads.appendLive(session, [{
                          role: "system",
              // Sin nombrar a un agente: un literal escrito mirando a uno nombra al
              // equivocado justo cuando algo va mal. Los de protocolo también piden
              // permiso.
                          text: t("shell.turn.permission_no_reply"),
                          meta: "fallo",
                        }], workspace);
          return;
        }
        setPermissions((ps) =>
          ps.some((p) => p.session === session && (p.requestId === request_id || p.durableId === request_id))
            ? ps
            : [
                ...ps,
                {
                  session,
                  workspace: workspace ?? workspaceActivo() ?? undefined,
                  llegada: ++deps.gateSeq,
                  requestId: request_id,
                  tool: text,
                  target: target ?? meta,
                  origin: origin ?? null,
                },
              ],
        );
        void reponerGates(session, workspace ?? workspaceActivo());
        return;
      }

      paintTranscript();
  };
  return { alEventoDeChat };
}
