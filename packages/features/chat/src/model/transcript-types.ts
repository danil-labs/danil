/** Lo que se guarda de un turno y de una tarea, tal como lo lee la ventana. */
import type { HistoryRef } from "../../../../engine-client/src/index.ts";
import type { CodeRange } from "../../../../../apps/desktop/src/lib/model.ts";
import type { Recipient, ReplyTo, SenderTask } from "../../../../ui/src/lib/recipients.ts";
import type {
  CambioPorCupo,
  FalloDelTurno
} from "./failures";
import type { Producido } from "../components/Delivery.tsx";
import type { HistoryPage } from "./history.ts";
import type { Pregunta, Respuesta } from "../components/Questions.tsx";
import type { Author, PermissionDecision } from "./messageTypes";
import type { McpAppCall } from "./transcript-chat-event.ts";

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
type Piece = { text: string } | { tool: number };

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
  task_mentions?: import("../../../../ui/src/lib/taskMentions.ts").TaskMention[];
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
  /** El proveedor de modelos del turno («OpenCode», «OpenCode Go»).
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
