import type { ObservedTurnActivity as TurnActivity } from "../../../../../apps/desktop/src/lib/activityObservation";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { stripNextSteps } from "../../../../../apps/desktop/src/lib/nextSteps";
import { pasoDe, pasoDePermiso, pasoDeSistema } from "../../../../../apps/desktop/src/lib/steps";
import { coalesceLiveActivity, isActivityOnlyMessage, placeActivities, visibleActivityMessages } from "../model/activityBlocks";
import { cupoResuelveElFallo } from "../model/failures";
import { freeMcpNoticeAt } from "../model/free-mcp-notice.ts";
import { esFilaDeLaBandeja } from "../model/inboxRows";
import { ponerLanzamiento } from "../model/launchGroups";
import type { Msg } from "../model/messageTypes";
import { esSalidaDeComando } from "../model/slashOutput";
import { createBlockKeys } from "../model/threadRows";
import type { Lectura } from "../model/threadWindow";
import type { createChatComposerState } from "./chat-composer-state";
import { claseDeSistema, claveDeBloque, fromWork, textoDeSistema, textoVisible, type Avance, type Bloque, type BloqueDeTrabajo } from "./chat-model";
import type { ChatProps } from "./chat-props";
import { createEffect, createMemo, on, untrack } from "solid-js";

/** Lo que el bloque usa del cuerpo de Chat. */
export type ChatBlocksDeps = { esElVivo: ReturnType<typeof createChatComposerState>["esElVivo"]; razonamientos: ReturnType<typeof createChatComposerState>["razonamientos"]; setRazonamientos: ReturnType<typeof createChatComposerState>["setRazonamientos"]; setTrabajos: ReturnType<typeof createChatComposerState>["setTrabajos"]; trabajos: ReturnType<typeof createChatComposerState>["trabajos"] };

/** Movido tal cual de Chat.tsx (el componente `Chat`, tarea 2.6). Lo que usa del cuerpo de Chat llega por `deps`. */
export function createChatBlocks(props: ChatProps, deps: ChatBlocksDeps) {
  const { esElVivo, razonamientos, setRazonamientos, setTrabajos, trabajos } = deps;
  /**
   * El turno que no cerró se queda fuera: un fallo es lo único de esa
   * tira que cambia lo que hay que hacer después, no entra en nada plegable.
   */
  const handoffStarting = () => Boolean(props.handoff && props.handoff.phase !== "waiting-close");
  const activityBlocked = () => Boolean(handoffStarting() || props.permission || props.esperando || props.reintento || props.enFondo || props.machineWait);
  const isCurrentActivity = (activity: TurnActivity<Msg> | undefined) => !!activity && (activity.active || activity.key === props.activities?.at(-1)?.key);
  const activityOwners = createMemo(() => new Map((props.activities ?? []).flatMap(activity => activity.messages.map(message => [message, activity] as const))));
  const bloques = createMemo<Bloque[]>(() => {
    const out: Bloque[] = [];
    props.msgs.forEach((m, i) => {
      const freeNotice = freeMcpNoticeAt(props.msgs, i);
      if (freeNotice) {
        const names = freeNotice.names?.map((name) => JSON.stringify(name)).join(", ");
        out.push({ tipo: "msg", msg: { ...m, text: [t("chat.notice.free_router_mcp_unavailable"), names].filter(Boolean).join("\n") }, i });
        return;
      }
      if (freeMcpNoticeAt(props.msgs, i - 1)?.names) return;
      // Contestar no deja un turno suelto en el hilo: la respuesta se pinta
      // DENTRO de la pregunta que contesta, que es donde se lee lo que se
      // preguntó y lo que se decidió como una sola cosa.
      if (m.respuestas?.length) return;
      if (m.shell) {
        out.push({ tipo: "msg", msg: m, i });
        return;
      }
      if (activityOwners().has(m) && m.role === "agent") {
        if (m.text || m.preguntas?.length || m.images?.length || m.historyRefs?.length || m.artefactos?.length)
          out.push({ tipo: "trabajo", pasos: [], msg: m, i, responseOnly: true });
        return;
      }
      if (activityOwners().has(m) && isActivityOnlyMessage(m)) return;
      // Terminus ya no avisa en el chat que una tarea lanzada terminó; las
      // filas que quedaron guardadas de antes tampoco se pintan.
      if (m.meta === "task_completed") return;
      if (m.meta === "task_launched") {
        ponerLanzamiento(out, { tipo: "msg", msg: m, i }, (b) => b.tipo === "msg" && b.msg.meta === "task_launched");
        return;
      }
      // El cambio de material no es un paso de ejecución y no entra al
      // pliegue: el bloque arranca cerrado, ahí dentro se leería como una
      // herramienta más entre veinte, y esto no es algo que el agente hizo
      // para contestar, es sobre qué pasó a contestar a partir de aquí.

      // La entrega tampoco, con un motivo más fuerte: es el resultado del
      // trabajo, no lo que se hizo para conseguirlo. Metida en la tira
      // plegada quedaría escondida por omisión, que es exactamente el
      // defecto que esto viene a arreglar.

      // Se mira la longitud y no si el campo está: un turno que no entregó
      // nada guarda una lista vacía —dato real, ver `workspace/sessions.rs`—;
      // con `m.artefactos` a secas saldría del pliegue para no pintar nada,
      // cayéndose en la rama de error con una caja roja vacía.
      if (
        m.role === "agent"
      ) {
        const ultimo = out[out.length - 1];
        const pasos = ultimo?.tipo === "pasos" ? ultimo.pasos : [];
        if (ultimo?.tipo === "pasos") out.pop();
        // El registro vivo y el turno cerrado son la misma fila. Conservar el
        // índice donde nació evita que su pliegue cambie de identidad justo al
        // llegar la respuesta, que es también cuando más cambia su contenido.
        const bloque: BloqueDeTrabajo = { tipo: "trabajo", pasos, msg: m, i: ultimo?.tipo === "pasos" ? ultimo.i : i };
        // Los mensajes públicos conservan su lugar fuera del registro al releer.
        const avance: Avance[] = [];
        for (let previo = out.at(-1); m.turno && previo?.tipo === "trabajo" && previo.msg.avanceDe === m.turno; previo = out.at(-1)) {
          out.pop();
          avance.unshift({ pasos: previo.pasos, msg: previo.msg, outside: true });
          bloque.i = previo.i;
        }
        if (avance.length) bloque.avance = avance;
        out.push(bloque);
        return;
      }
      // La decisión de permiso es un paso, no un bloque: va firmada por la
      // persona —`role: "user"`—, en la rama de abajo parte la tira en dos,
      // los pasos de antes quedan sueltos y los de después entran en
      // «Trabajó durante …». Como tarjeta pesa más que el acto: repite el
      // comando que la fila de al lado ya enseña.
      if (m.permission) {
        const paso = pasoDePermiso(
          m.permission.tool,
          m.permission.target ?? null,
          m.permission.allow,
          m.encargado ?? m.fromTask?.title,
        );
        const ultimo = out[out.length - 1];
        if (ultimo?.tipo === "pasos") ultimo.pasos.push(paso);
        else out.push({ tipo: "pasos", pasos: [paso], i });
        return;
      }
      // Lo dice el pie de la tarjeta del `!`: una fila aparte hacía saltar la altura.
      if (m.meta === "shell_reply") return;
      // La línea del cupo resuelve el fallo que la precede: las dos juntas se leen como un error que sigue abierto.
      const anterior = out.at(-1);
      if (m.meta === "cupo" && anterior?.tipo === "msg" && cupoResuelveElFallo(anterior.msg.fallo?.clase)) out.pop();
      if (
        m.role !== "system" ||
        m.meta === "history_gap" ||
        m.meta === "fallo" ||
        m.meta === "cupo" ||
        m.meta === "engine_updated" ||
        m.meta === "provider_handover" ||
        // Lo que la ventana dice de un gesto que no se pudo hacer —«mandar
        // ahora» contra un agente que no recibe mensajes a medias—: es un
        // renglón del hilo y no un paso de lo que hizo el agente.
        m.meta === "steer_refused" ||
        esFilaDeLaBandeja(m.meta) ||
        esSalidaDeComando(m.meta) ||
        m.contexto ||
        m.artefactos?.length
      ) {
        out.push({ tipo: "msg", msg: m, i });
        return;
      }
      // Un paso guardado antes de que el rastro llevara sujeto sigue siendo una
      // fila: se sabe qué herramienta usó y no sobre qué. Es exacto.
      const paso =
        m.paso ??
        (m.meta === "usó"
          ? pasoDe(m.text)
          : pasoDeSistema(claseDeSistema(m.meta), textoDeSistema(m)));
      const ultimo = out[out.length - 1];
      if (ultimo?.tipo === "pasos") ultimo.pasos.push(paso);
      else out.push({ tipo: "pasos", pasos: [paso], i });
    });

    return placeActivities(props.activities?.length ? out : coalesceLiveActivity(out, Boolean(props.busy)), props.activities ?? []);
  });
  const searchMessages = () => bloques().flatMap((block, index) => {
    const messages = visibleActivityMessages(block).filter(message => ["user", "agent"].includes(message.role) && !message.shell && !message.permission);
    const message = messages.at(-1);
    if (!message || !["user", "agent"].includes(message.role) || message.shell || message.permission) return [];
    const named = message.author?.name?.trim() || message.encargado || message.fromTask?.title || "";
    const speaker = named || (message.role === "agent" && message.agent
      ? (props.agents.find((agent) => agent.id === message.agent)?.label ?? message.agent)
      : null);
    return [{
      block: index,
      text: messages.map(message => message.role === "agent" ? stripNextSteps(textoVisible(message.text)) : message.text).join("\n\n"),
      markdown: message.role === "agent",
      role: message.role as "user" | "agent",
      speaker,
      at: typeof message.at === "number" ? message.at : undefined,
    }];
  });
  const esLaTiraViva = (bloque: Bloque) => Boolean(props.busy) && bloque === bloques().at(-1);
  // Pasos que llegan tras la respuesta abren otro tramo, y el de la respuesta deja de correr.
  const registroCorre = (bloque: Bloque) => fromWork(bloque, (t) => esElVivo(t.msg), false) && esLaTiraViva(bloque);

  const clavesDeBloques = createBlockKeys();
  const claves = createMemo(on(() => props.conversacion, (conversacion, anterior) => {
    if (anterior !== undefined && anterior !== conversacion) clavesDeBloques.reset();
  }));
  const clavesDelHilo = createMemo(() => {
    claves();
    const lista = bloques();
    const asignadas = clavesDeBloques.assign(lista.map((b) => b.activity ? `activity:${b.activity.key}` : props.msgs[b.i]?.clave ?? null));
    // Por clave y no por índice: al anteponer, un índice viejo sobre los bloques nuevos es otra fila y su contenido se rehace.
    return { lista: asignadas, deBloque: new Map(lista.map((b, k) => [b, asignadas[k]])), deClave: new Map(lista.map((b, k) => [asignadas[k], b])) };
  });
  // La fila que nace viva hereda su pliegue al cerrarse el turno: su clave deja
  // de ser provisional y, sin esto, el bloque se cerraba solo al guardarse.
  const heredarPliegues = (renombradas: readonly [string, string][]) => {
    const trabajosAntes = untrack(trabajos);
    const razonamientosAntes = untrack(razonamientos);
    const siguientesTrabajos: Record<string, boolean> = { ...trabajosAntes };
    const siguientesRazonamientos: Record<string, boolean> = { ...razonamientosAntes };
    let tocaTrabajos = false;
    let tocaRazonamientos = false;
    for (const [vieja, nueva] of renombradas) {
      const antes = claveDeBloque(vieja);
      const despues = claveDeBloque(nueva);
      if (antes in trabajosAntes) {
        siguientesTrabajos[despues] = trabajosAntes[antes];
        tocaTrabajos = true;
      }
      for (const clave of Object.keys(razonamientosAntes)) {
        if (clave !== antes && !clave.startsWith(`${antes}:razonamiento:`)) continue;
        siguientesRazonamientos[despues + clave.slice(antes.length)] = razonamientosAntes[clave];
        tocaRazonamientos = true;
      }
    }
    if (tocaTrabajos) setTrabajos(siguientesTrabajos);
    if (tocaRazonamientos) setRazonamientos(siguientesRazonamientos);
  };
  createEffect(() => {
    clavesDelHilo();
    const renombradas = clavesDeBloques.takeRenames();
    if (renombradas.length) heredarPliegues(renombradas);
  });
  const claveFila = (b: Bloque) => claveDeBloque(b.activity ? `activity:${b.activity.key}` : props.msgs[b.i]?.clave ?? clavesDelHilo().deBloque.get(b) ?? String(b.i));
  const bloqueDeLectura = (lectura: Lectura) => {
    const at = clavesDelHilo().lista.indexOf(lectura.clave);
    return at < 0 ? null : at;
  };
  return { activityBlocked, bloqueDeLectura, bloques, claveFila, clavesDelHilo, esLaTiraViva, handoffStarting, isCurrentActivity, registroCorre, searchMessages };
}
