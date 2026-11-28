import { batch, type Accessor } from "solid-js";
import { callEngine } from "../../../../engine-client/src/client.ts";
import { claveDe } from "../../../../ui/src/Failure";
import { type Agent } from "../../../../ui/src/lib/model.ts";
import type { createTabs } from "../../../../ui/src/lib/tabs.ts";
import { type Encolado } from "../components/MessageQueue";
import { mensajeDeFallo } from "../model/failures";
import { comandoEscrito } from "../model/slashOutput";
import { type Msg } from "../screens/Chat";
import type { createPanelDeChat } from "../screens/PanelDeChat.tsx";
import type { createThreadStream } from "./thread-stream.ts";
import type { SessionRow, WorkspaceContextPort, createThreadsStore } from "./types.ts";

export type Pendientes = {
  records?: { permissions: { id: string; request_id: string; state: string; [key: string]: unknown }[] };
  // `id` y `revision` faltan en un motor anterior a los pendientes durables.
  questions: { id?: string; request_id: string; revision?: number; turn: string }[];
  permissions: { id?: string; request_id: string; revision?: number; tool: string; target: string | null }[];
};

/** Lo que esa tarea tiene esperando. No lanza: sin respuesta, no hay nada. */
export function readPendingRequests(
  session: string,
  workspace: string | null,
  opcionesDeLaTarea: (id: string | null | undefined, workspace: string | null | undefined) => { headers: { [k: string]: string } },
) {
  return callEngine<Pendientes>("pending_requests", { session }, opcionesDeLaTarea(session, workspace)).catch(() => null);
}

/** Revierte o registra un fallo de envío conservando la consistencia entre pestaña provisional, cola y actividad. */
export function handleSendFailure(
  deps: {
    agents: Accessor<Agent[]>;
    conversationScope: ReturnType<typeof createThreadStream>["conversationScope"];
    handoff: ReturnType<typeof createThreadStream>["handoff"];
    marcarQuieta: ReturnType<typeof createThreadStream>["marcarQuieta"];
    olvidarPestana: ReturnType<typeof createPanelDeChat>["olvidarPestana"];
    paneles: { showDraft(): void };
    pestanas: ReturnType<typeof createTabs>;
    retirarNaciendo: (id: string) => { project: string; row: SessionRow }[];
    sessionId: Accessor<string | null>;
    setArrancando: ReturnType<typeof createThreadStream>["setArrancando"];
    taskQueues: ReturnType<typeof createThreadStream>["taskQueues"];
    threads: ReturnType<typeof createThreadsStore>;
    workspaceContext: WorkspaceContextPort;
  },
  state: {
    error: unknown;
    carryStopped: symbol;
    abierta: string | null;
    provisional: string | null;
    dormida: string | null;
    naceDormida: string | null;
    enviado: boolean;
    generation: number;
    proyecto: string;
    clave: string;
    turnoPropio: Msg;
    entrando: Msg[];
    m: Omit<Encolado, "id">;
    clientMessageId: string;
    respuestas: boolean;
    deLaCola: string | undefined;
    destination: { session: string; project: string } | undefined;
  },
): boolean {
  const { agents, conversationScope, handoff, marcarQuieta, olvidarPestana, paneles, pestanas, retirarNaciendo, sessionId, setArrancando, taskQueues, threads, workspaceContext } = deps;
  const { error: e, carryStopped, abierta, provisional, dormida, naceDormida, enviado, generation, proyecto, clave, turnoPropio, entrando, m, clientMessageId, respuestas, deLaCola, destination } = state;

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
  if (e === carryStopped) {
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
}
