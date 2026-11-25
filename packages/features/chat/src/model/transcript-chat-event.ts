/** Los eventos del turno: Rust normaliza claude y codex a estas formas. */
import type { SenderTask } from "../../../../ui/src/lib/recipients.ts";
import type { Detalle } from "../../../../ui/src/lib/steps.ts";
import type { PermissionOrigin } from "./messageTypes";

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
    /** Su motor cambió la cola (`chat_queue_v1`): se relee con `load_queue`. No se pinta. */
    | "queue"
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
  /** Identidad reservada por el motor antes de emitir; coincide con Turn.id al guardar. */
  segment_id?: string;
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
