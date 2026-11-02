/**
 * El modelo de eventos del turno y la transcripción que se pinta: Rust
 * normaliza claude y codex a estas formas, y `transcripcion()` convierte los
 * turnos guardados en los mensajes del hilo. Es cálculo sin JSX; vive con su
 * dominio y se prueba desde Node.
 */

import { isQuestionFile } from "@terminus/chat/steps";
import { mcpCallFromName } from "@terminus/chat/tools";
import type { HistoryRef } from "@terminus/protocol";
import type { CodeRange } from "../../lib/model.ts";
import type { Recipient, ReplyTo, SenderTask } from "../../lib/recipients.ts";
import { type Detalle, pasoDe } from "../../lib/steps.ts";
import type {
  Author,
  CambioPorCupo,
  FalloDelTurno,
  Msg,
  PermissionDecision,
  PermissionOrigin,
  Razonamiento,
} from "./Chat.tsx";
import type { Producido } from "./Delivery.tsx";
import type { HistoryPage } from "./history.ts";
import type { Pregunta, Respuesta } from "./Questions.tsx";

/** Modelo de eventos propio: Rust normaliza claude y codex a estas formas. */
export type ChatEvent = {
  /**
   * De qué workspace es el turno que lo manda, o ausente si no viene de uno
   * —un aviso que Rust emite contestando a lo que se acaba de hacer aquí—.
   *
   * Existe desde que se puede cambiar de workspace con una tarea contestando:
   * el turno del otro cliente sigue emitiendo mientras la ventana enseña éste.
   */
  workspace?: string;
  session: string;
  /** `tool` abre un paso; `tool_done` lo cierra con su resultado. */
  kind:
    | "started"
    | "delta"
    /** Lo que el agente pensó antes de escribir; no es su respuesta. */
    | "reasoning"
    | "tool"
    | "tool_done"
    | "permission"
    /**
     * Alguien —esta ventana u otra— ya decidió el pedido `request_id`: `ok` es
     * lo decidido, `id` el turno que lo guarda y `text`/`target`, sobre qué.
     */
    | "permission_resolved"
    | "notice"
    | "task_launched"
    /** El motor guardó lo dicho hasta aquí en el turno `id` (un tramo); ver `tramoGuardado`. */
    | "segment_saved"
    | "model"
    | "effort"
    /** El CLI está reintentando contra su proveedor: `meta` trae `"3/5"`. */
    | "retry"
    /** El agente contestó y está libre; el turno sigue por una hija en segundo plano. */
    | "background"
    /** Al arrancar el turno: `text` trae `{agent, servers}` con los MCP que piden sesión. */
    | "mcp_auth"
    /**
     * Esta tarea cambió de estado fuera de un turno —despertó, durmió, o
     * empezó a trabajar—. `text` trae uno de `HandlerStatus`
     * (`docs/agents.md` § Estado observable). No entra en la transcripción, como
     * `retry`.
     */
    | "presence"
    | "command_output"
    /** El comando sigue corriendo en el CLI (`"compacting"`); solo pinta. */
    | "command_running"
    /** Un `!` mientras corre, con su ejecución en `id` (`runtime/chat/shell.rs`). */
    | "shell_started"
    | "shell_output"
    | "shell_done"
    /**
     * Una imagen que el agente acaba de producir. `detail.images` trae los
     * data URL. No es un paso: se pega a la respuesta en curso.
     */
    | "image"
    | "done";
  text: string;
  meta: string | null;
  /**
   * Solo en `delta`: este texto empieza OTRO mensaje del agente.
   *
   * Lo dice el CLI, no se deduce. Ausente donde el proveedor no publica la
   * frontera — ver `runtime/chat/events.rs`.
   */
  starts_message?: boolean;
  /**
   * Solo en `delta` y `reasoning`: el mensaje del agente al que pertenece el
   * fragmento, si el CLI lo publica. ACP lo manda por `messageId`, y su orden
   * de entrega no es el de generación: una herramienta del mensaje puede caer
   * entre dos fragmentos suyos. Con esto el texto vuelve a su globo en vez de
   * abrir uno nuevo. Ver `runtime/acp.rs`.
   */
  message_id?: string;
  /** Solo en `tool`/`tool_done`: con qué paso empareja. */
  id?: string;
  /** Solo en `tool`: sobre qué actuó. */
  target?: string;
  /** El cuerpo del paso: salida de terminal, o el antes y después de un archivo. */
  detail?: Detalle;
  mcp_app?: McpAppCall;
  task?: SenderTask;
  /** En `done`, si el turno cerró bien. En `tool_done`, si el paso salió bien. */
  ok: boolean | null;
  /** Solo en `permission`: correlaciona la decisión con el agente que la pidió. */
  request_id: string | null;
  /**
   * Solo en `permission`: de qué fuente es el objetivo y si es material que el
   * turno no tiene concedido. Lo resuelve Rust contra la lista de la que
   * salieron los `--add-dir`; aquí solo se pinta.
   */
  origin?: PermissionOrigin;
};

export type McpAppCall = {
  server: string;
  tool: string;
  arguments?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
};

/**
 * Partir `mcp__servidor__tool` es cosa de todos los clientes, no de esta
 * pantalla: vive en `@terminus/chat/tools`, junto con la marca del servicio.
 */
export { mcpCallFromName };

/**
 * Mete un fragmento de respuesta en el hilo vivo.
 *
 * Los fragmentos del mismo mensaje se concatenan SIN separador, y
 * `startsMessage` abre otro globo. `messageId` —que ACP publica— dice a cuál
 * pertenece el fragmento: si ya hay un globo de ese mensaje se le pega aunque
 * una herramienta haya quedado en medio, y el mensaje no sale partido.
 */
export function anexarDelta(
  msgs: Msg[],
  d: {
    text: string;
    messageId?: string;
    startsMessage?: boolean;
    author: Author | null;
    /** Con qué se lanzó el turno; el cierre lo cambia por el observado. */
    model?: string | null;
  },
): Msg[] {
  const nuevo = (text: string): Msg[] => [
    ...msgs,
    {
      role: "agent",
      text,
      author: d.author,
      nativeMessageId: d.messageId,
      ...(d.model ? { reported_model: d.model } : {}),
    },
  ];
  if (d.startsMessage) return nuevo(d.text.replace(/^\n+/, ""));
  if (d.messageId) {
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].meta === "task_launched" || msgs[i].tramo) break;
      if (msgs[i].role === "agent" && msgs[i].nativeMessageId === d.messageId) {
        const copia = [...msgs];
        copia[i] = { ...msgs[i], text: msgs[i].text + d.text };
        return copia;
      }
    }
    // La imagen puede llegar antes que el primer token. Sin pegarla a este
    // mensaje, el PNG se queda en un globo vacío y el texto abre otro.
    const ultimo = msgs[msgs.length - 1];
    if (
      ultimo?.role === "agent" &&
      !ultimo.turno &&
      !ultimo.nativeMessageId &&
      !ultimo.text &&
      ultimo.images?.length
    ) {
      return [
        ...msgs.slice(0, -1),
        { ...ultimo, text: d.text, nativeMessageId: d.messageId },
      ];
    }
    return nuevo(d.text);
  }
  const ultimo = msgs[msgs.length - 1];
  // Lo que ya está en un tramo guardado no crece: lo que sigue es del tramo siguiente.
  if (ultimo?.role === "agent" && !ultimo.tramo) {
    return [...msgs.slice(0, -1), { ...ultimo, text: ultimo.text + d.text }];
  }
  return nuevo(d.text);
}

/** Un fragmento de respuesta tal como lo recibe `anexarDelta`. */
export type Delta = Parameters<typeof anexarDelta>[1];

/**
 * Varios fragmentos seguidos de un hilo en una sola pasada, con el mismo
 * resultado que aplicarlos uno a uno. Los que caen en el mismo globo se pegan
 * antes: el hilo se copia una vez por tanda y no una por token.
 */
export function anexarDeltas(msgs: Msg[], deltas: readonly Delta[]): Msg[] {
  const juntos: Delta[] = [];
  for (const d of deltas) {
    const previo = juntos.at(-1);
    if (
      previo &&
      !d.startsMessage &&
      // Un globo que abre solo con saltos se los quita: pegarle más texto cambiaría qué se quita.
      !(previo.startsMessage && /^\n*$/.test(previo.text)) &&
      d.messageId === previo.messageId &&
      d.author === previo.author &&
      d.model === previo.model
    )
      juntos[juntos.length - 1] = { ...previo, text: previo.text + d.text };
    else juntos.push(d);
  }
  return juntos.reduce((m, d) => anexarDelta(m, d), msgs);
}

/**
 * Mete un fragmento de razonamiento en el hilo vivo, en su bloque.
 *
 * Con `messageId` se pega al mensaje de ese id aunque una herramienta haya
 * quedado en medio. Sin él —Codex y Claude no lo publican— cada ráfaga es un
 * bloque: el texto o una herramienta la cierran.
 */
export function anexarRazonamiento(
  msgs: Msg[],
  r: {
    text: string;
    messageId?: string;
    author: Author | null;
  },
): Msg[] {
  const bloque: Razonamiento = { text: r.text };
  const nuevo = (): Msg[] => [
    ...msgs,
    {
      role: "agent",
      text: "",
      author: r.author,
      nativeMessageId: r.messageId,
      razonamiento: [bloque],
    },
  ];
  const pegar = (m: Msg): Msg => {
    const previos = m.razonamiento ?? [];
    const ultimo = previos.at(-1);
    return {
      ...m,
      razonamiento: ultimo
        ? [...previos.slice(0, -1), { ...ultimo, text: ultimo.text + r.text }]
        : [bloque],
    };
  };
  if (r.messageId) {
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].meta === "task_launched") break;
      if (msgs[i].role === "agent" && msgs[i].nativeMessageId === r.messageId) {
        const copia = [...msgs];
        copia[i] = pegar(msgs[i]);
        return copia;
      }
    }
    return nuevo();
  }
  const ultimo = msgs[msgs.length - 1];
  if (ultimo?.role === "agent" && !ultimo.text && ultimo.razonamiento?.length) {
    return [...msgs.slice(0, -1), pegar(ultimo)];
  }
  return nuevo();
}

/**
 * Pega imágenes a la respuesta que se está escribiendo.
 *
 * Van en el último globo del agente que todavía no cerró. Si la herramienta
 * terminó antes del primer token, el globo nace vacío y el delta siguiente
 * le escribe el texto: si no, la imagen y la frase quedan en dos mensajes.
 */
export function anexarImagen(msgs: Msg[], images: string[]): Msg[] {
  if (images.length === 0) return msgs;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== "agent" || m.turno) continue;
    const previas = m.images ?? [];
    const nuevas = images.filter((url) => !previas.includes(url));
    if (nuevas.length === 0) return msgs;
    const copia = [...msgs];
    copia[i] = { ...m, images: [...previas, ...nuevas] };
    return copia;
  }
  return [...msgs, { role: "agent", text: "", images: images.slice() }];
}

/** Marca lo vivo que el motor guardó en el tramo `turno`; no lo quita: un `tool_done` tardío busca su fila. */
export function tramoGuardado(msgs: Msg[], turno: string): Msg[] {
  const suyo = (m: Msg) => !m.turno && !m.tramo && (m.role === "agent" || m.meta === "usó");
  return msgs.some(suyo) ? msgs.map((m) => (suyo(m) ? { ...m, tramo: turno } : m)) : msgs;
}

/** Lo guardado y, detrás, lo vivo que el disco no trae: releer con el turno corriendo no repite sus tramos. */
export function mensajesDelHilo(h: { base: Msg[]; vivo: Msg[]; guardados?: ReadonlySet<string> }): Msg[] {
  const guardados = h.guardados;
  const enDisco = (id?: string) => id !== undefined && guardados!.has(id);
  const vivo = sinInyectadosGuardados(
    h.base,
    guardados?.size ? h.vivo.filter((m) => !enDisco(m.turno) && !enDisco(m.tramo)) : h.vivo,
  );
  return vivo.length ? [...h.base, ...vivo] : h.base;
}

/**
 * Un mensaje metido sin id (`Msg.inyectado`) que el disco ya trae: el primer turno
 * de la persona con su texto guardado después de `tras`. Cada guardado cuenta
 * una vez, para que dos «sí» seguidos sigan siendo dos.
 */
function sinInyectadosGuardados(base: Msg[], vivo: Msg[]): Msg[] {
  if (!vivo.some((m) => m.inyectado && !m.turno)) return vivo;
  const usados = new Set<number>();
  return vivo.filter((m) => {
    if (!m.inyectado || m.turno) return true;
    const tras = m.inyectado.tras;
    const desde = tras === null ? 0 : base.findIndex((b) => b.turno === tras) + 1;
    if (desde === 0 && tras !== null) return true;
    for (let i = desde; i < base.length; i++) {
      const b = base[i];
      if (usados.has(i) || b.role !== "user" || !b.turno || b.text !== m.text) continue;
      usados.add(i);
      return false;
    }
    return true;
  });
}

/**
 * Lo escrito en una subtarea que el motor pasó a su padre envuelto en el encargo
 * de retomarla (`subagents::relay_prompt`, `launch::relevo_de`): el encargo es del CLI.
 */
const RELEVOS = [
  /^\[Mensaje para tu subagente «(.+)»\]\nRetómalo con SendMessage usando to: "[^"\n]*" y pásale esto tal cual:\n\n([\s\S]*?)\n\nNo hagas tú su trabajo\. Cuando conteste, resume en una línea qué dijo\.$/,
  /^\[Mensaje para tu subagente «(.+)»\]\nRetómalo con resume_agent si hace falta y usa send_input con id: "[^"\n]*"\. Pásale esto tal cual y espera su resultado:\n\n([\s\S]*)$/,
];
export function relevoDe(text: string): { titulo: string; texto: string } | null {
  for (const forma of RELEVOS) {
    const m = forma.exec(text);
    if (m) return { titulo: m[1], texto: m[2] };
  }
  return null;
}

/** Una herramienta que el agente usó, tal como quedó **guardada** en el turno. */
export type Tool = {
  name: string;
  target: string | null;
  images?: string[];
  mcp_app?: McpAppCall;
  /**
   * Si la herramienta devolvió error. `undefined` es «no se sabe»: lo guardado
   * antes de que el campo existiera, y los drivers cuyo stream no cierra el
   * paso. Ver `sessions::Tool`.
   */
  ok?: boolean | null;
};

/**
 * Un trozo de lo que el agente produjo, en el orden en que lo produjo.
 * `tool` indexa `Turn.tools`. Ver `sessions::Piece`.
 */
export type Piece = { text: string } | { tool: number };

/**
 * La clave con la que una respuesta apunta a su pregunta: el turno que la hizo
 * y la pregunta dentro de ese turno. Va por `JSON.stringify` y no concatenada
 * con un separador porque los ids de pregunta los escribe el agente, y
 * cualquier separador que se elija puede aparecer dentro de uno.
 */
export function clave(turno: string, pregunta: string) {
  return JSON.stringify([turno, pregunta]);
}

/** Lo que el agente dejó preguntado al cerrar un turno. */
export type PreguntaEvent = {
  /** Ver `ChatEvent.workspace`. */
  workspace?: string;
  session: string;
  turno: string;
  preguntas: Pregunta[];
  request_id?: string;
};

/**
 * La otra ventana escribió una transcripción. `sync.rs` · `Signal`.
 *
 * Existe porque con la app instalada abierta y una rama levantada con
 * `--datos-reales` las dos comparten carpeta de datos, y `app.emit` no cruza de
 * un proceso al otro: sin esto, la ventana que no lanzó el turno se queda con lo
 * que leyó al abrir la tarea.
 */
export type SessionEvent = {
  /** Ver `ChatEvent.workspace`. */
  workspace?: string;
  project: string;
  session: string;
};

/** Quién pregunta y quién contesta, según Rust. */
export type Signatures = { person: Author; agent: Author };

/** `workspace/artifacts.rs` · `ChatExportado`. */
export type ChatExportado = { rel: string; path: string };

/**
 * Un bloque de razonamiento guardado. `before_piece` lo sitúa entre las
 * piezas del turno; ausente es «no se registró».
 */
export type TurnReasoning = {
  text: string;
  before_piece?: number;
  duration_ms?: number | null;
  truncated?: boolean;
};

export type Turn = {
  task_mentions?: import("../../lib/taskMentions.ts").TaskMention[];
  role: string;
  text: string;
  /** Lo que la persona adjuntó a ESTE mensaje. Ver `sessions::Turn`. */
  attachments?: string[] | null;
  /** Tiempo de trabajo activo del tramo del agente; falta en tareas antiguas. */
  duration_ms?: number | null;
  /** Cuándo quedó escrito el turno, en ms desde la época; falta en tareas antiguas. */
  at?: number | null;
  shell?: {
    cwd: string;
    output: string;
    exit_code: number | null;
    duration_ms: number;
    truncated: boolean;
  } | null;
  /** Las fotos que encierran el turno, una por árbol. Ver `sessions::CodeRange`. */
  code?: CodeRange[] | null;
  /** "fallo" en un cierre que tiene que seguir visible al reabrir la tarea. */
  meta?: string | null;
  /** Por qué falló, cuando se pudo clasificar. Ver `failures::Fallo`. */
  fallo?: FalloDelTurno | null;
  /** Con qué cuenta siguió tras quedarse sin cupo. Ver `quota::QuotaResume`. */
  quota?: CambioPorCupo | null;
  /** Causa interna de una reanudación que se puede volver a lanzar. */
  resume?: string | null;
  /** Vacío en las sesiones escritas antes de que el turno llevara autor. */
  author?: Author | null;
  /** HandlerDefinition que escribió este input, si no fue la persona. */
  agent?: string | null;
  /** Por qué canal lo escribió la persona (`Turn::channel`). */
  channel?: string | null;
  /** A quién iba dirigido (`Turn::recipients`). */
  recipients?: Recipient[] | null;
  /** Dónde se contesta, cuando no es aquí (`Turn::reply_to`). */
  reply_to?: ReplyTo | null;
  /** La tarea que lo escribió por el CLI (`Turn::from_task`). */
  from_task?: SenderTask | null;
  /** Cuántas entregas encadenadas lleva (`Turn::hops`). */
  hops?: number | null;
  /** Las tareas que despertaron a la Bandeja (`Turn::woke_by`). */
  woke_by?: string[] | null;
  history_refs?: HistoryRef[];
  tools?: Tool[];
  /**
   * El turno en su orden: el texto partido en los mensajes que el agente
   * dijo, con las herramientas donde las usó. Ver `sessions::Piece`.
   *
   * Ausente o vacío es «no se registró», y ahí el rastro se pinta delante
   * del texto como siempre.
   */
  pieces?: Piece[] | null;
  /**
   * Lo que el agente pensó, en bloques. Va aparte de `pieces`: no es algo que
   * dijera ni hiciera, y no entra en copiar, buscar ni exportar.
   */
  reasoning?: TurnReasoning[] | null;
  id?: string | null;
  /** El modelo elegido al lanzar; ausente si se dejó el de por defecto. */
  model?: string | null;
  /** El modelo que reportó el CLI al cerrar el turno. */
  reported_model?: string | null;
  /** El proveedor de modelos del turno («OpenCode Zen», «OpenCode Go»).
   *  Ausente en los turnos anteriores al campo y en los que no lanzan nada. */
  model_vendor?: string | null;

  native_id?: string | null;
  questions?: Pregunta[] | null;
  answers?: Respuesta[] | null;
  permission?: PermissionDecision | null;
  /**
   * Con qué material se lanzó este turno, por id de fuente.
   *
   * Ausente significa **«no se registró»** y no «ninguno»: los turnos escritos
   * antes de que esto existiera, y las respuestas del agente, que pertenecen al
   * lanzamiento que registró la pregunta (`workspace/sessions.rs`).
   */
  sources?: string[] | null;
  /**
   * Qué dejó este turno en la carpeta de trabajo.
   *
   * Ausente es **«no se registró»** —los turnos de antes de este campo, y todos
   * los de la persona—; una lista vacía es «no produjo nada». Con una sola forma
   * para las dos, una tarea vieja se leería como una en la que nunca se entregó
   * nada, que es justo lo contrario de lo que pasó.
   */
  artifacts?: Producido[] | null;
};

export type Session = {
  id: string;
  provider: string;
  /** El material adjunto a esta tarea, por id de fuente. */
  sources?: string[];
  /** Fuentes heredadas del proyecto que esta tarea deja fuera. */
  excluded_sources?: string[];
  model: string | null;
  effort: string | null;
  /** Cuánto se aprobó a mano. `null` en las tareas anteriores a este control. */
  permission_mode?: string | null;
  /** Ver `SessionRow.subagent`. */
  subagent?: string | null;
  parent?: string | null;
  /** Con qué criterio trabaja. Ver `SessionRow.agent`. */
  agent?: string | null;
  /** Si esta sesión es el chat persistente de un encargado, no una tarea. */
  chat_de_agente?: boolean;
  agent_thread?: boolean;
  turns: Turn[];
  /** Solo en una archivada cuyo CLI aún tiene la transcripción (`chat::cli_transcript`). */
  transcript?: TranscriptOrigin | null;
  /** Con qué contestó la última vez una tarea raíz en la que nadie eligió modelo (`sessions::OpenedSession`). */
  observed_model?: string | null;
  /** Solo de `load_history`: qué tramo de la transcripción entera son estos `turns`. */
  history?: HistoryPage | null;
  /** Su máquina está apagada: esto es lo último que se leyó de ella (su rebanada, `@terminus/fleet`). */
  offline?: { machine: string } | null;
  /** Con `provider_handoff_v1`: si la tarea puede cambiar de CLI. Ausente es que no. */
  can_hand_over?: boolean;
  /** La clave `chat.handover.*` que explica el rechazo, cuando lo hay. */
  hand_over_blocked?: string | null;
};

/** De qué archivo del CLI salió lo que dijo el agente, y en cuántas respuestas. */
export type TranscriptOrigin = {
  provider: string;
  file: string;
  from_cli: number;
  agent_turns: number;
};

/**
 * El modelo que se muestra al abrir una tarea: el elegido o, si nadie eligió,
 * el último que se observó contestando. Solo la que nunca contestó deja el
 * selector vacío para que el CLI use el suyo.
 */
export function modeloDeSubtarea(session: Session): string | null {
  if (session.model) return session.model;
  if (!(session.parent || session.subagent)) return session.observed_model ?? null;
  for (let i = session.turns.length - 1; i >= 0; i--) {
    const turno = session.turns[i];
    if (turno.role === "agent" && turno.model) return turno.model;
  }
  return null;
}

// Líneas de sistema que Rust guarda sin texto y la ventana compone.
const LINEAS_SIN_PROSA = new Set([
  "task_launched",
  "task_finished",
  "task_finished_read",
  "task_chain_limit",
  "woke_by_tasks",
  "respondido",
  "delivery_pending",
  "shell_reply",
]);

function aRazonamiento(bloques: readonly TurnReasoning[]): Razonamiento[] {
  return bloques.map((b) => ({
    text: b.text,
    ...(b.duration_ms != null ? { durationMs: b.duration_ms } : {}),
    ...(b.truncated ? { truncated: true } : {}),
  }));
}

/**
 * La transcripción guardada, tal como se pinta.
 *
 * **El rastro va delante de la respuesta que ayudó a producir.** No reproduce el
 * entrelazado exacto —en vivo el agente escribe, usa una herramienta y sigue
 * escribiendo, y el turno guarda un solo texto porque los deltas se concatenan—,
 * pero deja los pasos pegados a lo que explican, que es para lo que se leen.
 */
/**
 * `start`: la posición del primer turno en la transcripción entera. Cada mensaje lleva
 * `clave`, su identidad entre lecturas: sin ella, anteponer una página renumera el hilo.
 */
export function transcripcion(turns: Turn[], start = 0): Msg[] {
  // Todo lo ofrecido en la sesión hasta este turno. Contra el turno anterior, uno
  // guardado con la lista vacía porque no llegó a lanzarse haría anunciar otra
  // vez todo su material.
  //
  // `null` es «todavía no hay con qué comparar», y ahí no se anuncia nada: en
  // una tarea empezada antes de que esto se guardara, tratar el vacío como el
  // conjunto previo pintaría todo su material como recién llegado.
  let ofrecido: Set<string> | null = null;
  // Las respuestas guardadas antes de que su fila llevara modelo y proveedor
  // los toman del turno de la persona que las lanzó (`closing.rs`).
  let delLanzamiento: Pick<Turn, "reported_model" | "model_vendor"> = {};

  const mensajesDe = (t: Turn): Msg[] => {
    if (t.role === "user") delLanzamiento = t;
    const cambio: Msg[] = [];
    if (t.sources) {
      if (ofrecido) {
        const entraron = t.sources.filter((id) => !ofrecido!.has(id));
        if (entraron.length > 0) {
          cambio.push({ role: "system", text: "", contexto: { entraron } });
        }
      }
      ofrecido = new Set([...(ofrecido ?? []), ...t.sources]);
    }
    // El `ok` vuelve del disco: sin él la transcripción reabierta perdía
    // las marcas de los pasos que devolvieron error y contaba otra cosa
    // que la de en vivo. La salida no vuelve —no se guarda—, así que la
    // fila se abre y enseña el comando, no su cuerpo.
    const paso = (h: Tool): Msg => ({
      role: "system",
      text: h.name,
      meta: "usó",
      paso: pasoDe(h.name, h.target, { ok: h.ok ?? null, mcpApp: h.mcp_app ?? mcpCallFromName(h.name) }),
    });
    const visible = (h: Tool | undefined) =>
      h !== undefined && !isQuestionFile(h.target);
    const pasos: Msg[] = (t.tools ?? []).filter(visible).map(paso);
    if (t.shell) {
      return [
        ...cambio,
        {
          role: "system" as const,
          text: t.text,
          meta: "usó",
          shell: {
            cwd: t.shell.cwd,
            output: t.shell.output,
            exit_code: t.shell.exit_code,
            truncated: t.shell.truncated,
            duration_ms: t.shell.duration_ms,
          },
          paso: pasoDe("command_execution", t.text, {
            ok: t.shell.exit_code === 0,
            detalle: {
              kind: "output",
              text: t.shell.output,
              exit_code: t.shell.exit_code,
              truncated: t.shell.truncated,
              cwd: t.shell.cwd,
            },
          }),
        },
      ];
    }
    // Lo que el turno preguntó y lo que se contestó vuelve con él: una pregunta
    // que no sobrevive a cerrar la app deja la sesión esperando para siempre,
    // sin nadie que sepa que espera.
    const relevo = t.role === "user" ? relevoDe(t.text) : null;
    const propio: Msg = {
      role: t.role as Msg["role"],
      text: relevo ? relevo.texto : t.text,
      // El JSON crudo de las herramientas no se lee en el chat: solo se ofrece
      // lo que le falta a la conversación, como un texto demasiado largo.
      historyRefs: t.history_refs?.filter((ref) => ref.pointer !== "/tools"),
      ...(relevo ? { relevo: { titulo: relevo.titulo } } : {}),
      task_mentions: t.task_mentions,
      // Un aviso de cierre —una interrupción— vive en el turno, no en el evento
      // de la ventana. Sin esto desaparecía al reabrir la tarea y una respuesta
      // cortada se leía como completa.
      meta: t.meta ?? undefined,
      // **Sin este renglón la clase se guarda y no se ve**, y no da error: el
      // campo es opcional y su ausencia se lee como «este turno no falló». Es el
      // mismo camino por el que pasó `code`.
      fallo: t.fallo ?? undefined,
      quota: t.quota ?? undefined,
      resume: t.resume ?? undefined,
      author: t.author ?? undefined,
      encargado: t.agent ?? undefined,
      channel: t.channel ?? undefined,
      // El sobre se relee del disco con el turno. Sin estos tres renglones la
      // transcripción reabierta pierde a quién se entregó, dónde se contesta y
      // cuántos saltos lleva, y la fila de reenvío se queda sin nada que decir.
      recipients: t.recipients ?? undefined,
      reply_to: t.reply_to ?? undefined,
      // Sin este renglón el mensaje de otra tarea se relee como de la persona.
      fromTask: t.from_task ?? undefined,
      hops: t.hops ?? undefined,
      woke_by: t.woke_by ?? undefined,
      turno: t.id ?? undefined,
      razonamiento: t.reasoning?.length ? aRazonamiento(t.reasoning) : undefined,
      // Sin este renglón el punto de corte de un fork nativo no existe para
      // la pantalla, y todas las respuestas se leerían como turnos en vuelo.
      nativeId: t.native_id ?? undefined,
      preguntas: t.questions ?? undefined,
      respuestas: t.answers ?? undefined,
      permission: t.permission ?? undefined,
      duration_ms: t.duration_ms ?? undefined,
      at: t.at ?? undefined,
      // **Sin esto el bloque de cambios del turno no se pintaba nunca.** Rust lo
      // guardaba, el tipo lo declaraba y el componente lo esperaba; lo que
      // faltaba era copiarlo aquí, que es por donde pasa todo lo que se lee del
      // disco. No dio error en ningún sitio: `code` es opcional, así que la
      // ausencia se lee como «este turno no tocó código».
      code: t.code ?? undefined,
      // Y lo mismo vale para los archivos: este renglón es todo lo que separa
      // «el adjunto está guardado» de «el adjunto se ve».
      attachments: t.attachments ?? undefined,
      agent: t.author?.kind !== "person" ? t.author?.kind : undefined,
      images: [
        ...new Set((t.tools ?? []).flatMap((h) => h.images ?? [])),
      ],
      // El proveedor y el modelo con los que se contestó, para la línea del
      // turno. Van en `propio`, que es el mensaje que cierra el turno; en un
      // turno con el orden registrado lo comparten los globos, y ahí el que
      // importa es este, porque es el que lleva la fila de acciones. Sin esto la
      // línea no puede decir de dónde salió la respuesta, y el dato ya viaja
      // desde Rust.
      model_vendor: t.model_vendor ?? delLanzamiento.model_vendor ?? undefined,
      // El observado antes que el pedido: el pedido puede ser un alias sin
      // versión («opus») y el del lanzamiento sí la trae («claude-opus-5-5»).
      reported_model: t.reported_model ?? delLanzamiento.reported_model ?? t.model ?? undefined,
    };
    // Lo que el turno entregó, **detrás de la respuesta y no delante**: al
    // revés que los pasos, no es lo que el agente hizo para contestar sino el
    // resultado, y ahí es donde estaba en vivo cuando ocurrió.
    const entrega: Msg[] = t.artifacts?.length
      ? [{ role: "system", text: "", artefactos: t.artifacts }]
      : [];
    // Un turno sin texto que tampoco preguntó ni contestó —el agente miró cosas
    // y murió antes de responder— aporta sus pasos y ningún globo vacío: es
    // justo el que hay que investigar.
    // `attachments` cuenta: mandar una captura sin escribir nada es un mensaje,
    // y sin esta condición se descartaba entero por no tener texto.
    if (
      !t.text &&
      !LINEAS_SIN_PROSA.has(t.meta ?? "") &&
      !propio.attachments &&
      !propio.preguntas &&
      !propio.respuestas &&
      !propio.permission &&
      !propio.historyRefs?.length &&
      !propio.razonamiento
    )
      return [...cambio, ...pasos, ...entrega];
    // Con el orden registrado se pinta el orden. Lo que el turno arrastra
    // —lo que preguntó, lo que cambió, cuánto tardó— va en el ÚLTIMO mensaje:
    // es el que cierra el turno, y repartirlo pintaría cada cosa varias veces.
    const enOrden = entrelazado(t, propio, paso, visible, t.reasoning ?? []);
    if (enOrden) return [...cambio, ...enOrden, ...entrega];
    return [...cambio, ...pasos, propio, ...entrega];
  };
  return turns.flatMap((t, k) => {
    const turno = t.id ?? `#${start + k}`;
    let pieza = 0;
    return mensajesDe(t).map((m) => ({ ...m, clave: m.contexto ? `${turno}:contexto` : `${turno}:${pieza++}` }));
  });
}

/**
 * El turno pintado en su orden, o `null` si no se registró.
 *
 * Los mensajes anteriores al último son globos pelados: llevan de quién son y
 * nada más. Sin esto, un turno con tres mensajes pintaría tres veces sus
 * preguntas, sus cambios de código y su entrega.
 */
function entrelazado(
  t: Turn,
  propio: Msg,
  paso: (h: Tool) => Msg,
  visible: (h: Tool | undefined) => boolean,
  reasoning: readonly TurnReasoning[],
): Msg[] | null {
  const piezas = t.pieces ?? [];
  if (piezas.length === 0) return null;
  const ultimoTexto = piezas.reduce(
    (acc, p, i) => ("text" in p ? i : acc),
    -1,
  );
  // Sin texto no hay dónde colocar el orden: el turno se pinta como antes.
  if (ultimoTexto < 0) return null;
  // La respuesta es lo dicho tras la última herramienta, como `orchestration::mensaje_final`.
  let primeroFinal = ultimoTexto;
  while (primeroFinal > 0 && "text" in piezas[primeroFinal - 1]) primeroFinal--;
  const respuesta = piezas
    .slice(primeroFinal, ultimoTexto + 1)
    .map((p) => ("text" in p ? p.text.trim() : ""))
    .filter(Boolean)
    .join("\n\n");
  // El razonamiento va pegado al mensaje que lo rodea: al texto anterior si
  // lo sigue, y si no al siguiente. Los textos del cierre se juntan en `propio`.
  const destino = (before: number) => {
    const desde = Math.min(Math.max(0, before), piezas.length);
    const previo = desde > 0 ? piezas[desde - 1] : undefined;
    if (previo && "text" in previo) return desde - 1 >= primeroFinal ? ultimoTexto : desde - 1;
    for (let i = desde; i < piezas.length; i++) {
      if ("text" in piezas[i]) return i >= primeroFinal ? ultimoTexto : i;
    }
    return ultimoTexto;
  };
  const porPieza = new Map<number, Razonamiento[]>();
  for (const r of reasoning) {
    const bloque: Razonamiento = {
      text: r.text,
      ...(r.duration_ms != null ? { durationMs: r.duration_ms } : {}),
      ...(r.truncated ? { truncated: true } : {}),
    };
    const clave = destino(r.before_piece ?? 0);
    porPieza.set(clave, [...(porPieza.get(clave) ?? []), bloque]);
  }
  const out: Msg[] = [];
  piezas.forEach((pieza, i) => {
    if ("tool" in pieza) {
      const h = (t.tools ?? [])[pieza.tool];
      if (visible(h)) out.push(paso(h));
      return;
    }
    if (i === ultimoTexto) {
      out.push({ ...propio, text: respuesta, razonamiento: porPieza.get(i) });
      return;
    }
    if (i >= primeroFinal) return;
    out.push({
      role: "agent",
      text: pieza.text,
      avanceDe: t.id ?? undefined,
      author: t.author ?? undefined,
      agent: t.author?.kind !== "person" ? t.author?.kind : undefined,
      razonamiento: porPieza.get(i),
    });
  });
  return out;
}
