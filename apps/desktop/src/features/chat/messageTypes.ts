import type { HistoryRef } from "@terminus/protocol";
import type { CodeRange } from "../../lib/model";
import type { Recipient, SenderTask } from "../../lib/recipients";
import type { Paso } from "../../lib/steps";
import type { TaskMention } from "../../lib/taskMentions";
import type { Producido } from "./Delivery";
import type { CambioPorCupo, FalloDelTurno } from "./failures";
import type { Pregunta, Respuesta } from "./Questions";
/**
 * Quién dijo un turno: lo arma Rust a partir de la cuenta del agente o del
 * nombre local, aquí no se completa ni se adivina nada. El login de GitHub
 * no entra. `name` en `null` es un estado real —Codex no publica
 * identidad—; la pantalla no dice un nombre en ese caso.
 */
export type Author = {
  /** "person" o el id del agente. */
  kind: string;
  name: string | null;
  verified_by: string | null;
  account: string | null;
};
/** Un bloque de lo que el agente pensó. No es su respuesta. */
export type Razonamiento = {
  text: string;
  /** Cuánto duró, cuando el turno guardado lo trae. */
  durationMs?: number;
  /** El motor cortó el bloque por su tope. */
  truncated?: boolean;
};
export type Msg = {
  historyRefs?: HistoryRef[];
  role: "user" | "agent" | "system";
  text: string;
  task_mentions?: TaskMention[];
  meta?: string;
  /**
   * Lo que el agente pensó antes de escribir. Va aparte de `text`: el
   * razonamiento no es la respuesta ni entra en copiar, buscar o exportar.
   */
  razonamiento?: Razonamiento[];
  /**
   * Cuando `meta === "fallo"` y se pudo clasificar. Ausente en una
   * interrupción —que no es un fallo del proveedor— y en los turnos escritos
   * antes de que esto se guardara, que siguen leyéndose por `text`.
   */
  fallo?: FalloDelTurno;
  /** Con qué cuenta siguió tras quedarse sin cupo (`meta === "cupo"`). */
  quota?: CambioPorCupo;
  /** Las tareas que despertaron a la Bandeja (`meta === "woke_by_tasks"`). */
  woke_by?: string[];
  resume?: string;
  /**
   * Lo que el agente hizo, cuando el mensaje es un paso (`meta === "usó"`).
   * Va colgado del mensaje y no en una lista aparte: el orden importa, el
   * rastro se lee contra la respuesta que ayudó a producir; dos listas
   * paralelas habría que volver a entrelazarlas para pintarlas.
   */
  paso?: Paso;
  /** Id del turno cerrado del que este mensaje es avance, no respuesta. */
  avanceDe?: string;
  shell?: {
    cwd: string;
    output: string;
    exit_code: number | null;
    truncated: boolean;
    duration_ms?: number;
  };
  /**
   * Id del turno, cuando lo tiene. Es lo que permite que una respuesta apunte a
   * la pregunta que la provocó sin depender de que estén una debajo de la otra.
   */
  turno?: string;
  /** Su identidad entre lecturas: turno y pieza (`transcripcion`). Un mensaje vivo aún no la tiene. */
  clave?: string;
  /** El segmento del motor al que pertenece este mensaje; se oculta cuando el historial ya lo contiene. */
  tramo?: string;
  /**
   * Lo que la persona metió en el turno vivo con un motor que no devuelve el
   * turno guardado: `tras` es el último turno del disco cuando se metió, y lo
   * guardado después con el mismo texto es él (`mensajesDelHilo`).
   */
  inyectado?: { tras: string | null };
  /** La subtarea a la que la persona escribió por su padre. Ver `relevoDe`. */
  relevo?: { titulo: string };

  nativeId?: string;
  /**
   * El mensaje nativo del agente al que pertenece este globo, cuando lo
   * publica (`message_id` del evento). Solo lo llevan los globos vivos de los
   * agentes que lo mandan —ACP—: es lo que permite que un fragmento tardío se
   * pegue a su mensaje en vez de abrir otro. Ver `anexarDelta`.
   */
  nativeMessageId?: string;
  /**
   * Lo que la persona adjuntó a este mensaje, por ruta relativa a la carpeta de
   * trabajo. Solo lo llevan los turnos de la persona. Ver `Attachments.tsx`.
   */
  attachments?: string[];
  /** Lo que el agente necesitó saber y no pudo deducir. */
  preguntas?: Pregunta[];
  /** Petición viva que el agente espera dentro de este mismo turno. */
  questionRequestId?: string;
  /** Lo que se contestó, y a qué turno. */
  respuestas?: Respuesta[];
  /** Tiempo de trabajo activo del agente, ausente en tareas antiguas. */
  duration_ms?: number;
  /** Cuándo quedó escrito el turno; ausente en tareas antiguas. */
  at?: number;
  /** Autoridad ejercida por una persona. */
  permission?: PermissionDecision;
  author?: Author | null;
  /** HandlerDefinition que escribió este input. Ausente si lo escribió la persona. */
  encargado?: string | null;
  /**
   * Por qué canal lo escribió la persona, si no fue la ventana
   * (`Turn::channel`). No es autor: el globo no lleva cara.
   */
  channel?: string | null;
  /**
   * A quién iba dirigido este input (`Turn::recipients`). Va en una línea de
   * dirección encima de los adjuntos, no como uno más: un destinatario no es
   * algo que se adjuntó, es a quién se le entregó.
   */
  recipients?: Recipient[];
  /**
   * Dónde se contesta este mensaje (`Turn::reply_to`), cuando no es aquí.
   * Sin esto, una respuesta aparece en otra pantalla y deja a quien la
   * espera mirando donde no va a pasar nada.
   */
  reply_to?: { folder: string; task: string } | null;
  /**
   * La tarea que escribió este mensaje por el CLI (`Turn::from_task`). Sin
   * esto, un mensaje de otra tarea sale a la derecha como si fuera de la persona.
   */
  fromTask?: SenderTask | null;
  /**
   * Cuántas entregas encadenadas lleva (`Turn::hops`). Se pinta y no se
   * limita: es lo único que hace visible un ciclo entre encargados.
   */
  hops?: number | null;
  /** Agente dueño del turno; no se sustituye por el selector actual. */
  agent?: string;
  /**
   * El proveedor de modelos con el que corrió el turno («OpenCode»,
   * «OpenCode Go»). Lo guarda el cierre; la línea del turno lo enseña tras la
   * hora. Ausente en los turnos anteriores al campo.
   */
  model_vendor?: string;
  /**
   * El modelo que reportó el CLI al cerrar, para el turno que lo observó. Es
   * distinto del modelo elegido ahora: la transcripción guarda con qué se
   * contestó, no con qué se contestaría.
   */
  reported_model?: string;
  /** Solo en los pasos de herramienta: sobre qué actuó. */
  target?: string | null;
  /**
   * Qué material entró por primera vez, en este punto de la conversación.
   * Por id: el nombre se resuelve al pintar, contra el catálogo de hoy; una
   * fuente renombrada se lee con su nombre de ahora en toda la transcripción,
   * no con dos nombres para la misma cosa.
   */
  contexto?: { entraron: string[] };
  /**
   * Qué código cambió este turno: un par de fotos por árbol de trabajo
   * (`sessions::CodeRange`) por cada sitio en que la tarea escribe —la
   * copia declarada, lo que el agente clonó, la carpeta del proyecto—.
   * Ausente en turnos de persona; vacío es «este turno no tocó código».
   */
  code?: CodeRange[];
  /**
   * Lo que este turno dejó en la carpeta de trabajo. Es un mensaje del hilo
   * y no una marca del turno del agente: puede entregar sin decir nada, o
   * entregar después de haber respondido; colgarlo del globo lo ataría a
   * un texto que puede no existir.
   */
  artefactos?: Producido[];
  /** Resultados visuales que un tool entregó al turno. */
  images?: string[];
};
/**
 * De qué fuente del workspace es el objetivo de un permiso, y si es
 * material que el turno no tiene concedido. Lo resuelve Rust contra la
 * lista de los `--add-dir` (`chat::procedencia_permiso`), no contra los
 * chips: la raíz de gobierno no es un chip y el aviso la acusaba de ajena.
 */
export type PermissionOrigin = {
  /** El nombre de la fuente con su rama, ya compuesto (`context::Source::etiqueta`). */
  etiqueta: string;
  kind: string;
  location: string;
  /** Material del workspace que el turno no tiene concedido. */
  foreign: boolean;
};
export type PermissionDecision = {
  request_id: string;
  tool: string;
  target: string | null;
  allow: boolean;
  when: number;
};
