import type { HistoryRef } from "@terminus/protocol";
import type { Preview } from "../artifacts/Preview";
import { HistoryDetails } from "./HistoryDetails";
import type { InvokeOptions } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import ArrowDown from "lucide-solid/icons/arrow-down";
import ArrowUp from "lucide-solid/icons/arrow-up";
import Check from "lucide-solid/icons/check";
import ChevronRight from "lucide-solid/icons/chevron-right";
import Copy from "lucide-solid/icons/copy";
import CornerDownLeft from "lucide-solid/icons/corner-down-left";
import FileText from "lucide-solid/icons/file-text";
import Maximize2 from "lucide-solid/icons/maximize-2";
import MessageCircleQuestion from "lucide-solid/icons/message-circle-question-mark";
import Paperclip from "lucide-solid/icons/paperclip";
import Split from "lucide-solid/icons/split";
import SquareTerminal from "lucide-solid/icons/square-terminal";
import Square from "lucide-solid/icons/square";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import X from "lucide-solid/icons/x";
import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  For,
  Index,
  type JSX,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  type Signal,
  Switch,
  untrack,
  useContext,
} from "solid-js";
import { Dynamic, Portal } from "solid-js/web";
import type { ThreadSearchTarget } from "./ThreadSearch";
import { sharedLazy } from "../../lib/sharedLazy";
import { taskChatPresentation } from "./TaskChatPresentation";
import type { OlderState } from "./history";
import { createBlockKeys, estimateBlock } from "./threadRows";
import type { VirtualThreadApi } from "./VirtualThread";
import { CHUNK, chunkAt, chunkIds, chunkOf, chunkStart, headChunk, tailChunk, type Lectura } from "./threadWindow";
import { workLabel } from "../projects/branchLabel";
import { sangrarTerminal } from "./terminalIndent";
import { ponerLanzamiento } from "./launchGroups";
import { FIN_DE_ARCHIVO, TECLAS_DE_TERMINAL, pideClave } from "./commandInput";
import { claseDelTramo, finishEdit, highlightSpans, placeLabel, referenceId, searchPlaces, searchTasks, taskLabel, taskTarget, type MentionTarget, type PendingEdit, type PlaceCandidate, type TextEdit, type TaskCandidate, type TaskMention, tramosDelMensaje } from "../../lib/taskMentions";
import {
  groupRecipients,
  type Recipient,
  type RecipientCandidate,
  recipientId,
  recipientLabel,
  type SenderTask,
} from "../../lib/recipients";
import { base64De, copyText, imagenPegada } from "../../lib/clipboard";
import { capabilities } from "../../lib/platform";
import { atenderElCampo, enfocar, enfocarSiNadieEscribe } from "../../lib/focus";
import { df } from "../../lib/format";
import { t } from "../../lib/i18n";
import { imagenInerte } from "../../lib/links";
import { CarruselDeImagenes } from "../../ui/EnlargeableImage";
import {
  activeTrigger,
  applySuggestion,
  type MentionSource,
  type MentionSources,
} from "../../lib/mentions";
import type {
  Agent,
  AgentModels,
  CodeRange,
  HandlerStatus,
  ModoDePermiso,
  Source,
} from "../../lib/model";
import { AstroAvatar } from "../projects/AstroAvatar";
import {
  type CatalogosDeModelos,
  nombreDeModelo,
  type OpcionDeModelo,
  opcionesDeModelos,
} from "../../lib/models";
import { prosa } from "../../lib/prose";
import {
  type CliCommand,
  slashPick,
  slashRows,
  slashSuggestions,
  type Skill,
} from "../../lib/skills";
import {
  type Clase,
  cuentaDelTramo,
  partesDelTramo,
  formatearDuracion,
  nombreDe,
  type Paso,
  pasoDe,
  pasoDePermiso,
  pasoDeSistema,
} from "../../lib/steps";
import type { Superficie } from "../../lib/surfaces";
import type { Ventana } from "../../lib/usage";
import { cn } from "../../lib/utils";
import { Badge } from "../../ui/Badge";
import { type AlMargen, PanelAlMargen } from "./SideQuestion";
import Pencil from "lucide-solid/icons/pencil";
import { Button } from "../../ui/Button";
import { Dialog, DialogContent, DialogTitle } from "../../ui/Dialog";
import { asFailure, type Failure, FailureNote, prosaDe } from "../../ui/Failure";
import { MarcaAgente } from "../../ui/icons";
import { FileMachine } from "../../ui/fileMachine";
import { WorkFace } from "./workFace";
import { Markdown } from "../../ui/Markdown";
import { createVisualBudget, type VisualBudget } from "./visualBudget";
import ChatVisual from "./ChatVisual";
import { splitChatVisuals, type ChatVisual as Visual } from "./visualDirective";
import type { NextStepsPart } from "../../lib/nextSteps";
import { splitNextSteps, stripNextSteps, lastSentAt, usedSince } from "../../lib/nextSteps";
import NextSteps from "./NextSteps";
import { Skeleton } from "../../ui/Skeleton";
import { MarcaFuente } from "../../ui/sources";
import { Textarea } from "../../ui/Textarea";
import {
  RETARDO_TOOLTIP,
  TooltipContent,
  TooltipRoot,
  TooltipTrigger,
} from "../../ui/Tooltip";
import Adjuntos, { Adjunto, rodarEnHorizontal } from "./Attachments";
import VentanaDeContexto from "./ContextWindow";
import Entrega, { type Producido } from "./Delivery";
import {
  type CambioPorCupo,
  type FalloDelTurno,
  avisoDeEncargado,
  cupoResuelveElFallo,
  gestoDeLaFila,
  prosaDelCambioPorCupo,
  prosaDelFallo,
} from "./failures";
import { citaInforme, esFilaDeLaBandeja, idDeLaEntregaAntigua, prosaDeLaFila } from "./inboxRows";
import SalidaDeComando from "./CommandOutput";
import { claseDeSalida, comandoDe, esSalidaDeComando } from "./slashOutput";
import BloqueDeInterrupcion from "./InterruptionBlock";
import ColaDeMensajes, { type ColaDeMensajesProps } from "./MessageQueue";
import McpAppView from "./McpAppView";
import { Select } from "../../ui/Select";
import SelectorDeModelo from "./ModelPicker";
import SelectorDeModo from "./ModePicker";
import { AltoMonotono } from "./MonotonicHeight";
import { MARCA_SIN_ELEGIR } from "./marks";
import { siguienteModo } from "./modes";
import { inyectable, seMandaSinSuperficie } from "./queue";
import TarjetaDeTerminal, { type ComandoEnVivo } from "./ShellCard";
import { HOLGURA, seguirElFondo } from "./paste";
import YourMessages, { type InputMessage } from "./YourMessages";
import RegistroPreguntas from "./QuestionLog";
import Preguntas, {
  type AlmacenDePreguntas,
  type Pregunta,
  type Respuesta,
  type RespuestaEnviada,
} from "./Questions";
import Alcance from "./Scope";
import Suggestions, { type Suggestion } from "./Suggestions";
import LineaDeTiempo, { SUPERFICIE_DE_EJECUCION } from "./Timeline";
import EstadoDelTurno from "./TurnStatus";
import { WithMentions } from "./WithMentions";
import { Spinner } from "../../ui/Spinner";

// Chunk aparte: el bloque de razonamiento solo lo carga un turno que lo trae.
const Reasoning = sharedLazy(() => import("./Reasoning"));

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

export type { CambioPorCupo, FalloDelTurno };

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
  /** El turno guardado en el que el motor ya escribió este mensaje vivo (`segment_saved`). */
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
   * El proveedor de modelos con el que corrió el turno («OpenCode Zen»,
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

export type PermissionRequest = {
  session: string;
  workspace?: string;
  requestId: string;
  revision?: number;
  durableId?: string;
  /** Orden de llegada por evento: decide qué conserva una relectura que aún no lo trae. */
  llegada?: number;
  tool: string;
  target: string | null;
  origin: PermissionOrigin | null;
};

export type PermissionDecision = {
  request_id: string;
  tool: string;
  target: string | null;
  allow: boolean;
  when: number;
};

/** Un bloque de la transcripción: un mensaje, o una tira de pasos plegable. */
type Bloque =
  | { tipo: "msg"; msg: Msg; i: number }
  | { tipo: "pasos"; pasos: Paso[]; i: number }
  | { tipo: "trabajo"; pasos: Paso[]; msg: Msg; i: number; avance?: Avance[] };

/** Un tramo de avance de un turno cerrado: lo que hizo y lo que dijo antes de responder. */
type Avance = { pasos: Paso[]; msg: Msg };

type BloqueDeMensaje = Extract<Bloque, { tipo: "msg" }>;
type BloqueDePasos = Extract<Bloque, { tipo: "pasos" }>;
type BloqueDeTrabajo = Extract<Bloque, { tipo: "trabajo" }>;

/**
 * Lo que la capa de color y el campo tienen que pintar igual: borde, padding,
 * tamaño, interlínea, letra y el hueco de la barra. Con un valor distinto en
 * uno de los dos, el color cae fuera de las letras y el cursor deja de coincidir.
 * El tamaño va en rem: en px, ⌘+/⌘− agranda el resto y este campo se queda.
 * `font-family: inherit` le gana al textarea nativo, que si no cae a la del sistema.
 */
const METRICA_DEL_CAMPO =
  "border border-transparent px-2 py-1.5 text-ui leading-[1.4] [font-family:inherit] [scrollbar-gutter:stable]";
// Del mismo tipo que el `inherit` de arriba, para que `cn` lo reemplace.
const FUENTE_DE_TERMINAL = "[font-family:var(--font-mono)] [tab-size:4]";
const archivosDelNavegador = () => import("./browserFiles");

const mensajeDe = (bloque: Bloque): BloqueDeMensaje | null =>
  bloque.tipo === "msg" ? bloque : null;
const pasosDe = (bloque: Bloque): BloqueDePasos | null =>
  bloque.tipo === "pasos" ? bloque : null;
const trabajoDe = (bloque: Bloque): BloqueDeTrabajo | null =>
  bloque.tipo === "trabajo" ? bloque : null;
// Una prop que también lee otra señal no puede leer el accesor de su `Match`: corre antes de que se desmonte.
const fromWork = <T,>(block: Bloque, read: (work: BloqueDeTrabajo) => T, otherwise: T): T => {
  const work = trabajoDe(block);
  return work ? read(work) : otherwise;
};
// Lo que lee un trabajo en el instante en que su sitio ya es otro bloque y aún no se desmonta.
const SIN_MENSAJE: Msg = { role: "agent", text: "" };
const SIN_AVANCE: Avance[] = [];

export type ChatProps = {
  onSearchReady?: (target: ThreadSearchTarget | null) => void;
  msgs: Msg[];
  /**
   * Cuál de las conversaciones es esta: la clave de la tarea abierta, `""`
   * mientras todavía no tiene id. No es el id de la tarea para usarlo como
   * tal: la transcripción no conoce proyectos ni tareas —trabaja con
   * mensajes—, esa frontera es la que deja `onVerCambios` fuera.
   */

  /**
   * Lo que hace falta aquí es más pequeño: saber cuándo lo de delante deja
   * de ser la misma conversación. Esta caja no se desmonta al cambiar de
   * tarea; sin esto el desplazamiento del hilo anterior se queda puesto y
   * la tarea nueva abre por donde iba la otra.
   */
  conversacion: string;
  /** Una tarea que ya existe pero no tiene mensajes: se ve como «Nueva tarea». */
  sinEmpezar?: boolean;
  /** Dónde se dejó de leer la última vez que este hilo estuvo montado. */
  lectura?: Lectura | null;
  /** Recibe al desmontar dónde se estaba leyendo, o `null` si seguía al fondo. */
  onLectura?: (lectura: Lectura | null) => void;
  /**
   * El agente del chat persistente o del borrador de una tarea nueva.
   */
  chatEncargado?: string | null;
  agentDraft?: boolean;
  recentTasks?: JSX.Element;
  agentTasks?: JSX.Element;
  delegatedTask?: (reference: SenderTask) => JSX.Element;
  coordinator?: JSX.Element;
  /** The task's files panel is open beside the chat: the composer loses its right margin. */
  besideFiles?: boolean;
  /** La máquina de la tarea si no es la de la ventana: los archivos del chat se leen allí. */
  machine?: string;
  chatEstado?: HandlerStatus;
  /** Cómo se le llama y con qué cara, si eligió otras en su perfil. */
  chatName?: string | null;
  chatDescription?: string | null;
  chatBody?: string | null;
  /** El agente de la tarea: su animación es el indicador del trabajo en curso. */
  workAgent?: string | null;
  /** Ruta de su imagen propia. Gana al cuerpo. */
  chatAvatar?: string | null;
  /** La cara que eligió cada encargado que firma o recibe un mensaje. */
  bodyOf?: (name: string) => string | null;
  avatarOf?: (name: string) => string | null;
  /** Su fondo, ya leído como `data:` URI, y cuánto lo tapa el velo. */
  /** Abre su perfil en esta misma pestaña. Sin él, la cabecera no es un botón. */
  onOpenProfile?: () => void;
  /**
   * Que la transcripción viene, que no es lo mismo que no haberla. `msgs`
   * vacío contesta a las dos cosas y se pintan al revés: una conversación
   * nueva se abre centrada, una que está llegando se queda donde va a
   * aparecer.
   */

  /**
   * Sin esta distinción, cambiar de chat pinta el estado de conversación
   * nueva durante la lectura del disco y la caja viaja al centro y vuelve
   * al fondo. El salto del propio hilo lo cubre `lib/paste.ts`.
   */
  cargando?: boolean;
  /** Si hay turnos anteriores a lo cargado que el motor puede dar por páginas. */
  masAntiguos?: boolean;
  masRecientes?: boolean;
  onRecientes?: () => void | Promise<void>;
  /** Pide la página anterior; resuelve con lo que la pone en el hilo, o `null`. */
  onAntiguos?: () => Promise<(() => void) | null>;
  /** Cómo va la página anterior: un fallo se queda a la vista hasta reintentar. */
  estadoAntiguos?: OlderState;
  /** Si alguien lee lejos del final: una cola nueva no le quita lo que lee. */
  onLeyendo?: (leyendo: boolean) => void;
  busy: boolean;
  stopping: boolean;
  agents: Agent[];
  /**
   * Con qué proyecto se trabaja. Solo se ofrece al empezar: una sesión pertenece
   * a un proyecto, y cambiarlo a mitad de la conversación no la mueve — la
   * abandona. Elegir es parte de abrir, no de seguir.
   */
  proyecto: JSX.Element;
  /**
   * Abre el panel de archivos de esta tarea en «Cambios». Lo compone
   * `App.tsx`: el chat no conoce ids de proyecto y sesión —trabaja con
   * mensajes—. Sin él, «Editó N archivos» es solo texto.
   */
  onVerCambios?: () => void;
  agent: string;
  modelOptions?: { headers: Record<string, string> };
  /**
   * Lo que se puede elegir para trabajar. `null` mientras no se ha leído.
   * Ya viene filtrado por `superficies.paraElMenu`: lo utilizable, más
   * aquello con lo que corre la tarea abierta. Lo que no tiene autenticación
   * no llega hasta aquí — el catálogo de lo que existe está en Configuración.
   */
  superficies: Superficie[] | null;
  superficie: string;
  /**
   * Llevar a conectar algo. Es la salida del estado vacío, lo primero que
   * ve alguien en su primer arranque: sin nada autenticado no hay ni una
   * entrada que ofrecer, y un desplegable vacío deja sin saber qué hacer.
   */
  onConectar: () => void;
  /**
   * Volver a mandar lo último que escribió la persona, tal cual. Lo ofrece
   * la fila de un fallo que reintentar puede arreglar —el proveedor caído,
   * la red—, no la de uno que no: un cupo agotado reintentado renueva el
   * mismo castigo.
   */

  /**
   * No se reintenta solo, y es una decisión: un reenvío automático gasta
   * la suscripción de otra persona sin que nadie haga un gesto, en una app
   * cuyo contrato es que lo que sale de la máquina pasa por delante de
   * quien lo aprueba.
   */
  onReintentar: () => void;
  /**
   * El CLI está reintentando contra su proveedor ahora mismo. No es una
   * fila del hilo: cinco intentos serían cinco filas permanentes por algo
   * que se resolvió solo.
   */

  /**
   * Va al indicador de estado del turno, que contesta la única pregunta
   * que hay mientras tanto —«¿esto sigue vivo?»—: un CLI reintentando por
   * dentro durante cuarenta segundos se ve igual que una app colgada.
   */
  reintento: { intento: number; total: number; clase: string } | null;
  /** El agente contestó y solo queda una hija en segundo plano. */
  enFondo?: boolean;
  /**
   * Desde cuándo contesta el turno que se está mirando, en epoch ms.
   * `null` sin turno vivo o cuando la ventana no sabe desde cuándo.
   */
  inicioDelTurno: number | null;
  /** El `!` que ocupa la tarea mientras corre: la tarea trabaja en un comando, no el agente. */
  terminal?: ComandoEnVivo | null;
  /** Dónde corre el siguiente `!`, si la ventana lo sabe por `shell_started`. */
  carpetaDeTerminal?: string | null;
  models: AgentModels | null;
  catalogos: CatalogosDeModelos;
  /**
   * Cuánta memoria de la conversación lleva gastada el agente, según el
   * último turno cerrado. `null` cuando todavía no hay ninguno o el agente
   * no publica ni cuánto cabe.
   */

  /**
   * Va debajo de la caja de escritura y no en la franja de consumo: mide
   * esta conversación, la franja es de la ventana y de las cuentas y ahí el
   * número cambiaría al cambiar de pestaña sin decir de cuál es. Codex y
   * Cline lo ponen en el mismo sitio, junto al compositor.
   */
  ventana: Ventana;
  model: string;
  nativeSubagent?: boolean;
  /** Desde el primer envío, la tarea conserva agente, proveedor y modelo. */
  modelLocked: boolean;
  /** La tarea no ofrece cambiar de agente: el selector lo dice y enseña los demás con candado. */
  agentLocked: boolean;
  /** Por qué no puede, en la lengua de la ventana: el candado lo dice, no esconde la lista. */
  agentLockedReason?: string | null;
  onModel: (opcion: OpcionDeModelo) => void;
  effort: string;
  onEffort: (id: string) => void;
  /**
   * Cuánto se aprueba a mano, y qué modos da el agente elegido. Los tres
   * llegan siempre, con `falta` en los que ese CLI no sostiene: la caja
   * los enseña todos, uno apagado que dice por qué es retroalimentación;
   * esconderlo dejaría a quien viene de otro agente sin saber qué cambió.
   */
  modo: string;
  modos: ModoDePermiso[];
  onModo: (id: string) => void;
  skills: Skill[];
  /** Los que el propio CLI publica. Vacío es que no se pudo saber. */
  commands: CliCommand[];
  /** El comando que el agente de la caja contesta al margen (`list_slash_menu`). */
  sideCommand?: string | null;
  /** La ventana ya decidió que el agente contesta a la salida del último `!`. */
  contestandoALaTerminal?: boolean;
  /** La pregunta al margen de esta tarea, si hay una en pantalla. */
  alMargen?: AlMargen | null;
  onCerrarAlMargen?: () => void;
  onPasarAlHilo?: () => void;
  /**
   * Lo que la tarea alcanza y se puede mencionar. `null` mientras no se ha
   * leído; nunca el disco entero: la frontera de lo mencionable es la
   * misma que la del agente, y hoy la fijan las fuentes adjuntas.
   */
  mentionSources: MentionSources | null;
  taskCandidates?: TaskCandidate[];
  onTaskMenuOpen?: () => void;
  taskMentions?: TaskMention[];
  mentionProject?: string;
  mentionSession?: string | null;
  /** Con varias máquinas, el nombre de cada una (`null`, la de la ventana): la mención guarda dónde vive la tarea. */
  mentionMachineName?: (id: string | null) => string | undefined;
  placeCandidates?: PlaceCandidate[];
  /**
   * Los encargados a los que esta caja puede dirigir el mensaje. Encabezan el
   * menú de `@`: quien escribe una arroba pensando en llamar a alguien llega
   * por un nombre corto que chocaría con el de un archivo, y el material está
   * a una letra más de distancia.
   */
  recipientCandidates?: RecipientCandidate[];
  /** El nombre de la carpeta de la tarea, para la cabecera de los del repositorio. */
  recipientFolder?: string;
  /** A quién va lo que hay escrito ahora mismo. No es material: no se adjunta. */
  recipients?: Recipient[];
  onRecipient?: (name: string, label: string, trigger: import("../../lib/mentions").Trigger) => void;
  onReference?: (target: MentionTarget, label: string, trigger: import("../../lib/mentions").Trigger) => void;
  onMentionHistory?: (redo: boolean) => boolean;
  input: string;
  onInput: (value: string, inputType?: string, edit?: TextEdit) => void;
  /**
   * Manda si no hay turno corriendo, y encola si lo hay — decide quien sabe
   * qué está pasando, no la caja.
   *
   * `false` significa "no arrancó": los adjuntos se conservan.
   */
  onSend: (attachments: string[]) => Promise<boolean>;
  /** Manda una respuesta rápida del agente tal cual, por el camino de `onSend`. */
  onRespuestaRapida?: (texto: string) => Promise<boolean>;
  /**
   * Le teclea al `!` en marcha. `eco` dice si lo escrito se pinta en su
   * tarjeta: una clave no. `false` si ya no había comando que lo recibiera.
   */
  onEntradaDeComando?: (texto: string, eco: boolean) => Promise<boolean>;
  visualScope?: string;
  readVisual?: (file: string) => Promise<string>;
  openVisual?: (file: string) => Promise<void>;
  /**
   * La miniatura de un adjunto ya mandado, de ruta relativa a `data:` URI.
   * Aquí y no dentro de `Adjuntos`: este componente no conoce el proyecto
   * ni la tarea, y dárselos acoplaría la conversación entera a un dato que
   * solo necesita una imagen. `null` si no es imagen o no cabe (`preview::MINIATURA_MAX`).
   */
  onMiniatura: (rel: string) => Promise<string | null>;
  /** El archivo entero, para abrir un PDF o un texto sin salir de la ventana. */
  onPreview: (rel: string) => Promise<Preview | null>;
  onPegarImagen: (mime: string, datos: string, nombre?: string) => Promise<string>;
  /** La máquina del turno acepta documentos además de imágenes. */
  aceptaDocumentos: () => boolean;
  /**
   * Hay una pregunta del agente sin contestar. Cierra la caja a propósito:
   * el agente se quedó esperando en vez de elegir por su cuenta, y seguir
   * escribiendo por otro lado convertiría esa espera en una respuesta que
   * nadie dio.
   */
  esperando: boolean;
  onResponder: (turno: string, enviadas: RespuestaEnviada[]) => Promise<boolean>;
  /** Cerrar la pregunta sin contestarla. */
  onCancelarPregunta: (turno: string) => Promise<void>;
  preguntasAMedias: AlmacenDePreguntas;
  vista: VistaDeLaConversacion;
  /**
   * Sin caja de escritura: la transcripción y nada más. Es lo que deja
   * montar una segunda conversación a la vez —la de una pestaña separada
   * (`lib/panels.ts`)—, y lo que impide que esa segunda escriba.
   */

  /**
   * Con qué agente, modelo, modo y cola se escribe son señales globales de
   * la sesión abierta (`App.tsx`): dos cajas mandarían las dos con lo que
   * eligió una, sin error y sin aviso.
   */

  /**
   * Oculta la caja y el velo de soltar archivos. Las conversaciones
   * inactivas no deben contestar preguntas ni recibir adjuntos por otra.
   */
  soloLectura?: boolean;
  recovery?: JSX.Element;
  /** Detiene el turno por el driver y deja que Rust lo cierre y persista. */
  onStop: () => Promise<void>;
  /**
   * El gate de esta tarea, o `null`. Quien lo elige se asegura de que sea
   * de la tarea abierta (`App.tsx`): un gate al pie de otra conversación
   * pone su comando donde no corresponde. Su procedencia ya viaja resuelta
   * en `origin` —la marcó el turno que la concedió—; aquí solo se pinta.
   */
  permission: PermissionRequest | null;
  permissionError: string | null;
  respondingPermission: boolean;
  onPermission: (permission: PermissionRequest, allow: boolean) => void;
  /** El material adjunto a ESTA tarea. */
  material: Source[];
  materialOptions?: InvokeOptions;
  materialTarget: string;
  materialAvailable: boolean;
  /** Lo que la tarea YA lee. No son pendientes: están guardados en ella. */
  contexto: Source[];
  /** Todo el material del workspace, para poner nombre a los ids que la
   *  transcripción guarda. */
  catalogo: Source[];
  /** Una fuente que entra a la tarea: el agente la lee por `--add-dir`. */
  onAdjuntarFuente: (source: string) => Promise<void>;
  onQuitarFuente: (source: string) => void;
  /**
   * Cambiar de rama sustituye la fuente: su identidad incluye la rama;
   * otra rama es otra fuente. Ver la cabecera de `Alcance`.
   */
  onCambiarRama: (source: Source, rama: string) => Promise<void>;
  /** Abrir lo que el hilo acaba de anunciar, por su ruta dentro de la tarea. */
  onAbrirArtefacto: (rel: string) => void;
  /** Abre la tarea que firmó un mensaje (`Turn::from_task`). */
  onOpenTask?: (folder: string, task: string, machine?: string | null) => void;
  /** Una tarea del riel por su id, para las filas guardadas sin `from_task`. */
  tareaPorId?: (id: string) => SenderTask | null;

  onForkDesde: ((turno: string, mode: "full" | "focused", encargado: string | null) => Promise<void>) | null;
  /** Los agentes de la carpeta que la tarea nueva puede llevar al bifurcar. */
  forkAgents?: string[];
  /** El de la tarea de la que se bifurca: el desplegable arranca en él. */
  forkAgent?: string | null;

  onError: (message: string) => void;
  /**
   * Los archivos elegidos para el próximo mensaje, por ruta. Viven en el
   * borrador de la conversación y no aquí (`App.tsx`): dentro de la caja
   * se perdían al cambiar de pestaña. Soltarlos al mandar lo decide quien
   * manda: solo si el turno arrancó o el mensaje quedó encolado, y solo los de ese mensaje.
   */
  adjuntos: string[];
  onAdjuntos: (rutas: string[]) => void;
  onAgregarAdjuntos: (rutas: string[]) => Promise<void>;
  cola: ColaDeMensajesProps;
};

/**
 * La transcripción y la caja de escritura. Agente, modelo y adjuntos se
 * deciden al escribir el mensaje: los tres viven aquí adentro y no en una
 * barra aparte.
 */
/** Cuánto se queda montado lo leído arriba después de volver al final. */
const SOLTAR_LO_LEIDO_MS = 30_000;
/** El riel necesita ancho para no tapar el texto del hilo. */
const ANCHO_DEL_RIEL = 320;
const mismoRemitente = (a: InputMessage["sender"], b: InputMessage["sender"]) => {
  if (a?.kind !== b?.kind) return false;
  if (!a || !b) return true;
  if (a.kind === "agent" && b.kind === "agent") return a.name === b.name;
  return a.kind === "task" && b.kind === "task" && a.agent === b.agent && a.model === b.model;
};
/** Cuánto espera tras el último `scroll` para mover la marca activa. */
const ESPERA_DEL_RIEL_MS = 120;
/** A cuánto del borde de arriba queda el mensaje al saltar: el relleno de la caja. */
const DESFASE_DEL_SALTO = 12;

/** Lo plegado y desplegado de una conversación. Vive en `App`: la pestaña escondida se desmonta. */
export type VistaDeLaConversacion = {
  trabajos: Signal<Record<string, boolean>>;
  razonamientos: Signal<Record<string, boolean>>;
  preguntasPlegadas: Signal<Record<string, boolean>>;
  /** El turno cuya pregunta pendiente está plegada. */
  preguntaPlegadaEn: Signal<string | null>;
};

export const vistaNueva = (): VistaDeLaConversacion => ({
  trabajos: createSignal<Record<string, boolean>>({}),
  razonamientos: createSignal<Record<string, boolean>>({}),
  preguntasPlegadas: createSignal<Record<string, boolean>>({}),
  preguntaPlegadaEn: createSignal<string | null>(null),
});

export default function Chat(props: ChatProps) {
  // `null` mientras nadie movió el resaltado: ahí empieza en `filaDeArranque`.
  const [pick, setPick] = createSignal<number | null>(null);
  const [preparingAttachments, setPreparingAttachments] = createSignal(0);
  const [attachmentFailure, setAttachmentFailure] = createSignal<Failure | null>(null);
  const presentation = () => taskChatPresentation;
  const margenDelHilo = "px-4 py-3";

  const [copiando, setCopiando] = createSignal<string | null>(null);
  const [copiado, setCopiado] = createSignal<string | null>(null);
  const [forkeando, setForkeando] = createSignal<string | null>(null);
  /** Hay archivos encima de la ventana, sin soltar todavía. */
  /** La caja de esta conversación mientras un archivo pasa por encima de ella. */
  const [soltando, setSoltando] = createSignal<DOMRect | null>(null);
  let ancla: HTMLSpanElement | undefined;
  /**
   * Qué bloque de «Trabajó durante…» está desplegado, por turno. No se
   * persiste: qué bloque tenías abierto en una conversación no es una
   * preferencia de la app, y guardarlo haría crecer el `localStorage`.
   */
  const visualBudget = createVisualBudget();
  const [trabajos, setTrabajos] = props.vista.trabajos;
  /** Qué razonamiento está desplegado, por mensaje. Efímero como `trabajos`. */
  const [razonamientos, setRazonamientos] = props.vista.razonamientos;
  /**
   * Qué registro de preguntas está plegado, por turno. Guarda el pliegue y
   * no el despliegue, al revés que `trabajos`: el bloque nace abierto, un
   * `Record` vacío tiene que significar «todas visibles» — «qué está
   * abierto» escondería las decisiones ya tomadas en la conversación.
   */

  /**
   * Tampoco se persiste, por lo mismo que `trabajos`: es el estado de una
   * lectura, no una preferencia de la app.
   */
  const [preguntasPlegadas, setPreguntasPlegadas] = props.vista.preguntasPlegadas;
  /**
   * El último mensaje del agente del hilo: es a quien pertenece el turno
   * que corre, mientras la tarea contesta ese bloque es el vivo. Se busca
   * desde el final y no se guarda: el hilo cambia en cada delta, un índice
   * recordado apuntaría a otro mensaje en cuanto entre uno nuevo.
   */
  const ultimoDelAgente = () => {
    const ms = props.msgs;
    for (let i = ms.length - 1; i >= 0; i--) if (ms[i].role === "agent") return ms[i];
    return null;
  };
  // Función y no `&&` en la prop: el compilador vuelve la condición un memo por lectura, y el observador de alto la lee sin dueño.
  // Un turno guardado trae su duración: sin esto, antes de que el nuevo diga nada, el anterior se pinta vivo.
  const esElVivo = (msg: Msg) =>
    Boolean(props.busy) && msg === ultimoDelAgente() && msg.duration_ms === undefined;
  // Dónde está el cursor. El menú de sugerencias depende de la posición, no
  // solo del texto: un `@` escrito en medio de un párrafo ya redactado abre el
  // menú ahí, y el de un párrafo anterior ya no.
  const [caret, setCaret] = createSignal(0);
  const [dismissed, setDismissed] = createSignal(false);

  /**
   * Quién sigue al fondo mientras el agente escribe. Todo lo delicado está
   * en `lib/paste.ts`: decidir por la distancia al fondo en vez de por la
   * intención de soltarse falla contra la rueda mientras entraban deltas,
   * y no basta con enterarse de lo que crece el hilo sin tocar `msgs`.
   */

  /**
   * Sin ningún efecto sobre `props.msgs`: uno solo cubriría el único
   * crecimiento nombrable, y dejaría pasar el registro que se despliega,
   * el diff que aparece, `EstadoDelTurno` entrando o una miniatura que
   * carga. El `ResizeObserver` los cubre todos sin enumerarlos.
   */
  // Memo: el observador lo lee sin dueño, y `busy` llega como prop con condición.
  const enTurno = createMemo(() => Boolean(props.busy));
  const hilo = seguirElFondo(enTurno);
  let campo: HTMLTextAreaElement | undefined;
  // La caja que se remonta llega después del efecto, y el `focus()` de aquel
  // cae sobre el campo viejo. La reclamación la recoge el campo nuevo.
  let reclamaElFoco = false;
  const tomarCampo = (el: HTMLTextAreaElement) => {
    campo = el;
    if (!reclamaElFoco) return;
    reclamaElFoco = false;
    enfocar(el);
  };
  let mirror: HTMLDivElement | undefined;
  let entradaArchivo: HTMLInputElement | undefined;

  const commandNames = createMemo(
    () => new Set([...props.skills.map((s) => s.name), ...props.commands.map((c) => c.name)]),
  );
  const fieldSpans = createMemo(() =>
    highlightSpans(props.input, props.taskMentions ?? [], commandNames(), props.recipients ?? []),
  );
  const hasHighlight = () => fieldSpans().some((tramo) => tramo.kind);
  /** Dónde dejar el cursor cuando el texto nuevo ya haya bajado. */
  let pendingCaret: number | null = null;
  let pendingEdit: PendingEdit | undefined;

  /** La caja crece con el texto hasta su tope y ahí empieza a scrollear. */
  function ajustarAlto() {
    if (!campo) return;
    campo.style.height = "auto";
    campo.style.height = `${campo.scrollHeight}px`;
  }

  /**
   * El alto pertenece al valor que se está mostrando, no al gesto que lo
   * escribió. Al enviar, `App` vacía el borrador con `setInput("")` sin
   * ningún `input` nativo que dispare `ajustarAlto`; sin este efecto queda
   * la altura del mensaje largo en una caja ya vacía (cubre también insertar una sugerencia, reintentar y otra escritura programática).
   */
  createEffect(on(() => props.input, ajustarAlto));

  // Memo y no accesor: `props.msgs` se rehace con cada evento del turno, y un
  // accesor hace correr a `on(vacia, …)` en cada uno con el mismo booleano.
  const vacia = createMemo(() => props.msgs.length === 0);

  /**
   * Si la caja va centrada: hilo vacío de una tarea que todavía no existe o
   * que nació sin mensajes. Centrar solo con agente dejaba «Nueva tarea» a secas al pie.
   */
  const centrada = createMemo(() => vacia() && (props.conversacion === "" || !!props.sinEmpezar));

  /** El saludo de una tarea nueva se elige al abrirla: una de las frases o la de la hora. */
  const SALUDOS = 10;
  const saludo = createMemo(() => {
    if (!centrada()) return "";
    const n = Math.floor(Math.random() * (SALUDOS + 1));
    if (n < SALUDOS) return t(`chat.greeting.${n + 1}`);
    const hora = new Date().getHours();
    if (hora >= 5 && hora < 12) return t("chat.greeting.morning");
    return hora >= 12 && hora < 19 ? t("chat.greeting.afternoon") : t("chat.greeting.evening");
  });

  /**
   * Cuánto tiene que tardar la lectura para que el esqueleto ayude. El
   * estado de carga tapa el hueco entero —sin él vuelve la caja centrada,
   * fijado por `thread-load.test.ts`—, pero dibujar el esqueleto durante
   * ese hueco solo ayuda si el hueco se ve.
   */

  /**
   * Medido sobre una grabación de la app: cambiar a un chat que aún no
   * estaba cargado pinta el esqueleto en 2,087 s y lo sustituye por el
   * hilo en 2,138 s — 51 ms, tres cuadros a 60 Hz. A esa velocidad unas
   * barras grises que entran y salen no se leen como «está cargando»
   * sino como un fallo de pintado.
   */

  /**
   * El esqueleto se queda —cuando la espera es de verdad sigue siendo lo
   * correcto, su porqué está en `ui/Skeleton.tsx`—; lo que se retrasa es
   * su entrada. Por debajo del umbral la rama de carga mantiene el mismo
   * armazón y el mismo sitio: no se mueve nada, no aparece una forma que iba a durar menos de lo que se tarda en verla.
   */

  /**
   * 160 ms es de la horquilla de siempre para esto (100-200): deja fuera
   * la lectura de disco local —decenas de milisegundos— sin hacer esperar
   * a quien sí va a ver un hueco. No es un número medido: es una elección,
   * escrita aquí en un solo sitio.
   */
  const UMBRAL_DEL_ESQUELETO_MS = 160;
  const [esperaVisible, setEsperaVisible] = createSignal(false);
  createEffect(
    on(
      () => props.cargando,
      (cargando) => {
        // Se reinicia en cada apertura: si no, la tarea anterior que sí tardó
        // dejaría el esqueleto encendido para la siguiente, que es lo mismo que
        // no tener umbral.
        setEsperaVisible(false);
        if (!cargando) return;
        const t = setTimeout(() => setEsperaVisible(true), UMBRAL_DEL_ESQUELETO_MS);
        onCleanup(() => clearTimeout(t));
      },
    ),
  );
  const [plegadaEn, setPlegadaEn] = props.vista.preguntaPlegadaEn;
  // Por turno: la pregunta siguiente nace desplegada.
  const preguntaPlegada = () => plegadaEn() !== null && plegadaEn() === preguntaPendiente()?.turno;
  const actual = () => props.superficies?.find((s) => s.id === props.superficie);

  /**
   * Qué le falta a todo lo que no se puede usar, si a todo le falta lo
   * mismo. Con dos motivos distintos —una sin conectar y otra sin
   * consentimiento— no hay una frase cierta para las dos: el botón vuelve
   * a la salida genérica en vez de elegir una y equivocarse con la otra.
   */
  const faltaUnanime = () => {
    const rotas = (props.superficies ?? []).filter((s) => !s.usable);
    if (rotas.length === 0) return undefined;
    return rotas.every((s) => s.marca === rotas[0].marca) ? rotas[0] : undefined;
  };
  /**
   * Por qué esta tarea no puede mandar, fuera del campo de escritura. Un
   * placeholder invita a escribir: desaparece con la primera letra y se
   * corta antes que la prosa de recuperación. El problema pertenece a la
   * superficie elegida: se queda visible junto a sus selectores.
   */
  const bloqueoDeSuperficie = () => {
    if (props.superficies === null || props.superficies.length === 0) return null;
    if (!actual()) {
      return t("chat.surface.gone");
    }
    const falta = actual()!.porque;
    return falta ? prosa(falta) : null;
  };
  /**
   * Dos bloqueos, y ninguno es el proyecto. Sin una superficie que se
   * pueda usar no hay quién responda, y con una pregunta abierta el
   * trabajo está detenido esperándola. Faltar proyecto no bloquea: nombrar
   * el trabajo es una decisión que se toma cuando hay algo que nombrar.
   */

  /**
   * Lo que bloquea no es «no está instalado»: con el menú ofreciendo solo
   * lo utilizable, lo único que puede quedar seleccionado y no servir es
   * la superficie de una tarea sin cuenta, sin clave o sin activar. Qué
   * le falta lo dice `porque` —clave traducida con `prosa()`—; «sin elegir» no lleva frase, su botón ya está al lado (`surfaces::sin_cuenta`).
   */
  /** Lo escrito va dirigido a alguien: esta sesión no lanza turno con él
   *  (`docs/specs/handler-mentions.md`). */
  const dirigido = () => (props.recipients?.length ?? 0) > 0;
  /**
   * La pregunta abierta no bloquea un mensaje dirigido: nadie está
   * contestando aquí. Cerrar la caja convertiría «llamar a otro» en no poder
   * hacer nada hasta responderle a este.
   */
  const escribible = () => !props.esperando || dirigido();
  // El campo no pide superficie: sin cuenta conectada hay que poder escribir un `!`.
  const mandable = () => escribible() && (Boolean(actual()?.usable) || seMandaSinSuperficie(props.input));
  const listo = () => mandable() && preparingAttachments() === 0;
  const enviadas = createMemo(() => lastSentAt(props.msgs, props.cola.items.map((q) => q.text)));
  const respuestaRapida = (desde: number): RespuestaRapida | null => {
    const mandarRapida = props.onRespuestaRapida;
    if (!mandarRapida || props.soloLectura) return null;
    return {
      puede: Boolean(actual()?.usable) && !props.esperando,
      usada: (texto) => usedSince(enviadas(), texto, desde),
      onElegir: (texto) => {
        hilo.bajar();
        return mandarRapida(texto);
      },
    };
  };
  const elegido = () => props.models?.models.find((m) => m.id === props.model);
  const efforts = () => elegido()?.efforts ?? [];

  /**
   * Cuántas veces se cambió el modo desde aquí. Lo lee `SelectorDeModo`
   * para acusar el cambio: cambiarlo con el atajo mueve un rótulo lejos
   * del cursor, y sin un pulso que lo señale eso no se ve. Vive aquí y no
   * en el selector: las dos formas de cambiar —menú y `shift+tab`— tienen que acusar igual.
   */
  const [pulsoDeModo, setPulsoDeModo] = createSignal(0);
  const cambiarModo = (id: string) => {
    props.onModo(id);
    setPulsoDeModo((n) => n + 1);
  };

  const opciones = createMemo(() =>
    // Los otros agentes siguen visibles aunque cambiar de CLI esté cerrado:
    // el candado dice el motivo y no esconde la lista. Las superficies del
    // mismo agente (por ejemplo, OpenCode) siguen juntas.
    opcionesDeModelos(props.superficies ?? [], props.catalogos),
  );

  // Qué se está escribiendo ahora mismo: una mención, una skill, o nada.
  // Sale del texto y de dónde está el cursor, no solo del texto.
  const trigger = () => activeTrigger(props.input, caret());
  const taskMenuRequested = createMemo(() => trigger()?.kind === "@");
  createEffect(on(taskMenuRequested, active => {
    if (active) props.onTaskMenuOpen?.();
  }));

  // Esc cierra el menú sin borrar lo escrito. Se suelta en cuanto el texto
  // cambia: seguir tecleando es volver a pedirlo. Y el resaltado vuelve al
  // principio de la lista.
  createEffect(
    on(
      () => props.input,
      () => {
        setDismissed(false);
        setPick(null);
      },
    ),
  );

  const slashGroups = createMemo(() => {
    const d = trigger();
    return d?.kind === "/" ? slashSuggestions(props.skills, props.commands, d.query) : [];
  });

  const suggestions = createMemo<Suggestion[]>(() => {
    const d = trigger();
    if (!d) return [];
    if (d.kind === "/") {
      // Cada grupo dice quién resuelve sus filas: el CLI de la caja, o una skill.
      const delAgente = props.agents.find((a) => a.id === props.agent)?.label ?? props.agent;
      return slashRows(slashGroups()).map((s) => ({
        value: s.name,
        title: `/${s.name}`,
        group: s.kind === "agent" ? delAgente : t("chat.commands.skills"),
        mark: s.kind === "agent" ? { agent: props.agent } : ("skill" as const),
        detail: s.description ?? undefined,
      }));
    }
    // Primero los encargados, y no por jerarquía: los llama un nombre corto,
    // que es el que choca con el de un archivo. Quien busca material tiene
    // una barra o una extensión a mano para distinguirlo.
    // Los del repositorio primero y con candado: se cambian con un PR, no aquí.
    const grupos = groupRecipients(props.recipientCandidates ?? [], d.query);
    const fila = (c: RecipientCandidate, group: string, groupHint?: string): Suggestion => ({
      value: recipientId(c.name),
      title: c.name,
      detail: c.description || undefined,
      label: t("chat.mentions.handler"),
      group,
      groupHint,
      // Despierto mientras no se sepa: la presencia ayuda cuando está, y una
      // cara dormida por falta de dato diría que no está quien sí está.
      avatar: { name: c.name, status: c.status ?? ("awake" as const), image: props.avatarOf?.(c.name) },
    });
    const delRepositorio = props.recipientFolder
      ? t("chat.mentions.group_repository", { folder: props.recipientFolder })
      : t("chat.mentions.group_repository_unnamed");
    const handlers = [
      ...grupos.repository.map(c => fila(c, delRepositorio, t("chat.mentions.via_pr"))),
      ...grupos.own.map(c => fila(c, t("chat.mentions.group_own"))),
    ];
    // Con cabeceras arriba, el material lleva la suya: si no, se leería como
    // parte del último grupo de encargados.
    const material = handlers.length ? t("chat.mentions.group_material") : undefined;
    const tasks = searchTasks(props.taskCandidates ?? [], d.query, props.mentionProject ?? "", props.mentionSession)
      .slice(0, 40).map(task => ({
        value: referenceId(task.target),
        title: task.title || workLabel(task.branch, task.alias) || task.target.sessionId,
        detail: [workLabel(task.branch, task.alias), task.projectName, task.machine && props.mentionMachineName?.(task.machine)].filter(Boolean).join(" · "),
        label: task.available ? (task.archived ? t("chat.mentions.archived_task") : t("chat.mentions.task")) : t("chat.mentions.no_worktree"),
        group: material,
      }));
    const places = searchPlaces(props.placeCandidates ?? [], d.query).map(place => ({
      value: referenceId(place.target),
      title: place.name,
      detail: place.detail || undefined,
      label: t("chat.mentions.folder"),
      group: material,
    }));
    return [...handlers, ...tasks, ...places, ...filterMentionSources(props.mentionSources?.fuentes ?? [], d.query).map((f) => ({
      value: f.ruta,
      title: f.ruta,
      // Solo las fuentes extra traen `fuente`: la carpeta de trabajo ya está
      // implícita y una columna `tree` no dice de cuál archivo se trata.
      detail: f.fuente || undefined,
      label: f.tipo,
      group: material,
    }))];
  });

  // Con la barra empieza en el nombre escrito entero: el grupo del agente va
  // primero, y Tab cambiaría una skill exacta por el comando que la precede.
  const filaDeArranque = () => {
    const d = trigger();
    return d?.kind === "/" ? slashPick(slashGroups(), d.query) : 0;
  };
  // Una fila deshabilitada informa y no se elige: el teclado la salta.
  const habilitada = (desde: number, paso: 1 | -1) => {
    const filas = suggestions();
    for (let n = 0; n < filas.length; n++) {
      const i = (((desde + paso * n) % filas.length) + filas.length) % filas.length;
      if (!filas[i]?.disabled) return i;
    }
    return desde;
  };
  const picked = () =>
    habilitada(Math.max(0, Math.min(pick() ?? filaDeArranque(), suggestions().length - 1)), 1);

  // Un menú que solo puede decir «no hay nada» no se abre: la caja tiene que
  // dejar escribir `@` y `/` como caracteres cuando no hay a qué apuntar.
  const menuOpen = () => {
    const d = trigger();
    if (dismissed() || d === null) return false;
    return d.kind === "/"
      ? props.skills.length > 0 || props.commands.length > 0
      : (props.mentionSources?.fuentes.length ?? 0) > 0 || Boolean(props.taskCandidates?.length) ||
        Boolean(props.placeCandidates?.length) || Boolean(props.recipientCandidates?.length);
  };

  // Abrir otra conversación empieza por el final, siempre: es lo último que se
  // dijo, y es lo que se va a contestar.

  // Un corte y sostenido de 300 ms: el hilo nuevo sigue creciendo después
  // de montarse —el markdown reflowea, los bloques de diff se miden, las
  // miniaturas cargan—, un solo salto al alto de ese instante aterrizaba a
  // media conversación. La bajada se re-apunta al fondo mientras dura, y
  // `ignorarEscapes` impide que ese acomodo se lea como que alguien movió
  // la rueda.

  // `recolocar` antes del salto es la otra mitad: el salto coloca la
  // barra, lo que seguía brincando después es el observador de
  // `lib/paste.ts`, que mide el hilo nuevo contra el alto del anterior
  // —el elemento observado no cambia, la caja es la misma instancia al
  // pasar de una tarea a otra—. Con el alto olvidado, esa primera medida
  // cuenta como apertura y coloca de un corte en vez de recorrer la diferencia con el muelle a la vista.

  // Dispara también cuando la transcripción termina de llegar (`cargando`),
  // no solo al cambiar de conversación: entre las dos cosas hay una
  // lectura de disco, y lo que sustituye al esqueleto es un hilo entero
  // de una vez. Una transcripción que tardara más que los 300 ms abriría
  // por donde hubiera quedado.
  let retomarLectura = props.lectura ?? null;
  const colocar = () => {
    const lectura = retomarLectura;
    retomarLectura = null;
    const bloque = lectura && bloqueDeLectura(lectura);
    if (lectura && bloque !== null) {
      if (hiloVirtual) {
        hilo.soltar();
        lecturaPorSaltar = lectura;
        return queueMicrotask(saltarALaLectura);
      }
      return hilo.retomar(bloque - chunkStart(shownFrom(), origen()), lectura.desfase);
    }
    hilo.recolocar();
    hilo.bajar({ animacion: "instantanea", duracion: 300, ignorarEscapes: true });
  };
  /**
   * Cuántas respuestas del agente entraron desde que el hilo dejó de
   * seguir. Se cuentan respuestas, no mensajes de la lista.
   */

  /**
   * `msgs` lleva también los pasos (`meta === "usó"`) y los avisos del
   * sistema, y un turno normal mete una docena: «14 mensajes nuevos» por
   * una sola respuesta es un número que quien lo lee no reconoce, y le
   * hace pensar que se perdió algo.
   */

  /**
   * La respuesta viva es un mensaje que crece —los deltas se concatenan
   * sobre el último `agent` (`App.tsx`)—: mientras el agente escribe esto
   * dice «1 mensaje nuevo», que es lo que ha pasado.
   */

  /**
   * La marca se re-sincroniza mientras el final se vea: estar abajo es
   * haberlo visto; el contador nace en cero cada vez que alguien se
   * suelta, sin necesidad de escuchar ese momento.
   */
  const respuestas = createMemo(
    () => props.msgs.filter((m) => m.role === "agent" && !m.meta).length,
  );
  const [vistas, setVistas] = createSignal(0);
  createEffect(() => {
    if (hilo.alFondo()) setVistas(respuestas());
  });
  /**
   * Con el visto bueno del hilo, y no solo con la cuenta: `hayNuevos` es
   * quien sabe si esto ya se vio, se apaga en el acto al pulsar el botón,
   * al llegar al final a mano y al recolocar.
   */

  /**
   * La marca de arriba vive en un efecto y se pone al día un tic más
   * tarde; sin esta condición el rótulo enseñaría la cuenta vieja durante
   * ese tic —un parpadeo justo encima del control que se acaba de pulsar.
   */
  const mensajesNuevos = () =>
    hilo.hayNuevos() ? Math.max(0, respuestas() - vistas()) : 0;

  createEffect(on(() => props.conversacion, colocar));
  createEffect(
    on(
      () => props.cargando,
      (cargando, antes) => {
        if (antes && !cargando) colocar();
      },
    ),
  );

  // Insertar mueve el cursor, y eso no se puede pedir en el mismo respiro en
  // que cambia el valor: el DOM todavía tiene el texto de antes y la posición
  // se pierde. Se apunta y se aplica cuando el valor ya bajó.
  createEffect(
    on(
      () => props.input,
      () => {
        const c = pendingCaret;
        if (c === null) return;
        pendingCaret = null;
        campo?.focus();
        campo?.setSelectionRange(c, c);
        setCaret(c);
      },
    ),
  );

  function mentionedReference(value: string): { target: MentionTarget; label: string } | undefined {
    const task = props.taskCandidates?.find(c => referenceId(c.target) === value);
    if (task) return { target: taskTarget(task, props.mentionMachineName), label: taskLabel(task) };
    const place = props.placeCandidates?.find(c => referenceId(c.target) === value);
    return place && { target: place.target, label: placeLabel(place) };
  }

  /** Mete la referencia o la skill elegida en lugar de lo que se tecleaba. */
  function insertSuggestion(value: string) {
    const d = trigger();
    if (!d) return;
    // El destinatario no pasa por `onReference`: llamar a alguien no es
    // adjuntar material, y son dos listas distintas del borrador.
    const handler = d.kind === "@"
      ? props.recipientCandidates?.find(c => recipientId(c.name) === value)
      : undefined;
    if (handler) {
      const label = recipientLabel(handler.name);
      pendingCaret = d.from + label.length + 1;
      props.onRecipient?.(handler.name, label, d);
      return;
    }
    const reference = d.kind === "@" ? mentionedReference(value) : undefined;
    // El punto se anota antes de cambiar el texto: el efecto que lo aplica
    // corre en el mismo cambio, y si llega tarde lo aplica la tecla siguiente.
    if (reference) {
      pendingCaret = d.from + reference.label.length + 1;
      props.onReference?.(reference.target, reference.label, d);
      return;
    }
    const puesto = applySuggestion(props.input, d, value);
    pendingCaret = puesto.caret;
    props.onInput(puesto.text);
  }

  // La caja cambia de sitio en cuanto hay un turno —del centro de la
  // pantalla al pie— y ahí se vuelve a montar: el foco se pierde justo
  // después de mandar el primer mensaje. Ese es el momento en que se
  // escribe lo siguiente, y volver a hacer clic para encolar sobra.
  createEffect(
    on(vacia, (v) => {
      if (v) return;
      enfocarSiNadieEscribe(campo);
      reclamaElFoco = true;
      setTimeout(() => {
        reclamaElFoco = false;
      });
    }),
  );

  // Sin ceder ante otro campo: lo pidió la persona, y el que se deja atrás
  // puede seguir siendo el `activeElement` aunque ya no se vea.
  onMount(() =>
    onCleanup(
      atenderElCampo(() => {
        if (props.soloLectura || props.conversacion !== "") return false;
        queueMicrotask(() => campo?.focus());
        return true;
      }),
    ),
  );

  /**
   * Soltar archivos en la ventana los adjunta al mensaje. Tiene que ser el
   * evento nativo de Tauri: el `drop` de HTML5 entrega un `File` sin ruta
   * en disco, y sin ruta no hay nada que copiar a la carpeta de trabajo.
   * El de Tauri trae rutas absolutas.
   */

  /**
   * La zona de soltar es la ventana entera, y no es comodidad: es lo
   * único que se puede hacer bien. El evento trae una posición que no
   * significa lo mismo en cada plataforma: macOS manda puntos lógicos
   * (`wry/src/wkwebview/drag_drop.rs`), Windows manda píxeles físicos
   * (`wry/src/webview2/drag_drop.rs`).
   */

  /**
   * Tauri las emite tal cual (`manager/webview.rs`), tipadas como
   * `PhysicalPosition` en las dos. Dividir por `devicePixelRatio` para
   * acotar el drop a la caja parte las coordenadas por dos en un Mac
   * Retina: el punto cae lejos de la caja y soltar no adjunta nada.
   */

  /**
   * Si vuelve a hacer falta saber dónde se soltó, se resuelve preguntando
   * al backend por el `scale_factor` de la ventana, no con
   * `devicePixelRatio`, sabiendo que en macOS no hay que dividir. Lo
   * comprueba `scripts/guards/drop.mjs`.
   */
  onMount(() => {
    let disposed = false;
    // Con la pantalla partida cada conversación es su propia zona: el archivo va a la
    // que está bajo el puntero. macOS manda puntos y el resto píxeles físicos.
    const enPuntos = navigator.userAgent.includes("Macintosh");
    let escala = 1;
    const medirEscala = () =>
      void getCurrentWindow()
        .scaleFactor()
        .then((f) => {
          escala = f;
        })
        .catch(() => {});
    medirEscala();
    const bajoElPuntero = (pos: { x: number; y: number }) => {
      const caja = ancla?.parentElement?.getBoundingClientRect();
      if (!caja) return null;
      // Sin maquetación no hay cajas que medir: la conversación montada recibe, como antes.
      if (document.documentElement.clientWidth === 0) return caja;
      // Con maquetación, una caja vacía es una conversación escondida.
      if (caja.width === 0 || caja.height === 0) return null;
      const f = enPuntos ? 1 : escala;
      const x = pos.x / f;
      const y = pos.y / f;
      return x >= caja.left && x <= caja.right && y >= caja.top && y <= caja.bottom ? caja : null;
    };
    const un = getCurrentWebview().onDragDropEvent((e) => {
      // La suscripción dura lo mismo que el componente. `puedeAdjuntar()` se
      // lee al recibir cada evento para no conservar el valor que tenía al
      // montar. El acceso sigue siendo reactivo sin volver a suscribirse cuando
      // cambia la señal.
      if (disposed) return;
      if (props.soloLectura || !puedeAdjuntar()) {
        setSoltando(null);
        return;
      }
      if (e.payload.type === "enter") medirEscala();
      if (e.payload.type === "enter" || e.payload.type === "over") {
        setSoltando(bajoElPuntero(e.payload.position));
        return;
      }
      if (e.payload.type === "drop") {
        const aqui = bajoElPuntero(e.payload.position);
        setSoltando(null);
        if (aqui) agregar(e.payload.paths);
        return;
      }
      setSoltando(null);
    });

    // La promesa puede no resolver a nada, y hay que contar con ello:
    // `onDragDropEvent` habla con el backend, sin él —el guarda `mount-frontend`
    // corre en jsdom con el IPC stubeado— devuelve `undefined` y `f()`
    // revienta con «Cannot read properties of undefined». Con una
    // conversación por ventana el componente sí se desmonta, y el fallo
    // se lleva el árbol entero por delante en el primer render del guarda.
    onCleanup(() => {
      disposed = true;
      void un.then((f) => f?.()).catch(() => {});
    });
  });

  // En el navegador no hay rutas: el `drop` de HTML5 trae el `File` y se sube.
  onMount(() => {
    const zona = ancla?.parentElement;
    if (!capabilities().browserFiles || !zona) return;
    const quitar = archivosDelNavegador().then((m) => enNavegador(m).escuchar(zona));
    onCleanup(() => void quitar.then((f) => f()));
  });

  async function agregar(rutas: string[]) {
    setPreparingAttachments((n) => n + 1);
    setAttachmentFailure(null);
    const conversation = props.conversacion;
    try {
      await props.onAgregarAdjuntos(rutas.filter((p) => !props.adjuntos.includes(p)));
    } catch (e) {
      if (conversation === props.conversacion) setAttachmentFailure(asFailure(e));
    } finally {
      setPreparingAttachments((n) => n - 1);
    }
  }

  async function pegar(e: ClipboardEvent) {
    if (props.soloLectura || !puedeAdjuntar()) return;
    const img = imagenPegada(e.clipboardData);
    if (!img) return;
    e.preventDefault();
    const conversation = props.conversacion;
    setAttachmentFailure(null);
    setPreparingAttachments((n) => n + 1);
    try {
      const datos = await base64De(img);
      const ruta = await props.onPegarImagen(img.type, datos);
      await agregar([ruta]);
    } catch (err) {
      if (conversation === props.conversacion) setAttachmentFailure(asFailure(err));
    } finally {
      setPreparingAttachments((n) => n - 1);
    }
  }

  /** En la web: el archivo viaja como bytes y el motor lo guarda en su máquina (`browserFiles.ts`). */
  const enNavegador = (m: typeof import("./browserFiles")) => m.adjuntador({
    puede: () => !props.soloLectura && puedeAdjuntar(),
    documentos: props.aceptaDocumentos,
    marcar: setSoltando,
    conversacion: () => props.conversacion,
    pegar: props.onPegarImagen,
    agregar,
    fallo: setAttachmentFailure,
    ocupado: (d) => setPreparingAttachments((n) => n + d),
  });


  async function copiarMensaje(clave: string, texto: string) {
    if (copiando()) return;
    setCopiando(clave);
    try {
      await copyText(texto);
      setCopiado(clave);
      setTimeout(() => setCopiado((actual) => (actual === clave ? null : actual)), 1500);
    } catch (e) {
      props.onError(prosaDe(e));
    } finally {
      setCopiando(null);
    }
  }

  const [forkTurn, setForkTurn] = createSignal<string | null>(null);
  // "" es sin agente: el `<select>` nativo no guarda `null`.
  const [forkAgentChoice, setForkAgentChoice] = createSignal("");

  function abrirFork(turno: string) {
    const propio = props.forkAgent ?? "";
    // Un agente que ya no está en la carpeta no se puede elegir: arranca sin.
    setForkAgentChoice(propio && (props.forkAgents ?? []).includes(propio) ? propio : "");
    setForkTurn(turno);
  }

  async function forkDesde(mode: "full" | "focused") {
    const turno = forkTurn();
    if (!turno) return;
    const hacer = props.onForkDesde;
    if (!hacer || forkeando()) return;
    setForkeando(turno);
    try {
      await hacer(turno, mode, forkAgentChoice() || null);
      setForkTurn(null);
    } catch (e) {
      setForkTurn(null);
      props.onError(prosaDe(e));
    } finally {
      setForkeando(null);
    }
  }

  async function elegirArchivos() {
    if (capabilities().browserFiles) {
      enNavegador(await archivosDelNavegador()).elegir();
      return;
    }
    const elegidos = await open({
      multiple: true,
      title: t("chat.attachments.dialog_title"),
    });
    if (elegidos) agregar(Array.isArray(elegidos) ? elegidos : [elegidos]);
  }

  // Los adjuntos los suelta quien manda, a la vez que el texto, y los devuelve
  // al borrador de esa tarea si el envío falla: sin eso, un archivo por encima
  // del tope obliga a volver a buscarlo en el disco.
  async function mandar() {
    if (entradaActiva()) {
      void teclearAlComando(`${entrada()}\r`);
      return;
    }
    if ((!props.input.trim() && props.adjuntos.length === 0) || !listo()) return;
    // Mandar es volver al final, se estuviera donde se estuviera: lo que se
    // acaba de escribir va abajo, y quedarse leyendo arriba mientras aparece
    // fuera de la vista es la conversación diciendo que no se envió nada.
    hilo.bajar();
    await props.onSend(props.adjuntos);
  }

  /**
   * Los eventos de sistema consecutivos —`usó`, `aviso`, `fin`, `gasto`—
   * forman una línea de tiempo: una fila por acto, entre turno y turno.
   * Sueltos eran una tira de renglones grises; como filas son "qué hizo
   * el agente para responder esto", que es lo que se quiere leer.
   */

  /** Dónde está el último mensaje escrito: lo que `onReintentar` vuelve a mandar. */
  const ultimoEscrito = createMemo(() => {
    for (let i = props.msgs.length - 1; i >= 0; i--) if (props.msgs[i].role === "user") return i;
    return -1;
  });
  /**
   * El turno que no cerró se queda fuera: un fallo es lo único de esa
   * tira que cambia lo que hay que hacer después, no entra en nada plegable.
   */
  const bloques = createMemo<Bloque[]>(() => {
    const out: Bloque[] = [];
    props.msgs.forEach((m, i) => {
      // Contestar no deja un turno suelto en el hilo: la respuesta se pinta
      // DENTRO de la pregunta que contesta, que es donde se lee lo que se
      // preguntó y lo que se decidió como una sola cosa.
      if (m.respuestas?.length) return;
      // Terminus ya no avisa en el chat que una tarea lanzada terminó; las
      // filas que quedaron guardadas de antes tampoco se pintan.
      if (m.meta === "task_completed") return;
      if (m.meta === "task_launched") {
        ponerLanzamiento(out, { tipo: "msg", msg: m, i }, (b) => b.tipo === "msg" && b.msg.meta === "task_launched");
        return;
      }
      if (m.shell) {
        out.push({ tipo: "msg", msg: m, i });
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
        // La respuesta de un turno cerrado se lleva su avance al pliegue.
        const avance: Avance[] = [];
        for (let previo = out.at(-1); m.turno && previo?.tipo === "trabajo" && previo.msg.avanceDe === m.turno; previo = out.at(-1)) {
          out.pop();
          avance.unshift({ pasos: previo.pasos, msg: previo.msg });
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

    return out;
  });
  const searchMessages = () => bloques().flatMap((block, index) => {
    const message = block.tipo === "pasos" ? null : block.msg;
    if (!message || !["user", "agent"].includes(message.role) || message.shell || message.permission) return [];
    const named = message.author?.name?.trim() || message.encargado || message.fromTask?.title || "";
    const speaker = named || (message.role === "agent" && message.agent
      ? (props.agents.find((agent) => agent.id === message.agent)?.label ?? message.agent)
      : null);
    return [{
      block: index,
      text: message.role === "agent" ? stripNextSteps(textoVisible(message.text)) : message.text,
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
    const asignadas = clavesDeBloques.assign(lista.map((b) => props.msgs[b.i]?.clave ?? null));
    // Por clave y no por índice: al anteponer, un índice viejo sobre los bloques nuevos es otra fila y su contenido se rehace.
    return { lista: asignadas, deBloque: new Map(lista.map((b, k) => [b, asignadas[k]])), deClave: new Map(lista.map((b, k) => [asignadas[k], b])) };
  });
  createEffect(() => {
    clavesDelHilo();
    const renombradas = clavesDeBloques.takeRenames().filter(([vieja]) => claveDeBloque(vieja) in untrack(trabajos));
    if (!renombradas.length) return;
    setTrabajos({ ...untrack(trabajos), ...Object.fromEntries(renombradas.map(([vieja, nueva]) => [claveDeBloque(nueva), untrack(trabajos)[claveDeBloque(vieja)]])) });
  });
  const claveFila = (b: Bloque) => claveDeBloque(props.msgs[b.i]?.clave ?? clavesDelHilo().deBloque.get(b) ?? String(b.i));
  const bloqueDeLectura = (lectura: Lectura) => {
    const at = clavesDelHilo().lista.indexOf(lectura.clave);
    return at < 0 ? null : at;
  };
  // Sin layout (jsdom) todo mide cero: el hilo se monta entero por tramos.
  const hiloVirtual = typeof ResizeObserver !== "undefined" && document.documentElement.getBoundingClientRect().width > 0 && !localStorage.getItem(HILO_POR_TRAMOS);
  // En su propio trozo: la carga inicial tiene techo y el hilo llega después de pintar la ventana.
  const [hiloDeFilasListo, setHiloDeFilasListo] = createSignal<typeof import("./VirtualThread").VirtualThread>();
  if (hiloVirtual) void import("./VirtualThread").then((module) => setHiloDeFilasListo(() => module.VirtualThread));
  let hiloDeFilas: VirtualThreadApi | undefined;
  let lecturaPorSaltar: Lectura | null = null;
  const saltarALaLectura = () => {
    const lectura = lecturaPorSaltar;
    const bloque = lectura && bloqueDeLectura(lectura);
    if (!lectura || bloque === null || !hiloDeFilas) return;
    lecturaPorSaltar = null;
    void hiloDeFilas.jump(bloque, lectura.desfase);
  };
  const volverAReciente = () => void Promise.resolve(props.onRecientes?.()).then(() => hilo.bajar({ animacion: "instantanea", duracion: 300, ignorarEscapes: true }));
  const [primeraFila, setPrimeraFila] = createSignal<number | null>(null);
  const [cajaDeFilas, setCajaDeFilas] = createSignal<HTMLElement>();
  // Una instancia por conversación: ninguna medida ni fila pasa de una tarea a otra.
  const cajaVirtual = createMemo<{ el: HTMLElement } | undefined>((previa) => {
    const el = cajaDeFilas();
    props.conversacion;
    return el ? { el } : previa && undefined;
  });
  createEffect(() => {
    if (!hiloVirtual || !props.masAntiguos || props.estadoAntiguos === "failed" || props.estadoAntiguos === "loading") return;
    const fila = primeraFila();
    if (fila !== null && fila <= FILAS_ANTES_DE_PEDIR) void pedirAntiguos();
  });
  const [retenidas, setRetenidas] = createSignal<ReadonlySet<string>>(new Set());
  const retenerFila = (clave: string | null, motivo: string) => setRetenidas((todas) => {
    const previa = motivos.get(motivo) ?? null;
    if (previa === clave) return todas;
    if (clave) motivos.set(motivo, clave);
    else motivos.delete(motivo);
    return new Set(motivos.values());
  });
  const motivos = new Map<string, string>();
  const filasRetenidas = createMemo<ReadonlySet<string>>(() => {
    const fija = retenidas();
    const viva = props.busy ? clavesDelHilo().lista.at(-1) : undefined;
    return viva ? new Set([...fija, viva]) : fija;
  });
  const filaDe = (nodo: Node | null | undefined) =>
    (nodo instanceof Element ? nodo : nodo?.parentElement)?.closest<HTMLElement>("[data-thread-key]")?.dataset.threadKey ?? null;
  const altoEstimado = (index: number) => {
    const b = bloques()[index];
    if (!b) return 80;
    return estimateBlock(b.tipo, b.tipo === "pasos" ? 0 : b.msg.text.length, b.tipo === "msg" ? 0 : b.pasos.length);
  };
  // El primer tramo montado se fija al cargar la conversación y solo retrocede:
  // si avanzara con cada mensaje nuevo, desmontaría lo que alguien lee arriba.
  const bloqueInicial = props.lectura && !hiloVirtual ? bloqueDeLectura(props.lectura) : null;
  const [firstChunk, setFirstChunk] = createSignal<number | null>(
    bloqueInicial === null ? null : Math.floor(bloqueInicial / CHUNK),
  );
  // Hasta qué final cabe todo en la vista: el borde de arriba volvió a anteponer lo soltado sin que nadie subiera.
  const [cabeHasta, setCabeHasta] = createSignal<number | null>(null);
  // Bloques que entraron por delante con páginas anteriores del historial.
  const [origen, setOrigen] = createSignal(0);
  let recienSoltado = false;
  createEffect(on(() => props.conversacion, () => {
    setFirstChunk(null);
    setOrigen(0);
    setCabeHasta(null);
  }, { defer: true }));
  // Plegar el avance de un turno encoge el hilo: lo montado no pasa del final.
  const shownFrom = createMemo(() => {
    if (hiloVirtual) return headChunk(origen());
    if (typeof IntersectionObserver === "undefined") return headChunk(origen());
    const tail = tailChunk(bloques().length, origen());
    return Math.min(firstChunk() ?? tail, tail);
  });
  createEffect(() => {
    const first = firstChunk();
    if (first === null ? !props.cargando && bloques().length > 0 : first > shownFrom()) setFirstChunk(shownFrom());
  });
  const chunks = createMemo(() => chunkIds(bloques().length, shownFrom(), origen()));
  // Lo leído arriba se suelta cuando se vuelve al final y se queda ahí: sin
  // esto cada tramo que alguien subió a leer queda montado hasta cerrar la pestaña.
  const sobranTramos = createMemo(() => {
    const tail = tailChunk(bloques().length, origen());
    return !hiloVirtual && hilo.alFondo() && shownFrom() < tail && cabeHasta() !== tail;
  });
  createEffect(() => {
    if (!sobranTramos()) return;
    const t = setTimeout(() => {
      recienSoltado = true;
      setFirstChunk(tailChunk(bloques().length, origen()));
    }, SOLTAR_LO_LEIDO_MS);
    onCleanup(() => clearTimeout(t));
  });
  onCleanup(() => {
    const lectura = hilo.lectura();
    if (!lectura) return props.onLectura?.(null);
    const clave = hiloVirtual
      // Del nodo y no de su sitio: al desmontar, las filas ya salieron del hilo.
      ? (lectura.el as HTMLElement).dataset.threadKey
      : clavesDelHilo().lista[chunkStart(shownFrom(), origen()) + lectura.hijo];
    props.onLectura?.(clave ? { clave, desfase: lectura.desfase } : null);
  });
  createEffect(() => props.onLeyendo?.(!hilo.alFondo()));
  // Lo anterior entra por delante del tramo 0: lo montado conserva sus ids y no se remonta.
  let pidiendo = false;
  const pedirAntiguos = async () => {
    if (pidiendo || !props.onAntiguos) return;
    pidiendo = true;
    const conversacion = props.conversacion;
    const poner = await props.onAntiguos().finally(() => {
      pidiendo = false;
    });
    if (!poner || conversacion !== props.conversacion) return;
    if (hiloVirtual) return batch(poner);
    const cabeza = bloques()[0];
    const primero = cabeza && props.msgs[cabeza.i];
    hilo.anteponer(() =>
      batch(() => {
        poner();
        const at = primero ? props.msgs.indexOf(primero) : -1;
        const bloque = at > 0 ? bloques().findIndex((b) => b.i === at) : -1;
        if (bloque > 0) setOrigen((o) => o + bloque);
      }),
    );
  };
  // Va con el borde y no con el componente: el hilo se desmonta mientras carga.
  const watchOlder = (edge: HTMLDivElement) => {
    if (typeof IntersectionObserver === "undefined" || hiloVirtual) return;
    const older = new IntersectionObserver(
      (entries) => {
        // Tras volver a observar pueden llegar dos: la que vale es la última.
        if (!entries.at(-1)?.isIntersecting) return;
        if (shownFrom() <= headChunk(origen())) {
          if (props.masAntiguos) void pedirAntiguos();
          return;
        }
        if (recienSoltado && hilo.alFondo()) setCabeHasta(tailChunk(bloques().length, origen()));
        recienSoltado = false;
        hilo.anteponer(() => setFirstChunk(shownFrom() - 1));
      },
      { root: edge.parentElement, rootMargin: "1200px 0px 0px 0px" },
    );
    older.observe(edge);
    let frame = 0;
    // Volver a observar entrega el estado actual: sin esto, un tramo que no
    // llena la vista deja el borde a la vista y no llega otro aviso.
    createEffect(
      on([shownFrom, origen, () => props.masAntiguos], () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          older.unobserve(edge);
          older.observe(edge);
        });
      }),
    );
    // Un cuadro que llega después del desmontaje volvería a observar el borde suelto y retendría el hilo entero.
    onCleanup(() => {
      cancelAnimationFrame(frame);
      older.disconnect();
    });
  };

  // Un input por marca, incluido el que llegó de un encargado o de otra tarea.
  const inputsDelHilo = createMemo<InputMessage[]>(
    () =>
      bloques().flatMap((bloque, j) => {
        const m = mensajeDe(bloque)?.msg;
        if (!m || m.role !== "user" || m.shell || m.permission) return [];
        const texto = m.text.trim().replace(/\s+/g, " ")
          || m.attachments?.map((rel) => rel.split("/").pop()).join(", ")
          || (m.meta === "hidden_task" ? t("chat.subagent.hidden_task") : "");
        const sender = m.encargado ? { kind: "agent" as const, name: m.encargado }
          : m.fromTask ? { kind: "task" as const, agent: m.fromTask.provider, model: m.fromTask.model }
          : m.author && m.author.kind !== "person" ? { kind: "agent" as const, name: m.author.kind }
          : undefined;
        return texto ? [{ block: j, text: texto, sender }] : [];
      }),
    [],
    // `bloques()` se rehace con cada delta; la lista del riel solo cambia cuando entra un mensaje.
    { equals: (a, b) => a.length === b.length && a.every((m, k) => m.block === b[k].block && m.text === b[k].text && mismoRemitente(m.sender, b[k].sender)) },
  );
  const [cajaDelHilo, setCajaDelHilo] = createSignal<{ ancho: number; alto: number }>({ ancho: 0, alto: 0 });
  const [mensajeVisto, setMensajeVisto] = createSignal(0);
  let elHilo: HTMLElement | undefined;
  const [searchThread, setSearchThread] = createSignal<HTMLElement>();
  let elContenido: HTMLElement | undefined;
  const rielVisible = () => inputsDelHilo().length > 0 && cajaDelHilo().ancho >= ANCHO_DEL_RIEL && cajaDelHilo().alto - altoDeLaCaja() >= 48;
  /** El mensaje cuyo turno ocupa el tercio de arriba de lo que se ve; abajo del todo, el último. */
  const medirMensajeVisto = () => {
    const lista = inputsDelHilo();
    if (!elHilo || !lista.length) return;
    if (hilo.alFondo()) return setMensajeVisto(lista.length - 1);
    const hijos = elContenido?.children;
    const montadoDesde = chunkStart(shownFrom(), origen());
    const corte = elHilo.getBoundingClientRect().top + (elHilo.clientHeight - altoDeLaCaja()) / 3;
    if (hiloVirtual) {
      const borde = corte - elHilo.getBoundingClientRect().top;
      for (let k = lista.length - 1; k >= 0; k--) {
        const arriba = hiloDeFilas?.topOf(lista[k].block);
        if (arriba !== null && arriba !== undefined && arriba <= borde) return setMensajeVisto(k);
      }
      return setMensajeVisto(0);
    }
    for (let k = lista.length - 1; k >= 0; k--) {
      const el = hijos?.[lista[k].block - montadoDesde];
      if (lista[k].block < montadoDesde || (el && el.getBoundingClientRect().top <= corte)) return setMensajeVisto(k);
    }
    setMensajeVisto(0);
  };
  const tomarHilo = (el: HTMLElement) => {
    hilo.contenedor(el);
    elHilo = el;
    setSearchThread(el);
    // Tras insertarla: recién clonada del `<template>` su documento no tiene ventana ni observadores.
    createEffect(() => setCajaDeFilas(el));
    let espera: ReturnType<typeof setTimeout> | undefined;
    const alScrollear = () => {
      clearTimeout(espera);
      espera = setTimeout(medirMensajeVisto, ESPERA_DEL_RIEL_MS);
    };
    el.addEventListener("scroll", alScrollear, { passive: true });
    const alEnfocar = (e: FocusEvent) => retenerFila(filaDe(e.target as Node), "foco");
    const alDesenfocar = (e: FocusEvent) => { if (!el.contains(e.relatedTarget as Node | null)) retenerFila(null, "foco"); };
    const alPulsar = (e: PointerEvent) => retenerFila(filaDe(e.target as Node), "gesto");
    const alSoltar = () => retenerFila(null, "gesto");
    const alSeleccionar = () => {
      const seleccion = document.getSelection();
      const dentroDelHilo = seleccion && !seleccion.isCollapsed && el.contains(seleccion.anchorNode);
      retenerFila(dentroDelHilo ? filaDe(seleccion.anchorNode) : null, "seleccion");
      retenerFila(dentroDelHilo ? filaDe(seleccion.focusNode) : null, "seleccion-fin");
    };
    if (hiloVirtual) {
      el.addEventListener("focusin", alEnfocar);
      el.addEventListener("focusout", alDesenfocar);
      el.addEventListener("pointerdown", alPulsar);
      window.addEventListener("pointerup", alSoltar);
      window.addEventListener("pointercancel", alSoltar);
      document.addEventListener("selectionchange", alSeleccionar);
      onCleanup(() => {
        el.removeEventListener("focusin", alEnfocar);
        el.removeEventListener("focusout", alDesenfocar);
        el.removeEventListener("pointerdown", alPulsar);
        window.removeEventListener("pointerup", alSoltar);
        window.removeEventListener("pointercancel", alSoltar);
        document.removeEventListener("selectionchange", alSeleccionar);
        motivos.clear();
        setRetenidas(new Set<string>());
      });
    }
    // `clientWidth` y no la entrada: sin layout —jsdom— no hay ancho, y el riel no tiene dónde ir.
    const ojo = typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(() => setCajaDelHilo({ ancho: el.clientWidth, alto: el.clientHeight }));
    ojo?.observe(el);
    onCleanup(() => {
      clearTimeout(espera);
      el.removeEventListener("scroll", alScrollear);
      ojo?.disconnect();
      if (elHilo === el) { elHilo = undefined; setSearchThread(undefined); setCajaDeFilas(undefined); }
    });
  };
  createEffect(on([inputsDelHilo, hilo.alFondo], () => medirMensajeVisto()));
  /** Monta el tramo del mensaje si no estaba y lo deja arriba, suelto del fondo. */
  const saltarAlMensaje = (bloque: number) => {
    if (hiloVirtual) {
      hilo.soltar();
      void hiloDeFilas?.jump(bloque, DESFASE_DEL_SALTO).then(medirMensajeVisto);
      return;
    }
    const tramo = chunkAt(bloque, origen());
    if (tramo < shownFrom()) hilo.anteponer(() => setFirstChunk(tramo));
    hilo.retomar(bloque - chunkStart(shownFrom(), origen()), DESFASE_DEL_SALTO);
    medirMensajeVisto();
  };

  onMount(() => props.onSearchReady?.({ messages: searchMessages, thread: searchThread, jump: saltarAlMensaje, move: (delta) => hilo.escribir((elHilo?.scrollTop ?? 0) + delta, true) }));
  onCleanup(() => props.onSearchReady?.(null));

  /**
   * La herramienta que está corriendo ahora mismo, si hay una. Se busca
   * desde el final y se para en la primera: los pasos se cierran
   * emparejando por `id` (`App.tsx`), puede quedar más de uno abierto si
   * un cierre se perdió, y el que importa es el último que salió.
   */
  const pasoVivo = createMemo(() => {
    for (let i = props.msgs.length - 1; i >= 0; i--) {
      const paso = props.msgs[i].paso;
      if (paso?.corriendo) return paso;
    }
    return null;
  });

  const respondido = createMemo(() => {
    const m = new Map<string, Respuesta[]>();
    for (const msg of props.msgs)
      for (const r of msg.respuestas ?? [])
        m.set(r.turn, [...(m.get(r.turn) ?? []), r]);
    return m;
  });
  const preguntaPendiente = createMemo(() =>
    props.msgs.find(
      (msg) =>
        msg.turno &&
        msg.preguntas?.some(
          (pregunta) =>
            !respondido()
              .get(msg.turno!)
              ?.some((respuesta) => respuesta.question === pregunta.id),
        ),
    ),
  );
  /**
   * Lo encolado que puede entrar en el turno vivo: ni lo que ya está entrando
   * ni lo que lleva menciones, que el backend no inyecta.
   */
  const steerables = () =>
    props.cola.onMandarAhora
      ? props.cola.items.filter((q) => !props.cola.pending?.includes(q.id) && inyectable(q))
      : [];

  const nombreDelAgente = (id?: string) => {
    const agente = id ?? props.agent;
    return props.agents.find((a) => a.id === agente)?.label ?? agente;
  };
  // La salida de un `!` viaja con lo siguiente que lea el agente.
  const salidaSinLeer = (i: number) =>
    !props.msgs.slice(i + 1).some((m) => m.role === "user" || m.role === "agent" || m.meta === "shell_reply");
  // Las menciones cuentan desde el principio del mensaje; el tramo sin comando empieza más adelante.
  const mencionesDesde = (menciones: TaskMention[] | undefined, desde: number) =>
    menciones
      ?.filter((x) => x.start >= desde)
      .map((x) => ({ ...x, start: x.start - desde, end: x.end - desde }));
  const pieDeTerminal = (i: number) => {
    const respuesta = props.msgs.slice(i + 1).find((m) => m.role === "user" || m.role === "agent" || m.meta === "shell_reply" || m.shell);
    if (respuesta?.meta === "shell_reply") return t("chat.shell.reply", { agent: nombreDelAgente(respuesta.agent) });
    if (!salidaSinLeer(i)) return null;
    if (props.contestandoALaTerminal) return t("chat.shell.reply", { agent: nombreDelAgente() });
    return t("chat.shell.pending", { agent: nombreDelAgente() });
  };
  // Mientras corre un `!`, la caja le escribe a él; Esc la devuelve al agente
  // hasta el siguiente comando. Lo tecleado no pasa por el borrador: puede ser una clave.
  const [soltadoDe, setSoltadoDe] = createSignal<string | null>(null);
  const [entrada, setEntrada] = createSignal("");
  const entradaActiva = () =>
    Boolean(props.onEntradaDeComando && props.terminal?.id && soltadoDe() !== props.terminal.id);
  const entradaOculta = () => entradaActiva() && pideClave(props.terminal?.output ?? "");
  createEffect(on(() => props.terminal?.id, () => setEntrada("")));
  async function teclearAlComando(texto: string) {
    const mandarla = props.onEntradaDeComando;
    if (!mandarla) return;
    const eco = !entradaOculta();
    setEntrada("");
    if (!(await mandarla(texto, eco))) setSoltadoDe(props.terminal?.id ?? null);
  }
  const modoTerminal = () => entradaActiva() || props.input.startsWith("!");
  const modoAlMargen = () =>
    Boolean(props.sideCommand) && props.input.toLowerCase().startsWith(`/${props.sideCommand} `);
  const carpetaDeTerminal = () => {
    const conocida = props.terminal?.cwd ?? props.carpetaDeTerminal;
    if (conocida) return conocida;
    for (let i = props.msgs.length - 1; i >= 0; i--) {
      const cwd = props.msgs[i].shell?.cwd;
      if (cwd) return cwd;
    }
    return null;
  };
  /** En orden y de uno en uno: dos inyecciones a la vez llegan como quieran. */
  async function steerCola() {
    const mandar = props.cola.onMandarAhora;
    if (!mandar) return;
    for (const encolado of steerables()) await mandar(encolado.id);
  }

  const [cancelandoPregunta, setCancelandoPregunta] = createSignal(false);
  async function cancelarPregunta(turno: string) {
    if (cancelandoPregunta()) return;
    setCancelandoPregunta(true);
    try {
      await props.onCancelarPregunta(turno);
    } catch {
      // El fallo ya se dijo en el hilo; la pregunta se queda como estaba.
    } finally {
      setCancelandoPregunta(false);
    }
  }

  /**
   * Si hay dónde poner un archivo que se suelte ahora mismo. Es la misma
   * condición que pinta la lista de adjuntos, se escribe mirándola: con
   * una pregunta del agente sin contestar la caja se sustituye por ella,
   * un adjunto entraría sin verse.
   */

  /**
   * Que la cuenta no sirva o que el agente esté trabajando no bloquea:
   * adjuntar es preparar el mensaje, no mandarlo — el motivo por el que
   * no se puede mandar ya se dice al pie de la caja.
   */
  const puedeAdjuntar = () => !preguntaPendiente() || Boolean(props.permission);

  /**
   * La caja de escribir: componente y no nodo guardado, se monta en dos
   * sitios —centrada cuando la conversación está vacía, al pie cuando hay
   * hilo— (SYSTEM.md § Las reglas de Solid, regla 9). Cada montaje crea su
   * propio nodo para no dejar una de las dos ramas vacía.
   */

  /**
   * Las fuentes de la tarea: lo que ya lee y lo que entrará con el próximo
   * mensaje, en una sola fila. Separarlos en dos sitios obligaba a mirar dos
   * veces para saber qué alcanza esta tarea.
   */
  const fuentes = createMemo(() => {
    const vistas = new Map<string, Source>();
    for (const f of [...props.contexto, ...props.material]) {
      if (!vistas.has(f.id)) vistas.set(f.id, f);
    }
    return [...vistas.values()];
  });

  /**
   * Cuánto alto tapa la caja flotante, para dejárselo libre al hilo por
   * abajo. Se mide, no se supone: la caja crece con lo que se escribe y
   * también recibe colas, preguntas o permisos; con un número fijo, la
   * última línea de la conversación quedaba detrás justo cuando más alta
   * era, y sin error.
   */

  /**
   * `ResizeObserver` se pregunta antes de usarlo: jsdom no lo tiene y ahí
   * corre el guarda `mount-frontend`, que evalúa el bundle entero. Sin la guarda,
   * el primer render lanzaría y la app abriría con el esqueleto puesto.
   */
  const [altoDeLaCaja, setAltoDeLaCaja] = createSignal(0);
  const medirCaja = (el: HTMLDivElement) => {
    // Un cero no es una medida, es que todavía no hay layout: el `ref`
    // corre antes de que el elemento tenga caja, la primera lectura es 0
    // y el hueco reservado cae a 12 px hasta que el observador habla. Eso
    // es `scrollHeight` moviéndose ~120 px de golpe.

    // Con la caja montándose cada vez que una ventana toma el mando
    // (`Show` sobre `soloLectura`), eso parpadea al elegir ventana en
    // pantalla partida. Al no escribirlo, el valor anterior se conserva y
    // la geometría del hilo no cambia por activar una ventana.
    const alto = (el: HTMLDivElement) => {
      const medido = el.offsetHeight;
      if (medido > 0) setAltoDeLaCaja(medido);
    };
    alto(el);
    if (typeof ResizeObserver === "undefined") return;
    const ojo = new ResizeObserver(() => alto(el));
    ojo.observe(el);
    onCleanup(() => {
      ojo.disconnect();
      // Sin caja el hueco es cero: conservar la última medida al
      // desmontarse era lo que dejaba el botón de «Ir al final» flotando
      // en mitad del hilo, en pantalla partida la caja se va cuando la
      // ventana deja de mandar, y el botón se quedaba a la altura donde
      // la caja estaba. El valor se conserva mientras la caja existe —lo
      // que evita el parpadeo del cero previo al layout— y se suelta al desmontarse.
      setAltoDeLaCaja(0);
    });
  };

  let composerBox: HTMLDivElement | undefined;
  const [menuAnchor, setMenuAnchor] = createSignal<DOMRect | null>(null);
  const measureMenu = () => setMenuAnchor(composerBox?.getBoundingClientRect() ?? null);
  createEffect(on(menuOpen, (abierto) => {
    if (!abierto || !composerBox) return;
    measureMenu();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measureMenu);
    observer?.observe(composerBox);
    window.addEventListener("resize", measureMenu);
    onCleanup(() => {
      observer?.disconnect();
      window.removeEventListener("resize", measureMenu);
    });
  }));

  const Caja = () => (
    <div
      ref={composerBox}
      class={cn(
        "relative flex max-h-full min-h-0 w-full flex-col overflow-hidden",
        "max-w-[860px]",
        !props.permission && preguntaPendiente() && !preguntaPlegada() && "h-full",
      )}
    >
      {/* El menú va a <body>: aquí dentro lo recortan la caja y las dos capas
          que la contienen, todas con overflow-hidden. */}
      <Show when={menuOpen() && menuAnchor()}>
        {(punto) => (
          <Portal>
            <div
              class="fixed z-50"
              style={{ top: `${punto().top}px`, left: `${punto().left}px`, width: `${punto().width}px` }}
            >
              <Suggestions
                items={suggestions()}
                index={picked()}
                truncated={trigger()?.kind === "@" && (props.mentionSources?.truncado || searchTasks(props.taskCandidates ?? [], trigger()?.query ?? "", props.mentionProject ?? "", props.mentionSession).length > 40)}
                empty={
                  trigger()?.kind === "@"
                    ? t("chat.mentions.no_match")
                    : t("chat.commands.no_match")
                }
                onPick={(s) => {
                  if (!s.disabled) insertSuggestion(s.value);
                }}
              />
            </div>
          </Portal>
        )}
      </Show>

      {/* Pegada a la caja y encima: lo que va a salir después está donde se
          escribió, no en una columna aparte. */}
      <ColaDeMensajes {...props.cola} compact={presentation().compactQueue} onOpenTask={props.onOpenTask} />

      {/* Las dos interrupciones viven en el mismo sitio, pero no pesan igual.
          La pregunta es una decisión de producto; el permiso ejecuta algo y
          exige un acto separado, con el literal que Rust conserva. */}
      <Show when={props.permission}>
        {(permission) => {
          return (
            <BloqueDeInterrupcion kind="permission" class="p-3">
              <p class="m-0 text-sm font-semibold">
                {t("chat.permission.title")}
              </p>
              <p class="m-0 text-sm">
                {t("chat.permission.needs_approval", {
                  tool: permission().tool,
                })}
              </p>
              <Show when={permission().origin?.foreign ? permission().origin : null}>
                {(origin) => (
                  <p class="m-0 flex items-center gap-2 rounded-sm border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning-strong">
                    <MarcaFuente
                      location={origin().location}
                      kind={origin().kind}
                    />
                    <span class="min-w-0">
                      <strong class="font-semibold">{origin().etiqueta}</strong>{" "}
                      {t("chat.permission.foreign")}
                    </span>
                  </p>
                )}
              </Show>
              <Show when={permission().target}>
                {(target) => (
                  <code class="max-h-40 overflow-auto rounded-sm border border-border bg-surface-muted p-3 font-mono text-xs break-words whitespace-pre-wrap">
                    {target()}
                  </code>
                )}
              </Show>
              <Show when={props.permissionError}>
                {(error) => <p class="m-0 text-sm text-error-strong">{error()}</p>}
              </Show>
              <div class="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={props.stopping}
                  onClick={() => void props.onStop()}
                >
                  {props.stopping ? t("chat.turn.stopping") : t("chat.turn.stop")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  ref={enfocar}
                  disabled={props.respondingPermission}
                  onClick={() => props.onPermission(permission(), false)}
                >
                  {t("chat.permission.deny")}
                </Button>
                <Button
                  size="sm"
                  disabled={props.respondingPermission}
                  onClick={() => props.onPermission(permission(), true)}
                >
                  {t("chat.permission.approve")}
                </Button>
              </div>
            </BloqueDeInterrupcion>
          );
        }}
      </Show>

      {/* Encima de la caja: lo que la tarea lee se ve antes de escribir, no
          dentro del control de escribir. Dónde escribe no es una fuente: es
          la carpeta de trabajo del proyecto, en el panel de la columna. */}
      <Alcance
        rotulo={t("chat.scope.sources")}
        agregar={t("chat.scope.sources_add")}
        items={fuentes()}
        materialOptions={props.materialOptions}
        materialTarget={props.materialTarget}
        materialAvailable={props.materialAvailable}
        bloqueado={props.busy}
        onTraer={props.onAdjuntarFuente}
        onQuitar={props.onQuitarFuente}
        onCambiarRama={props.onCambiarRama}
      />

      <form
        class={cn(
          !props.permission && preguntaPendiente()
            ? cn(
                "grid max-h-full min-w-0 grid-rows-[minmax(0,1fr)] overflow-hidden rounded-lg border border-border-strong bg-surface-raised shadow-md",
                !preguntaPlegada() && "h-full",
              )
            : cn(
                "grid min-w-0 gap-1.5 rounded-lg border border-border-strong bg-surface-raised px-1 pt-0.5 pb-1.5 shadow-md",
                presentation().composer,
                (modoAlMargen() || (menuOpen() && trigger()?.kind === "/")) && "border-primary/50",
                // Se ve antes de mandar que esto no va al modelo.
                modoTerminal() && "border-neutral-950",
              ),
        )}
        onSubmit={(e) => {
          e.preventDefault();
          void mandar();
        }}
      >
        <input
          ref={entradaArchivo}
          type="file"
          multiple
          class="hidden"
          onChange={(e) => {
            // El `<input type=file>` del webview tampoco da rutas de disco:
            // el selector real es el de Tauri. Este existe solo para que el
            // botón sea un control de archivo de verdad ante el sistema.
            e.currentTarget.value = "";
            void elegirArchivos();
          }}
        />

        <Show when={!props.permission && preguntaPendiente()}>
          {(msg) => (
            <>
              <Show when={preguntaPlegada()}>
                <div class="flex min-w-0 items-center gap-2 px-3 py-2">
                  <span class="min-w-0 flex-1 truncate text-sm font-medium text-neutral-700">
                    {t("chat.questions.title")} · {msg().preguntas![0].question}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    class="size-8 shrink-0 rounded-full"
                    aria-label={t("chat.questions.expand")}
                    title={t("chat.questions.expand")}
                    onClick={() => setPlegadaEn(null)}
                  >
                    <Maximize2 size={15} />
                  </Button>
                </div>
              </Show>
              <div
                class={cn(
                  "h-full min-h-0 min-w-0 overflow-hidden",
                  preguntaPlegada() && "hidden",
                )}
              >
                <Preguntas
                  turno={msg().turno!}
                  items={msg().preguntas!}
                  onResponder={props.onResponder}
                  onCancelar={() => void cancelarPregunta(msg().turno!)}
                  onPlegar={() => setPlegadaEn(msg().turno!)}
                  almacen={props.preguntasAMedias}
                />
              </div>
            </>
          )}
        </Show>

        <Show when={!preguntaPendiente() || props.permission}>

        <Show when={attachmentFailure()}>
          {(failure) => <FailureNote f={failure()} />}
        </Show>

        {/* Aquí solo van los archivos, no el material: el material vive en
            las filas de alcance de arriba, ponerlo también aquí lo
            enseñaría dos veces en la misma pantalla, con dos formas de
            quitarlo que hacen cosas distintas. Un archivo sí es de este
            mensaje y solo de este. */}
        <Show when={props.adjuntos.length > 0}>
          {/* Una fila y no varias: si envuelve, la bandeja crece hasta tapar
              el campo de texto. */}
          <div
            class="flex gap-2 overflow-x-auto overflow-y-hidden px-1 pt-1 pb-1 select-none"
            onWheel={rodarEnHorizontal}
          >
            <For each={props.adjuntos}>
              {(p) => (
                <div class="group relative shrink-0">
                  <Adjunto rel={p} miniatura={props.onMiniatura} preview={props.onPreview} />
                  {/* Dentro de la esquina: fuera de ella, el scroll horizontal la recorta. */}
                  <button
                    type="button"
                    class="absolute top-1 right-1 grid size-[1.125rem] place-items-center rounded-full bg-neutral-950 text-neutral-50 opacity-0 ring-2 ring-surface-raised transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
                    aria-label={t("chat.attachments.remove", {
                      name: nombreDe(p),
                    })}
                    title={t("chat.attachments.remove", { name: nombreDe(p) })}
                    onClick={() =>
                      props.onAdjuntos(props.adjuntos.filter((x) => x !== p))
                    }
                  >
                    <X size={11} />
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={modoAlMargen() && props.sideCommand}>
          {(comando) => (
            <div class="flex min-w-0 items-center gap-2 px-2 pt-1.5">
              <span class="inline-flex h-5 items-center gap-1 rounded-[5px] bg-side/10 px-[7px] text-xs font-medium text-side">
                <MessageCircleQuestion size={12} aria-hidden="true" />
                /{comando()}
              </span>
              <span class="min-w-0 truncate text-caption text-neutral-500">{t("chat.side.mode")}</span>
            </div>
          )}
        </Show>

        <Show when={props.alMargen}>
          {(estado) => (
            <PanelAlMargen
              estado={estado()}
              onCerrar={() => props.onCerrarAlMargen?.()}
              onPasarAlHilo={() => props.onPasarAlHilo?.()}
              onSeguir={() => {
                props.onInput(`/${props.sideCommand ?? "btw"} `);
                if (campo) enfocar(campo);
              }}
            />
          )}
        </Show>

        <Show when={modoTerminal() || (props.terminal?.id && props.onEntradaDeComando)}>
          <div class="flex min-w-0 items-center gap-2 px-2 pt-1.5">
            <Show
              when={modoTerminal()}
              fallback={
                <button
                  type="button"
                  class="flex h-5 items-center gap-1 rounded-[5px] px-[7px] text-caption font-medium text-neutral-700 outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => {
                    setSoltadoDe(null);
                    if (campo) enfocar(campo);
                  }}
                >
                  <SquareTerminal size={12} aria-hidden="true" />
                  {t("chat.composer.stdin.attach")}
                </button>
              }
            >
              <Badge forma="dato" tone="terminal" class="h-5 gap-1 rounded-[5px] px-[7px] py-0 font-sans font-medium">
                <SquareTerminal size={12} aria-hidden="true" />
                {entradaActiva() ? t("chat.composer.stdin") : t("chat.composer.terminal")}
              </Badge>
            </Show>
            <Show when={entradaActiva()}>
              <span class="min-w-0 truncate text-caption text-neutral-500">{t("chat.composer.stdin.hint")}</span>
            </Show>
            <Show when={!entradaActiva() && carpetaDeTerminal()}>
              {(carpeta) => (
                <span class="min-w-0 truncate font-mono text-caption text-neutral-500" title={carpeta()}>
                  {carpeta()}
                </span>
              )}
            </Show>
          </div>
        </Show>

        <div class="relative min-w-0">
        {/* La capa y el campo salen de `METRICA_DEL_CAMPO`, y de ahí los dos:
            escribirla dos veces es lo que las dejó con tamaños distintos. */}
        <Show when={hasHighlight() && !entradaActiva()}>
          <div
            ref={mirror}
            aria-hidden="true"
            class={cn(
              "pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-neutral-950",
              METRICA_DEL_CAMPO,
              modoTerminal() && FUENTE_DE_TERMINAL,
            )}
          >
            <For each={fieldSpans()}>
              {(tramo) => (
                <Show when={tramo.kind} fallback={tramo.text}>
                  {/* Dos clases y no un atributo: el material lleva el color de
                      referencia y el destinatario el de acción, que es el de
                      llamar a alguien. Con la misma clase para los dos, la
                      diferencia no se descubría hasta que el mensaje ya se fue. */}
                  {(kind) => (
                    <span data-kind={kind()} class={claseDelTramo(kind())}>
                      {tramo.text}
                    </span>
                  )}
                </Show>
              )}
            </For>
            {" "}
          </div>
        </Show>
        <Textarea
          variant="ghost"
          rows={1}
          ref={tomarCampo}
          class={cn(
            "relative block max-h-[11.25rem] min-h-10 overflow-y-auto",
            METRICA_DEL_CAMPO,
            modoTerminal() && FUENTE_DE_TERMINAL,
            hasHighlight() && !entradaActiva() && "text-transparent caret-neutral-950",
            entradaOculta() && "[-webkit-text-security:disc]",
          )}
          autocomplete="off"
          spellcheck={!entradaActiva()}
          onScroll={(e) => {
            if (mirror) mirror.scrollTop = e.currentTarget.scrollTop;
          }}
          value={entradaActiva() ? entrada() : props.input}
          // El placeholder invita a escribir. El motivo por el que no se puede
          // mandar vive abajo, junto a la superficie que lo provoca: aquí se
          // cortaba y desaparecía en cuanto alguien escribía una letra.
          placeholder={
            entradaActiva()
              ? entradaOculta()
                ? t("chat.composer.placeholder.secret")
                : t("chat.composer.placeholder.stdin")
              : dirigido()
              ? t("chat.composer.placeholder.deliver")
              : props.esperando
                ? t("chat.composer.placeholder.answer")
                : props.busy
                  ? t("chat.composer.placeholder.next")
                  : t("chat.composer.placeholder.ask")
          }
          // Deshabilitar el campo le quita el foco: preparar un adjunto pegado
          // o soltado no lo cierra, solo impide mandar (`listo()`).
          disabled={!escribible()}
          enterkeyhint="send"
          onPaste={pegar}
          onBeforeInput={(e) => {
            pendingEdit = { text: e.currentTarget.value, start: e.currentTarget.selectionStart,
              end: e.currentTarget.selectionEnd, inputType: e.inputType };
          }}
          onInput={(e) => {
            if (entradaActiva()) {
              setEntrada(e.currentTarget.value);
              return;
            }
            const valor = e.currentTarget.value;
            const caret = e.currentTarget.selectionStart ?? valor.length;
            const sangrado = sangrarTerminal(props.input, valor, caret, e.inputType);
            if (sangrado.text === valor) {
              props.onInput(valor, e.inputType, finishEdit(pendingEdit, valor));
            } else {
              pendingCaret = sangrado.caret;
              props.onInput(sangrado.text, e.inputType);
            }
            pendingEdit = undefined;
            setCaret(sangrado.caret);
          }}
          // El cursor se mueve con el ratón y con las flechas sin que cambie el
          // texto, y de dónde esté depende qué menú corresponde.
          onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onKeyDown={(e) => {
            if (entradaActiva() && !e.isComposing) {
              const tecla = !entrada() ? TECLAS_DE_TERMINAL[e.key] : undefined;
              if (tecla && !e.shiftKey && !e.metaKey && !e.altKey && !e.ctrlKey) {
                e.preventDefault();
                void teclearAlComando(tecla);
              } else if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void teclearAlComando(`${entrada()}\r`);
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setSoltadoDe(props.terminal?.id ?? null);
              } else if (e.ctrlKey && e.key.toLowerCase() === "d" && !entrada()) {
                e.preventDefault();
                void teclearAlComando(FIN_DE_ARCHIVO);
              } else if (e.ctrlKey && e.key.toLowerCase() === "c" && !props.stopping) {
                // En esta terminal `Ctrl+C` mataría también al shell: se detiene el `!`.
                e.preventDefault();
                void props.onStop();
              }
              return;
            }
            if (!e.isComposing && (e.metaKey || e.ctrlKey) &&
              (e.key.toLowerCase() === "z" || (e.ctrlKey && e.key.toLowerCase() === "y")) &&
              props.onMentionHistory?.(e.shiftKey || e.key.toLowerCase() === "y")) {
              e.preventDefault();
              pendingCaret = props.input.length;
              return;
            }
            // `shift+tab` cambia de modo, y solo dentro de esta caja. Va
            // antes que todo lo demás: el menú de `@` y `/` también usa Tab
            // —para aceptar la sugerencia—, y ahí Tab a secas es el gesto,
            // sin `shift`. Fuera de la caja el atajo no existe, para no
            // apropiarse de una tecla global que otras pantallas van a querer.

            // Lo que cuesta, dicho: desde aquí no se navega hacia atrás con
            // el teclado. `shift+tab` es esa tecla y capturarla se la quita
            // a este campo. No deja nada inalcanzable —`Tab` a secas lleva
            // al `+`, a este selector, al de modelo y al de enviar, y desde
            // el último se da la vuelta—, pero es un gesto que alguien
            // puede echar de menos.

            // La alternativa, capturarlo solo a veces, haría que el atajo
            // funcione o no según lo que haya escrito.

            // Si el agente no da más de un modo, no hace nada: `siguienteModo`
            // devuelve `null` en vez de fingir un cambio.
            if (e.key === "Tab" && e.shiftKey && !menuOpen()) {
              const siguiente = siguienteModo(props.modos, props.modo);
              if (siguiente) {
                e.preventDefault();
                cambiarModo(siguiente);
              }
              return;
            }
            if (menuOpen() && suggestions().length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setPick(habilitada((picked() + 1) % suggestions().length, 1));
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setPick(habilitada((picked() - 1 + suggestions().length) % suggestions().length, -1));
                return;
              }
              if (e.key === "Tab" || e.key === "Enter") {
                e.preventDefault();
                const suggestion = suggestions()[picked()];
                if (suggestion && !suggestion.disabled) insertSuggestion(suggestion.value);
                return;
              }
            }
            if (e.key === "Escape") {
              // Con el menú abierto, Esc cierra el menú. Vaciar la caja ahí
              // sería tirar el párrafo entero por pedir cerrar una lista.
              if (menuOpen()) {
                e.stopPropagation();
                setDismissed(true);
                return;
              }
              // Antes que detener: con el panel abierto, Esc es cerrarlo.
              if (props.alMargen && props.onCerrarAlMargen) {
                e.stopPropagation();
                props.onCerrarAlMargen();
                return;
              }
              // Y con la caja vacía, detiene el turno. Va la última de las
              // tres: quien escribió algo y pulsa Esc quiere limpiarlo, no
              // matar lo que está corriendo.
              if (!props.input && props.busy && !props.stopping) {
                e.stopPropagation();
                void props.onStop();
                return;
              }
              props.onInput("");
              return;
            }
            // Enter manda; Shift+Enter hace salto de línea.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              // Con la caja vacía, el Enter de más mete lo que espera en el
              // turno que corre. Es el gesto de la flecha de la cola, sin
              // soltar el teclado para alcanzarla.
              if (!props.input.trim() && steerables().length > 0) {
                void steerCola();
                return;
              }
              void mandar();
            }
          }}
        />
        </div>

        <Show when={bloqueoDeSuperficie()}>
          {(motivo) => (
            <p class="m-0 flex items-start gap-1.5 px-2 text-xs text-warning-strong">
              <TriangleAlert size={14} class="mt-0.5 shrink-0" />
              <span>{motivo()}</span>
            </p>
          )}
        </Show>

        <div class="flex min-w-0 items-center gap-1 px-2">
          {/* Vuelve a abrir el diálogo de archivos de golpe. Contexto y
              código tienen su propia fila encima de la caja, con su `+` y
              sus paneles anclados a él (`Alcance`): lo único que este botón
              significa es adjuntar un archivo a este mensaje, y un menú de
              una sola opción sería un clic de más. */}
          <Show when={!modoTerminal()}>
          <Button
            type="button"
            variant="ghost"
            size="iconCompact"
            class="shrink-0 rounded-full"
            disabled={!listo()}
            title={t("chat.attachments.add")}
            aria-label={t("chat.attachments.add")}
            onClick={() => void elegirArchivos()}
          >
            <Paperclip size={16} />
          </Button>
          </Show>

          {/* Al lado de adjuntar, y a la izquierda de todo lo demás: decide
              con qué arranca lo que viene —material y vigilancia—, y lo de
              la derecha ajusta la respuesta. Pegado a la caja, foco de
              `shift+tab`. Se enseña aunque solo haya un modo utilizable:
              con Codex o Antigravity es la única forma de enterarse de por
              qué no hay nada que elegir. */}
          <Show when={props.modos.length > 0 && !modoTerminal()}>
            <SelectorDeModo
              modo={props.modo}
              modos={props.modos}
              disabled={!listo()}
              pulso={pulsoDeModo()}
              onChange={cambiarModo}
            />
          </Show>

          {/* Con qué responde, a la derecha: ajusta la respuesta y no es la
              acción —el botón del final—. Se mueve con un turno corriendo:
              vale para lo que se escriba ahora, lo que ya está en cola se
              queda con el suyo. Lo primero del grupo no es un ajuste: es el
              medidor de memoria, lectura y no control —no responde al
              clic—, lo que hay que saber antes del turno siguiente. */}
          <div class="ml-auto flex min-w-0 items-center gap-1">
            {/* Sin `agente`: el rótulo del que no mide sale del catálogo
                («Este agente»), y aquí el nombre legible del agente elegido
                vive en la superficie, no en esta fila. */}
            <Show when={!modoTerminal()}>
              <VentanaDeContexto ventana={props.ventana} />
            </Show>
            {/* Sin nada con qué trabajar no hay menú, hay una salida: en el
                primer arranque el desplegable no tendría ni una entrada. Va
                por «ninguna se puede usar» y no por «la lista está vacía»:
                un agente desconectado deja una entrada y ninguna utilizable,
                y ahí también hace falta. El rótulo cambia con lo que falta;
                el porqué entero va en el título de la superficie. */}
            <Show
              when={props.superficies && !props.superficies.some((s) => s.usable)}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={props.onConectar}
                // Sin frase no se pone el atributo: «sin elegir» no trae
                // ninguna (`surfaces::sin_cuenta`) y un `title=""` es un
                // tooltip vacío donde no debería haber ninguno.
                title={(() => {
                  const falta = faltaUnanime()?.porque;
                  return falta ? prosa(falta) : undefined;
                })()}
              >
                {faltaUnanime()?.marca === MARCA_SIN_ELEGIR
                  ? t("chat.account.pick")
                  : t("chat.account.connect")}
              </Button>
            </Show>

            <Show when={(props.superficies?.length ?? 0) > 0 && !modoTerminal()}>
              {/* Una opción decide agente, superficie y modelo. Separarlos hacía
                  imposible buscar Claude, Codex y OpenCode en el mismo menú.
                  La marca sale del agente que sirve la superficie: «OpenCode»
                  y «Modelos gratuitos» son dos entradas del mismo proveedor. */}
              <SelectorDeModelo
                pildora
                invokeOptions={props.modelOptions}
                marca={actual()?.provider ?? props.agent}
                models={opciones()}
                superficie={props.superficie}
                model={props.model}
                missingModelLabel={props.nativeSubagent ? t("chat.model.unreported") : undefined}
                disabled={
                  props.modelLocked ||
                  !opciones().some((opcion) => opcion.usable)
                }
                disabledReason={
                  props.agentLocked && props.agentLockedReason
                    ? props.agentLockedReason
                    : props.nativeSubagent ? t("chat.model.native") : props.modelLocked ? t("chat.model.locked") : undefined
                }
                onChange={props.onModel}
                lockedAgent={props.agentLocked ? props.agent : undefined}
                lockedReason={props.agentLocked ? props.agentLockedReason ?? t("chat.handover.unsupported") : null}
                efforts={efforts()}
                defaultEffort={elegido()?.default_effort ?? null}
                effort={props.effort}
                onEffort={props.onEffort}
              />
            </Show>

            {/* Un solo sitio y un solo acto posible por estado: enviar cuando
                está libre, detener cuando el agente trabaja. */}
            <Show when={modoTerminal() && !props.busy}>
              <Button
                type="submit"
                variant="terminal"
                size="sm"
                class="h-8 shrink-0 gap-1.5 rounded-full px-3 text-xs font-semibold"
                disabled={!listo() || !props.input.slice(1).trim()}
              >
                <CornerDownLeft size={14} aria-hidden="true" />
                {t("chat.composer.run")}
              </Button>
            </Show>
            <Show when={!modoTerminal() || props.busy}>
            <Button
              type={props.busy ? "button" : "submit"}
              size="iconCompact"
              class={cn(
                "shrink-0 rounded-full",
                props.busy && "bg-neutral-950 text-neutral-50 hover:bg-neutral-900",
              )}
              disabled={
                props.busy ? props.stopping : !listo() || (!props.input.trim() && props.adjuntos.length === 0)
              }
              aria-label={
                props.busy
                  ? props.stopping
                    ? t("chat.turn.stopping_aria")
                    : t("chat.turn.stop")
                  : t("chat.composer.send")
              }
              title={
                props.busy
                  ? props.stopping
                    ? t("chat.turn.stopping")
                    : t("chat.turn.stop")
                  : t("chat.composer.send")
              }
              onClick={props.busy ? () => void props.onStop() : undefined}
            >
              <Show
                when={props.busy}
                fallback={<ArrowUp size={16} stroke-width={2.5} />}
              >
                <Square size={10} fill="currentColor" stroke-width={2} />
              </Show>
            </Button>
            </Show>
          </div>
        </div>
        </Show>

      </form>
    </div>
  );

  const filaDelHilo = (bloque: () => Bloque, indice: () => number) => {
              const b = () => bloque();
              const mensaje = () => mensajeDe(b());
              const startsLaunchGroup = () => {
                const index = indice();
                if (index === (hiloVirtual ? 0 : chunkStart(shownFrom(), origen()))) return true;
                const previous = bloques()[index - 1];
                return previous?.tipo !== "msg" || previous.msg.meta !== "task_launched" || !previous.msg.fromTask;
              };
              return (
              <Switch>
                <Match when={mensaje()?.msg.meta === "history_gap"}>
                  <div class="col-start-1 min-w-0 py-1 text-center text-xs text-neutral-500" data-history-gap>
                    {t("chat.history.gap")}{" "}
                    <button type="button" class="text-primary underline" onClick={volverAReciente}>{t("chat.history.latest")}</button>
                  </div>
                </Match>
                <Match when={trabajoDe(b())}>
                  {(trabajo) => (
                    <TrabajoDeAgente
                      searchBlock={indice()}
                      visualBudget={visualBudget}
                      visualScope={props.visualScope}
                      readVisual={props.readVisual}
                      openVisual={props.openVisual}
                      pasos={fromWork(b(), (t) => t.pasos, [])}
                      avance={fromWork(b(), (t) => t.avance ?? SIN_AVANCE, SIN_AVANCE)}
                      msg={fromWork(b(), (t) => t.msg, SIN_MENSAJE)}
                      respuestas={fromWork(b(), (t) => (t.msg.turno ? respondido().get(t.msg.turno) ?? null : null), null)}
                      vivo={fromWork(b(), (t) => esElVivo(t.msg), false)}
                      corriendo={registroCorre(b())}
                      abiertoElTrabajo={Boolean(trabajos()[claveFila(b())])}
                      onAlternarTrabajo={() => {
                        const k = claveFila(trabajo());
                        setTrabajos({ ...trabajos(), [k]: !trabajos()[k] });
                      }}
                      razonamientoAbierto={Boolean(razonamientos()[claveFila(b())])}
                      onAlternarRazonamiento={() => {
                        const k = claveFila(trabajo());
                        setRazonamientos({ ...razonamientos(), [k]: !razonamientos()[k] });
                      }}
                      preguntasAbiertas={!preguntasPlegadas()[claveDeTrabajo(fromWork(b(), (t) => t.msg, SIN_MENSAJE))]}
                      onAlternarPreguntas={() => {
                        const k = claveDeTrabajo(trabajo().msg);
                        setPreguntasPlegadas({
                          ...preguntasPlegadas(),
                          [k]: !preguntasPlegadas()[k],
                        });
                      }}
                      onVerCambios={props.onVerCambios}
                      agenteDelTurno={fromWork(b(), (t) => t.msg.agent ?? props.agent, props.agent)}
                      catalogo={props.catalogos[fromWork(b(), (t) => t.msg.agent ?? props.agent, props.agent)] ?? null}
                      agentLabel={
                        props.agents.find((a) => a.id === fromWork(b(), (t) => t.msg.agent ?? props.agent, props.agent))?.label
                          ?? fromWork(b(), (t) => t.msg.agent ?? props.agent, props.agent)
                      }
                      onCopiar={copiarMensaje}
                      copiando={fromWork(b(), (t) => copiando() === t.msg.turno, false)}
                      copiado={fromWork(b(), (t) => copiado() === t.msg.turno, false)}
                      onFork={props.onForkDesde ? async (turno) => { abrirFork(turno); } : null}
                      forkeando={fromWork(b(), (t) => forkeando() === t.msg.turno, false)}
                      forkDeshabilitado={forkeando() !== null}
                      rapida={respuestaRapida(fromWork(b(), (t) => t.i, 0))}
                    />
                  )}
                </Match>

                <Match when={pasosDe(b())}>
                  {(bp) => (
                    <div class="col-start-1 min-w-0" data-sender="system">
                    {/* Corre solo la tira del final con la tarea contestando:
                        un aviso que llegó con el turno cerrado no es trabajo. */}
                    <RegistroDeTrabajo
                      pasos={pasosDe(b())?.pasos ?? []}
                      corriendo={esLaTiraViva(b())}
                      abierto={trabajos()[claveFila(b())]}
                      onAlternar={(abierto) => {
                        setTrabajos({ ...trabajos(), [claveFila(bp())]: abierto });
                      }}
                    />
                    </div>
                  )}
                </Match>

                <Match when={mensaje()?.msg.meta === "task_launched" ? mensaje()?.msg.fromTask : null}>
                  {reference => <div class="col-start-1 min-w-0">
                    <Show when={startsLaunchGroup()}>
                      <h3 class="mb-2 text-xs font-medium text-neutral-500">{t("chat.delegation.created")}</h3>
                    </Show>
                    {props.delegatedTask?.(reference())}
                  </div>}
                </Match>
                <Match when={mensaje()?.msg.contexto ?? null}>
                  {(cambio) => (
                    <div class="col-start-1 min-w-0">
                    <CambioDeContexto
                      cambio={cambio()}
                      catalogo={props.catalogo}
                    />
                    </div>
                  )}
                </Match>

                <Match
                  when={
                    mensaje()?.msg.artefactos?.length
                      ? mensaje()!.msg.artefactos
                      : null
                  }
                >
                  {(items) => (
                    <div class="col-start-1 min-w-0">
                    <Entrega items={items()} onAbrir={props.onAbrirArtefacto} />
                    </div>
                  )}
                </Match>

                <Match when={mensaje() && esInterrupcion(mensaje()!.msg)}>
                  <Interrupcion />
                </Match>

                <Match when={mensaje()?.msg.meta === "cupo" ? mensaje()!.msg : null}>
                  {(m) => <SiguioTrasElCupo cambio={m().quota ?? {}} />}
                </Match>

                <Match when={mensaje()?.msg.meta === "engine_updated"}>
                  <LineaDeSistema texto={t("chat.engine_updated")} />
                </Match>

                <Match when={mensaje()?.msg.meta === "provider_handover" ? mensaje()!.msg : null}>
                  {(m) => <TraspasoDeProveedor texto={m().text} />}
                </Match>

                <Match when={mensaje() && esFilaDeLaBandeja(mensaje()!.msg.meta) ? mensaje()!.msg : null}>
                  {(m) => <FilaDeLaBandeja msg={m()} onOpenTask={props.onOpenTask} tareaPorId={props.tareaPorId} />}
                </Match>

                <Match when={esSalidaDeComando(mensaje()?.msg.meta)}>
                  {/* Lee `mensaje()` y no el accesor del `Match`: estas props
                      leen también `props.msgs`. */}
                  <SalidaDeComando
                    text={mensaje()?.msg.text ?? ""}
                    command={comandoDe(props.msgs, mensaje()?.i ?? 0)}
                    agent={mensaje()?.msg.agent ?? props.agent}
                    agentLabel={
                      props.agents.find((a) => a.id === (mensaje()?.msg.agent ?? props.agent))?.label
                        ?? mensaje()?.msg.agent
                        ?? props.agent
                    }
                    clase={claseDeSalida(mensaje()?.msg.meta)}
                    durationMs={mensaje()?.msg.duration_ms}
                  />
                </Match>

                <Match when={mensaje()?.msg.shell ? mensaje()!.msg : null}>
                  {(m) => (
                    <TarjetaDeTerminal
                      command={m().text}
                      cwd={m().shell!.cwd}
                      output={m().shell!.output}
                      truncated={m().shell!.truncated}
                      exitCode={m().shell!.exit_code}
                      durationMs={m().shell!.duration_ms ?? null}
                      pendiente={m().shell!.exit_code !== null ? pieDeTerminal(mensaje()?.i ?? 0) : null}
                    />
                  )}
                </Match>

                <Match
                  when={
                    mensaje()?.msg.role === "system" && !esInterrupcion(mensaje()!.msg)
                      ? mensaje()!.msg
                      : null
                  }
                >
                  {(m) => (
                    <HitoDelHilo
                      msg={m()}
                      vigente={(mensaje()?.i ?? -1) > ultimoEscrito()}
                      onReintentar={props.onReintentar}
                      onCuentas={props.onConectar}
                      onOpenTask={props.onOpenTask}
                    />
                  )}
                </Match>

                <Match when={mensaje()?.msg.role === "user" ? mensaje()!.msg : null}>
                  {(m) => {
                    const entrante = () => !!(m().encargado || m().fromTask);
                    // El input de la persona va a la derecha; el de un encargado
                    // u otra tarea, a la izquierda con su cara en el margen de
                    // 52 px del hilo: meterla en el globo encoge el hilo.
                    return (
                    <div class={entrante() ? "col-start-1 -ml-[52px] flex min-w-0 items-end gap-2" : "col-start-1 min-w-0"}>
                    {/* Despierto, no dormido ni trabajando: la cara firma
                        quién escribió el input, no en qué anda ahora. Con
                        `asleep` el globo de quien acaba de hablar salía gris y
                        con los ojos cerrados; el estado vivo se lee en el riel
                        y en la cabecera. */}
                    <Show when={m().encargado}>
                      {(name) => (
                        <div class="shrink-0 self-end pb-9">
                          <AstroAvatar name={name()} status="awake" body={props.bodyOf?.(name())} avatar={props.avatarOf?.(name())} size={44} />
                        </div>
                      )}
                    </Show>
                    {/* Una tarea sin encargado no tiene cuerpo celeste: su cara
                        es el icono de su agente, con el modelo al pasar encima. */}
                    <Show when={!m().encargado ? m().fromTask : undefined}>
                      {(sender) => (
                        <div class="shrink-0 self-end pb-9">
                          <div
                            class="flex size-11 items-center justify-center rounded-full bg-neutral-200"
                            title={sender().model ?? sender().provider}
                          >
                            <MarcaAgente id={sender().provider} size={22} />
                          </div>
                        </div>
                      )}
                    </Show>
                    <article
                      class={cn(
                        "group/mensaje min-w-0",
                        entrante() ? presentation().incomingMessage : presentation().userMessage,
                      )}
                    >
                      <Show when={m().historyRefs?.length}><HistoryDetails refs={m().historyRefs!} turnId={m().turno} /></Show>
                      <Show when={entrante()}>
                        <div class="mb-1 flex justify-start gap-1 text-[0.72rem] text-neutral-500" data-sender={m().encargado ? "agent" : "task"}>
                          <Show when={m().encargado}>
                            {(name) => <span class="font-semibold">{name()}</span>}
                          </Show>
                          <Show when={m().fromTask}>
                            {(sender) => (
                              <>
                                <Show when={m().encargado}><span aria-hidden="true">·</span></Show>
                                <button
                                  type="button"
                                  class={cn("truncate underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary", !m().encargado && "font-semibold")}
                                  aria-label={t("chat.recipients.open_task", { title: sender().title })}
                                  onClick={() => props.onOpenTask?.(sender().folder, sender().task, sender().machine)}
                                >
                                  {sender().title}
                                </button>
                              </>
                            )}
                          </Show>
                        </div>
                      </Show>
                      <Show when={m().relevo}>
                        {(relevo) => (
                          <div class="mb-1 text-right text-[0.72rem] text-neutral-500">
                            {t("chat.subagent.relayed", { title: relevo().titulo })}
                          </div>
                        )}
                      </Show>
                      <Show when={!m().encargado && !m().fromTask ? m().channel : undefined}>
                        {(channel) => (
                          <div class="mb-1 text-right text-[0.72rem] text-neutral-500">
                            {t("chat.recipients.via", { channel: channel() })}
                          </div>
                        )}
                      </Show>
                      {/* Dónde se contesta, cuando no es aquí. Va con la firma
                          y no dentro del globo: es del sobre, no del texto. */}
                      <Show when={m().reply_to}>
                        {(r) => (
                          <div class={cn("mb-1 text-[0.7rem] text-neutral-500", entrante() ? "text-left" : "text-right")}>
                            {t("chat.recipients.reply_in", { task: r().task, folder: r().folder })}
                          </div>
                        )}
                      </Show>
                      <Dynamic component={entrante() ? presentation().IncomingBubble : presentation().UserBubble}>
                        {/* La línea de dirección: a quién se le entregó esto.
                            Encima de los adjuntos y no entre ellos: no es
                            algo que se adjuntó. Con dos destinatarios, dos
                            caras y un solo turno en el hilo de origen. */}
                        <Show when={m().recipients?.length}>
                          <div class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.72rem] text-neutral-900">
                            <span>{t("chat.recipients.to")}</span>
                            <For each={m().recipients!}>
                              {(r) => (
                                <span class="flex items-center gap-1 font-semibold text-primary">
                                  <AstroAvatar name={r.name} status="awake" body={props.bodyOf?.(r.name)} avatar={props.avatarOf?.(r.name)} size={18} />
                                  {r.name}
                                </span>
                              )}
                            </For>
                          </div>
                        </Show>
                        {/* Encima del texto, que es donde se adjuntó: en la
                            caja el archivo va sobre lo que se escribe, y el
                            mensaje mandado tiene que leerse igual que se
                            compuso. */}
                        <Show when={m().attachments?.length}>
                          <Adjuntos
                            rels={m().attachments!}
                            miniatura={props.onMiniatura}
                            preview={props.onPreview}
                          />
                        </Show>
                        {/* Lo que se mencionó se sigue viendo como referencia
                            después de mandarlo: si en la transcripción volviera
                            a ser texto plano, la estructura solo existiría
                            mientras se escribe. */}
                        <Show when={m().text}>
                          <p data-thread-search-text={indice()} class="m-0 leading-[1.5] break-words whitespace-pre-wrap">
                            {/* Index y no For: los tramos se recalculan con objetos nuevos en cada cambio del hilo, y For recrearía cada etiqueta. */}
                            <Index each={tramosDelMensaje(m().text, commandNames())}>
                              {(tramo) => (
                                <Show
                                  when={tramo().kind}
                                  fallback={
                                    <WithMentions
                                      taskMentions={mencionesDesde(m().task_mentions, m().text.length - tramo().text.length)}
                                      onOpenTask={props.onOpenTask}
                                    >
                                      {tramo().text}
                                    </WithMentions>
                                  }
                                >
                                  {(kind) => (
                                    <span data-kind={kind()} class={claseDelTramo(kind(), "enviado")}>
                                      {tramo().text}
                                    </span>
                                  )}
                                </Show>
                              )}
                            </Index>
                          </p>
                        </Show>
                        <Show when={!m().text && m().meta === "hidden_task"}>
                          <p class="m-0 leading-[1.5] italic text-neutral-500">
                            {t("chat.subagent.hidden_task")}
                          </p>
                        </Show>
                      </Dynamic>
                      <div class={cn(FILA_DEL_MENSAJE, entrante() ? "justify-start -ml-1.5" : "justify-end -mr-1.5")}>
                        <HoraDelTurno at={m().at} />
                        <Show when={m().text}>
                          <BotonCopiar
                            copiando={copiando() === claveFila(b())}
                            copiado={copiado() === claveFila(b())}
                            onCopiar={() => void copiarMensaje(claveFila(b()), m().text)}
                          />
                        </Show>
                      </div>
                    </article>
                    </div>
                    );
                  }}
                </Match>

                <Match when={mensaje()}>
                  {(bm) => (
                    <article class="col-start-1 min-w-0 max-w-full">
                      <Markdown>{bm().msg.text}</Markdown>
                      <Show
                        when={props.busy && mensajeDe(b())?.i === props.msgs.length - 1}
                      >
                        <span
                          class="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 bg-primary animate-danil-pulse"
                          aria-hidden="true"
                        />
                      </Show>
                    </article>
                  )}
                </Match>
              </Switch>
              );
  };

  return (
    <FileMachine.Provider value={() => props.machine}>
    <WorkFace.Provider value={() => props.workAgent ? { name: props.workAgent, body: props.chatBody, avatar: props.chatAvatar } : null}>
      <Dialog open={forkTurn() !== null} onOpenChange={(open) => { if (!open && !forkeando()) setForkTurn(null); }}>
        <DialogContent>
          <DialogTitle class="text-base font-semibold">{t("chat.continuation.title")}</DialogTitle>
          <Dialog.Description class="my-3 text-sm text-neutral-500">{t("chat.continuation.description")}</Dialog.Description>
          <Show when={(props.forkAgents ?? []).length > 0}>
            <label class="mb-3 flex flex-col gap-1 text-xs text-neutral-500">
              {t("chat.continuation.agent")}
              <Select
                value={forkAgentChoice()}
                disabled={forkeando() !== null}
                onChange={(e) => setForkAgentChoice(e.currentTarget.value)}
              >
                <option value="">{t("chat.continuation.no_agent")}</option>
                <For each={props.forkAgents}>{(name) => <option value={name}>{name}</option>}</For>
              </Select>
            </label>
          </Show>
          <div class="flex flex-col gap-2">
            <Button variant="outline" disabled={forkeando() !== null} onClick={() => void forkDesde("full")}>{t("chat.continuation.full")}</Button>
            <Button variant="outline" disabled={forkeando() !== null} onClick={() => void forkDesde("focused")}>{t("chat.continuation.focused")}</Button>
            <Button variant="ghost" disabled={forkeando() !== null} onClick={() => setForkTurn(null)}>{t("chat.continuation.cancel")}</Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Mide la caja de la conversación: el padre es su ventana del reparto. */}
      <span ref={ancla} class="hidden" aria-hidden="true" />
      {/* El velo cubre solo esta conversación, la que recibe al soltar. Va fijo con
          la medida de su caja: el padre no siempre es `relative`. Sin
          `pointer-events`: un nodo capturando el puntero estorbaría al `leave`. */}
      <Show when={!props.soloLectura && soltando()}>
        {(caja) => (
        <div
          class="pointer-events-none fixed z-50 grid place-items-center rounded-md bg-black/40 p-6"
          style={{ left: `${caja().left}px`, top: `${caja().top}px`, width: `${caja().width}px`, height: `${caja().height}px` }}
          aria-hidden="true"
        >
          <div class="flex items-center gap-2 rounded-lg border-2 border-dashed border-primary bg-surface px-4 py-3 shadow-lg">
            <FileText size={16} class="shrink-0 text-primary" />
            <span class="text-sm font-medium">{t("chat.drop.hint")}</span>
          </div>
        </div>
        )}
      </Show>

    {/* El esqueleto se pinta contra la caja (`justify-end`), donde va a
        estar el final del hilo: lo que se sustituye ocupa el mismo sitio.
        Sin barra de scroll (`overflow-hidden`) y sin rótulo: el esqueleto
        ya trae su forma y su `aria-busy` (`ui/Skeleton.tsx`). */}
    <Show
      when={!props.cargando}
      fallback={
        <>
          <div class={cn("min-h-0 flex-1 overflow-hidden", margenDelHilo)}>
            {/* El armazón está siempre —es lo que reserva el sitio de la caja y
                del final del hilo—; lo que espera al umbral son las barras.
                Ver `UMBRAL_DEL_ESQUELETO_MS`: por debajo, dibujarlas es meter
                una forma que se va antes de que la veas. */}
            <div
              class={cn(
                "mx-auto flex h-full w-full flex-col justify-end gap-6",
                "max-w-[860px]",
              )}
            >
              <Show when={esperaVisible()}>
                <Skeleton class="ml-auto h-9 w-[40%] rounded-lg" />
                <Skeleton filas={4} class="h-4 rounded-sm" />
                <Skeleton class="ml-auto h-9 w-[28%] rounded-lg" />
                <Skeleton filas={2} class="h-4 rounded-sm" />
              </Show>
            </div>
          </div>
          <div
            class="flex shrink-0 flex-col items-center px-4 pt-1 pb-3"
          >
            <Show when={props.recovery} fallback={<Caja />}>{props.recovery}</Show>
          </div>
        </>
      }
    >
      {/* El overlay de soltar solo se pinta aquí — las rutas no salen de
          él, el `drop` de HTML5 entrega un `File` sin ruta en disco y el
          estado lo maneja `onDragDropEvent` (arriba). Tres niveles: el de
          fuera es el marco del botón de bajar, el de en medio es el que
          scrollea, el de dentro es lo único medible —tiene el alto de su
          hueco y no cambia—. `lib/paste.ts`. */}
      <div class="relative flex min-h-0 flex-1 flex-col">
      <Show when={props.masRecientes}><button type="button" class="shrink-0 py-2 text-xs text-primary underline" onClick={volverAReciente}>{t("chat.history.latest")}</button></Show>
      {props.coordinator}
      <Show when={!props.agentDraft ? props.chatEncargado : null}>
        {(name) => (
          /* La cabecera entera abre el perfil, como el contacto de un chat:
             un botón aparte al lado sería un segundo destino para lo mismo. */
          <header class="relative z-10 flex shrink-0 items-center gap-3 bg-transparent px-4 py-2.5">
            <button
              class="flex min-w-0 flex-1 items-center gap-3 rounded-sm border-0 bg-transparent p-0 text-left outline-none hover:opacity-80 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              disabled={!props.onOpenProfile}
              title={t("projects.agents.profile_open")}
              onClick={() => props.onOpenProfile?.()}
            >
              <AstroAvatar
                name={name()}
                status={props.chatEstado ?? "awake"}
                body={props.chatBody}
                avatar={props.chatAvatar}
                size={44}
              />
              {/* Solo el nombre: el estado ya lo dice la cara, y escribirlo
                  además deja dos rótulos del mismo estado en la misma barra. */}
              <div class="min-w-0 truncate text-[0.95rem] leading-tight font-semibold">
                {props.chatName?.trim() || name()}
              </div>
            </button>
          </header>
        )}
      </Show>
      <div
        class={cn(
          "relative min-h-0 flex-1 overflow-auto [overflow-anchor:none]",
          margenDelHilo,
        )}
        ref={tomarHilo}
        style={props.chatEncargado ? { "clip-path": `inset(0 0 ${altoDeLaCaja()}px 0)` } : undefined}
      >
        <div ref={watchOlder} class="pointer-events-none absolute inset-x-0 top-0 h-px" aria-hidden="true" />
        <Show when={rielVisible()}>
          <YourMessages
            messages={inputsDelHilo()}
            active={mensajeVisto()}
            visibleHeight={cajaDelHilo().alto - altoDeLaCaja()}
            onJump={saltarAlMensaje}
            bodyOf={props.bodyOf}
            avatarOf={props.avatarOf}
          />
        </Show>
        <div
          data-chat-thread
          class={cn(
            "mx-auto grid w-full gap-y-4",
            "max-w-[964px] px-[52px] grid-cols-[minmax(0,1fr)]",
          )}
          ref={(el) => {
            hilo.contenido(el);
            elContenido = el;
          }}
        >
          {/* La transcripción solo añade al final; el último bloque puede pasar
              de ejecución viva a turno cerrado. `For` identifica por el objeto
              y `bloques()` fabrica objetos nuevos con cada delta: desmontaba
              también las filas antiguas, perdía el ancla de lectura y hacía
              que WebKit encogiera y recompusiera el hilo en dos movimientos.
              `Index` conserva cada sitio del DOM y solo actualiza sus datos. */}
          <Show
            when={hiloDeFilasListo() ? cajaVirtual() : undefined}
            keyed
            fallback={
              <Show when={!hiloVirtual}>
                <For each={chunks()}>
                  {(chunk) => (
                    <Index each={chunkOf(bloques(), chunk, origen())}>
                      {(bloque, blockIndex) => filaDelHilo(bloque, () => chunkStart(chunk, origen()) + blockIndex)}
                    </Index>
                  )}
                </For>
              </Show>
            }
          >
            {(caja) => (
              <Dynamic
                component={hiloDeFilasListo()!}
                scroller={caja.el}
                keys={() => clavesDelHilo().lista}
                estimate={altoEstimado}
                retained={filasRetenidas}
                write={hilo.escribir}
                settled={hilo.sostener}
                onRange={setPrimeraFila}
                ref={(api: VirtualThreadApi) => { hiloDeFilas = api; saltarALaLectura(); }}
                row={(clave: string, indice: () => number) => {
                  // La lista de filas puede ir un paso detrás de las claves: una que ya salió no se pinta.
                  const inicial = clavesDelHilo().deClave.get(clave);
                  return inicial ? filaDelHilo(createMemo<Bloque>((previo) => clavesDelHilo().deClave.get(clave) ?? previo, inicial), indice) : null;
                }}
              />
            )}
          </Show>

          {/* Mientras el turno viva, y sin más condiciones: con «y el
              último mensaje no es del agente» el renglón se apagaba con la
              primera palabra que escribiera y no volvía, dejando sin nada
              el tramo más largo de un turno lento —donde solo hay rótulo
              de bloque de trabajo, que existe cuando hay un paso o una
              duración. Ver `EstadoDelTurno`. */}
          <Show when={props.busy ? props.terminal : null}>
            {(vivo) => (
              <TarjetaDeTerminal
                command={vivo().command}
                cwd={vivo().cwd}
                output={vivo().output}
                truncated={vivo().truncated}
                vivo={{ desde: vivo().desde, deteniendo: Boolean(props.stopping), onDetener: () => void props.onStop() }}
              />
            )}
          </Show>
          <Show when={props.busy && !props.terminal}>
            <div class="col-start-1 min-w-0">
              <EstadoDelTurno
                paso={pasoVivo()}
                esperando={props.esperando}
                reintento={props.reintento}
                enFondo={props.enFondo ?? false}
                desde={props.inicioDelTurno}
              />
            </div>
          </Show>
          <div
            class="col-span-full"
            aria-hidden="true"
            style={{ height: `${altoDeLaCaja() + HOLGURA + 12}px`, "flex-shrink": 0 }}
          />
        </div>
      </div>

      <Show when={props.estadoAntiguos === "loading" || props.estadoAntiguos === "failed"}>
        <div class="absolute top-2 left-1/2 z-30 -translate-x-1/2 rounded-full border border-border bg-surface-raised px-3 py-1 text-xs shadow-sm" role={props.estadoAntiguos === "failed" ? "alert" : "status"}>
          <Show when={props.estadoAntiguos === "failed"} fallback={t("chat.history.older_loading")}>
            {t("chat.history.older_failed")}{" "}
            <button type="button" class="text-primary underline" onClick={() => void pedirAntiguos()}>{t("chat.history.older_retry")}</button>
          </Show>
        </div>
      </Show>

      {/* El botón solo existe mientras haga falta —si el final ya se ve,
          no hay nada que ofrecer—; `alFondo` cubre también «estás cerca»
          para no parpadear a los veinte píxeles. Un control único cambia
          de rótulo en vez de dos que se turnarían el sitio, y ese rótulo
          es el nombre accesible: sin `aria-label` aparte no hay dos textos
          que revisar. Lo que no es respuesta no cuenta: «0 nuevos» mentiría. */}
      <Show when={!hilo.alFondo()}>
        {(() => {
          const rotulo = () =>
            mensajesNuevos() > 0
              ? t("chat.thread.new_messages", { count: mensajesNuevos() })
              : t("chat.thread.to_bottom");
          return (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => hilo.bajar()}
              title={rotulo()}
              // Por encima de la caja flotante y no a 12 px del fondo, que es
              // donde estaba cuando la caja ocupaba su propio bloque: ahí
              // quedaría detrás de ella, visible a medias y sin poder pulsarse.
              style={{ bottom: `${altoDeLaCaja() + 12}px` }}
              class="absolute left-1/2 z-30 -translate-x-1/2 rounded-full pr-2.5 pl-3 shadow-md"
            >
              <span class="whitespace-nowrap">{rotulo()}</span>
              <ArrowDown size={14} aria-hidden="true" class="shrink-0" />
            </Button>
          );
        })()}
      </Show>

      {/* La caja flota sobre el hilo, no debajo: el hueco
          medido desde arriba es lo que mantiene legible la última línea,
          no un hueco supuesto ni un degradado. La capa ocupa la celda
          entera para contener preguntas altas, pero solo su caja recibe
          puntero. Una pregunta pendiente no desaparece con otra ventana
          activa: la propia tarjeta activa su ventana al interactuar. */}
      <Show when={!props.soloLectura || preguntaPendiente() || props.recovery}>
        <Show when={props.agentDraft && centrada() ? props.chatEncargado : null} fallback={
        <div
          class={cn("pointer-events-none absolute inset-0 z-20 flex min-h-0 flex-col items-center overflow-hidden", centrada() ? "justify-center" : "justify-end")}
        >
          <Show when={centrada() ? props.chatEncargado : null}>
            {(name) => <div class="pointer-events-auto mx-auto flex max-w-[860px] flex-col items-center gap-3 px-6 text-center">
              <button type="button" class="rounded-sm focus-visible:outline-2 focus-visible:outline-primary" aria-label={t("projects.agents.profile_open")} title={t("projects.agents.profile_open")} onClick={() => props.onOpenProfile?.()}>
                <AstroAvatar name={name()} status={props.chatEstado ?? "awake"} body={props.chatBody} avatar={props.chatAvatar} size={56} />
              </button>
              <h1 class="m-0 font-display text-xl font-bold text-neutral-950">{props.chatName?.trim() || name()}</h1>
              <Show when={props.chatDescription}><p class="m-0 max-w-[36rem] text-sm text-neutral-700">{props.chatDescription}</p></Show>
            </div>}
          </Show>
          <Show when={centrada() && !props.chatEncargado && !props.recovery ? saludo() : null}>
            {(texto) => (
              <h1 class="m-0 mb-6 max-w-[860px] px-6 text-center font-display text-3xl font-bold tracking-[-0.02em] text-neutral-950">
                {texto()}
              </h1>
            )}
          </Show>
          {/* El puntero vuelve aquí: la capa entera lo deja pasar para que se
              pueda seleccionar el texto que sigue visible detrás. */}
          <div
            ref={medirCaja}
            class={cn(
              "pointer-events-auto relative flex max-h-full min-h-0 w-full flex-col items-center overflow-hidden",
              presentation().composerBar,
              props.besideFiles && "pr-0",
            )}
          >
            <Show when={props.recovery} fallback={<Caja />}>{props.recovery}</Show>
            {/* Solo sin hilo: una sesión ya empezada pertenece a su proyecto,
                y cambiarlo aquí no la movería de sitio. */}
            <Show when={vacia()}>{props.proyecto}</Show>
          </div>
        </div>
        }>
          {(name) => (
            /* Cada columna es `sticky`: la más larga marca el alto de la fila y se
               desplaza, la corta se queda. Un `overflow` entre ellas y este
               contenedor anula el `sticky` sin dar error. */
            <div data-agent-page class="absolute inset-0 z-20 overflow-y-auto [container-type:size]">
              <div class="mx-auto grid w-full max-w-[1224px] items-start gap-x-14 gap-y-8 px-6 pb-12 @5xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] @5xl:px-14 @5xl:pb-0">
                {/* `100cqh` es el alto visible del panel: centra el composer
                    aunque la lista de tareas de al lado sea más larga. */}
                <div class="flex min-w-0 flex-col gap-2.5 pt-10 @5xl:sticky @5xl:top-0 @5xl:min-h-[100cqh] @5xl:justify-center @5xl:py-10">
                  <header class="mb-3 flex min-w-0 items-start gap-4">
                    <button type="button" class="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" aria-label={t("projects.agents.profile_open")} title={t("projects.agents.profile_open")} onClick={() => props.onOpenProfile?.()}>
                      <AstroAvatar name={name()} status={props.chatEstado ?? "awake"} body={props.chatBody} avatar={props.chatAvatar} size={52} />
                    </button>
                    <div class="flex min-w-0 flex-1 flex-col gap-1">
                      <div class="flex min-w-0 items-center gap-2">
                        <h1 class="m-0 min-w-0 flex-1 truncate font-display text-2xl font-bold text-neutral-950">{props.chatName?.trim() || name()}</h1>
                        <Show when={props.onOpenProfile}>
                          <Button variant="ghost" size="icon" class="size-7 shrink-0 text-neutral-500" aria-label={t("projects.agents.profile_open")} title={t("projects.agents.profile_open")} onClick={() => props.onOpenProfile?.()}>
                            <Pencil size={15} />
                          </Button>
                        </Show>
                      </div>
                      <Show when={props.chatDescription}><p class="m-0 text-sm text-neutral-700">{props.chatDescription}</p></Show>
                    </div>
                  </header>
                  <Show when={props.recovery} fallback={<Caja />}>{props.recovery}</Show>
                  {props.proyecto}
                  {props.recentTasks}
                </div>
                <div class="min-w-0 @5xl:sticky @5xl:top-6 @5xl:pt-10 @5xl:pb-12">{props.agentTasks}</div>
              </div>
            </div>
          )}
        </Show>
      </Show>
      </div>
    </Show>
    </WorkFace.Provider>
    </FileMachine.Provider>
  );
}

/** La cabecera de un tramo, entera o partida (ver `RegistroDeTrabajo`). */
const FILA_DEL_TRAMO =
  "flex w-full min-w-0 items-center gap-2 rounded-sm py-1.5 text-left text-sm hover:bg-surface-muted";

/**
 * Un tramo de trabajo: las herramientas seguidas entre dos textos del agente,
 * con su cuenta por clase como cabecera. Se pliega; lo que el turno preguntó
 * (`RegistroPreguntas`) queda fuera. Lo que cambió no se pinta en el hilo:
 * «Editó N archivos» abre el panel de la tarea en «Cambios».
 */
function RegistroDeTrabajo(props: {
  pasos: Paso[];
  /** Lo que el turno hizo y dijo antes de su respuesta; se pliega con los pasos. */
  avance?: Avance[];
  corriendo: boolean;
  duracion?: string | null;
  abierto?: boolean;
  onAlternar: (abierto: boolean) => void;
  /** Con él, «Editó N archivos» abre los cambios en el panel de la tarea. */
  onVerCambios?: () => void;
}) {
  // Sin contar los pasos con error: fallar y reintentar es normal en un turno
  // correcto, y «1 con error» alarmaba. El fallo del turno va aparte.
  const avance = () => props.avance ?? SIN_AVANCE;
  const todos = createMemo(() => [...avance().flatMap((a) => a.pasos), ...props.pasos]);
  const rotulo = () =>
    cuentaDelTramo(todos(), props.corriendo) ??
    (props.corriendo ? t("chat.work.running") : t("chat.work.title"));
  const partes = createMemo(() => (props.onVerCambios ? partesDelTramo(todos(), props.corriendo) : []));
  const duracion = () =>
    !props.corriendo && props.duracion ? t("chat.work.duration", { duration: props.duracion }) : null;
  // El chevron y el cuerpo leen esto; si divergen, el primer clic abre lo que ya se veía abierto.
  const desplegado = () => Boolean(props.abierto);
  const chevron = () => (
    <ChevronRight
      size={14}
      class={cn("shrink-0 text-neutral-500 transition-transform", desplegado() && "rotate-90")}
      aria-hidden="true"
    />
  );
  const cara = useContext(WorkFace);
  const girando = () => (
    <Show when={props.corriendo}>
      <Show when={cara()} fallback={<Spinner size={14} class="pointer-events-none animate-spin-lento text-primary" />}>
        {(c) => <span class="pointer-events-none inline-flex shrink-0"><AstroAvatar name={c().name} status="working" body={c().body} avatar={c().avatar} size={16} /></span>}
      </Show>
    </Show>
  );
  const tiempo = () => (
    <Show when={duracion()}>
      <span class="pointer-events-none ml-auto shrink-0 text-xs whitespace-nowrap text-neutral-500">{duracion()}</span>
    </Show>
  );

  // Sin envoltorio y con los datos de la derecha en un solo texto: cada
  // elemento de más se multiplica por los tramos del hilo (`open-task-cost`).
  return (
    <>
      <Show
        when={todos().length > 0 || avance().length > 0}
        fallback={<p class="m-0 mb-2 px-1 py-1.5 text-xs text-neutral-500">{duracion()}</p>}
      >
        {/* Con cambios que abrir, la fila se parte: el plegado la cubre por
            debajo del texto y encima solo «Editó N archivos» recibe el clic
            (dos botones hermanos: uno dentro de otro no es HTML válido). Sin
            ellos queda el botón de siempre: cada nodo de más se multiplica por
            los tramos del hilo (`open-task-cost`). */}
        <Show
          when={props.onVerCambios && partes().some((p) => p.clase === "editar")}
          fallback={
            <button
              type="button"
              aria-expanded={desplegado()}
              onClick={() => props.onAlternar(!desplegado())}
              class={cn(FILA_DEL_TRAMO, "px-1", !desplegado() && "mb-2")}
            >
              {chevron()}
              {girando()}
              <span class="min-w-0 truncate font-medium text-neutral-700">{rotulo()}</span>
              {tiempo()}
            </button>
          }
        >
          <div class={cn(FILA_DEL_TRAMO, "relative pr-1 pl-[1.625rem]", !desplegado() && "mb-2")}>
            <button
              type="button"
              aria-expanded={desplegado()}
              aria-label={[rotulo(), duracion()].filter(Boolean).join(" · ")}
              onClick={() => props.onAlternar(!desplegado())}
              class="absolute inset-0 flex items-center rounded-sm px-1 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
            >
              {chevron()}
            </button>
            {girando()}
            <span class="pointer-events-none min-w-0 truncate font-medium text-neutral-700">
              <Index each={partes()}>
                {(parte, i) => (
                  <>
                    {i > 0 ? t("common.steps.summary.separator") : ""}
                    <Show when={parte().clase === "editar"} fallback={parte().texto}>
                      <button
                        type="button"
                        title={t("chat.work.open_changes")}
                        onClick={() => props.onVerCambios?.()}
                        class="pointer-events-auto relative rounded-sm underline decoration-neutral-300 underline-offset-2 hover:text-neutral-950 hover:decoration-current focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {parte().texto}
                      </button>
                    </Show>
                  </>
                )}
              </Index>
            </span>
            {tiempo()}
          </div>
        </Show>

        <Show when={desplegado()}>
          <div class={cn(SUPERFICIE_DE_EJECUCION, "mb-2")}>
            <Index each={avance()}>
              {(tramo) => (
                <>
                  <Show when={tramo().pasos.length > 0}>
                    <LineaDeTiempo pasos={tramo().pasos} />
                  </Show>
                  <Show when={tramo().msg.razonamiento?.length}>
                    <div class="px-1 py-1 text-sm whitespace-pre-wrap text-neutral-500 select-text">
                      {tramo().msg.razonamiento?.map((b) => b.text).join("\n\n")}
                    </div>
                  </Show>
                  <div class="px-1 py-1 text-sm text-neutral-500">
                    <Markdown>{tramo().msg.text}</Markdown>
                  </div>
                </>
              )}
            </Index>
            <Show when={props.pasos.length > 0}>
              <LineaDeTiempo pasos={props.pasos} />
            </Show>
          </div>
        </Show>
      </Show>
      {/* Fuera del pliegue y antes de la respuesta, como el modo inline de las apps de OpenAI: la respuesta habla de ella. */}
      <Index each={todos()}>
        {(step) => (
          <Show when={!step().corriendo && step().mcpApp}>
            {(call) => <McpAppView call={call()} />}
          </Show>
        )}
      </Index>
    </>
  );
}

function TrabajoDeAgente(props: {
  visualBudget: VisualBudget;
  visualScope?: string;
  readVisual?: (file: string) => Promise<string>;
  openVisual?: (file: string) => Promise<void>;
  searchBlock?: number;
  pasos: Paso[];
  avance: Avance[];
  msg: Msg;
  respuestas: Respuesta[] | null;
  /** Si este turno es el que está corriendo ahora mismo. */
  vivo: boolean;
  /** El estado del turno manda incluso si falta el cierre de una herramienta. */
  corriendo: boolean;
  /** Si ESTE turno tiene su registro desplegado. Ver `trabajos` en `Chat`. */
  abiertoElTrabajo: boolean;
  onAlternarTrabajo: () => void;
  /** Si el razonamiento de ESTE mensaje está desplegado. Ver `razonamientos`. */
  razonamientoAbierto: boolean;
  onAlternarRazonamiento: () => void;
  /** Si las preguntas de ESTE turno están desplegadas. Nacen abiertas. */
  preguntasAbiertas: boolean;
  onAlternarPreguntas: () => void;
  /** Solo se ofrece si el turno trae rango de código (`msg.code`). */
  onVerCambios?: () => void;
  /** El agente dueño del turno, cuando el mensaje no lo trae. */
  agenteDelTurno: string;
  /** El nombre legible del agente, para el tooltip cuando no hay proveedor. */
  agentLabel: string;
  /** El catálogo de ese agente: de él sale el nombre con versión del modelo. */
  catalogo: AgentModels | null;

  onCopiar: (turno: string, texto: string) => Promise<void>;
  copiando: boolean;
  copiado: boolean;

  onFork: ((turno: string) => Promise<void>) | null;
  forkeando: boolean;

  forkDeshabilitado: boolean;
  /** `null` si esta conversación no puede mandar respuestas rápidas. */
  rapida: RespuestaRapida | null;
}) {
  /**
   * Las preguntas no cuentan aquí: son un bloque hermano, y contándolas
   * un turno que solo preguntó —sin un paso ni duración— abriría un
   * «Trabajo» que al desplegarse no enseña nada.
   */
  const tieneRegistro = () =>
    props.pasos.length > 0 || props.avance.length > 0 || props.msg.duration_ms !== undefined;
  const duracion = () =>
    props.msg.duration_ms === undefined
      ? null
      : formatearDuracion(props.msg.duration_ms);
  const texto = () => textoVisible(props.msg.text);
  return (
    <article class="group/mensaje col-start-1 min-w-0 max-w-full">
      <Show when={tieneRegistro()}>
        <RegistroDeTrabajo
          pasos={props.pasos}
          avance={props.avance}
          corriendo={props.corriendo}
          duracion={duracion()}
          abierto={props.abiertoElTrabajo}
          onAlternar={props.onAlternarTrabajo}
          onVerCambios={props.msg.code?.length ? props.onVerCambios : undefined}
        />
      </Show>

      {/* Lo pensado va entre el trabajo y la respuesta: se lee como lo que
          llevó a contestar, sin parecer la contestación. */}
      <Show when={props.msg.razonamiento?.length ? props.msg.razonamiento : null}>
        {(bloques) => (
          <Reasoning
            bloques={bloques()}
            vivo={props.vivo && !texto()}
            abierto={props.razonamientoAbierto}
            onAlternar={props.onAlternarRazonamiento}
          />
        )}
      </Show>

      {/* Entre el registro y la respuesta, que es donde ocurrió: el
          agente preguntó a mitad del turno, por debajo de lo que hizo
          hasta entonces y por encima de lo que contestó con la respuesta
          ya en la mano. Fuera del pliegue — ver la cabecera de
          `RegistroPreguntas`. */}
      <Show when={props.msg.preguntas?.length}>
        <RegistroPreguntas
          items={props.msg.preguntas!}
          respuestas={props.respuestas}
          abierta={props.preguntasAbiertas}
          onAlternar={props.onAlternarPreguntas}
        />
      </Show>

      {/* Envuelto para que no encoja mientras el turno vive. El markdown
          se reparsea con cada token: una negrita sin cerrar se pinta
          literal, y cerrada se pinta en negrita, cambiando el alto de
          forma no monótona y encogiendo el bloque. Con el hilo pegado al
          final eso es el temblor. `lib/paste.ts` fija la última línea al
          borde y no cubre este caso. Ver `ui/MonotonicHeight.tsx`. */}
      {/* La identidad del turno —logo, proveedor y modelo— vive en la fila de
          acciones, con la hora y los botones, y solo al posar. Antes firmaba la
          respuesta con un renglón encima; ahí competía con el texto y nombraba
          al encargado del hilo, que ya lo dice la cabecera. */}
      <Show when={texto()}>
        {(md) => (
          <AltoMonotono vivo={props.vivo} searchBlock={props.searchBlock}>
            <TextoConSiguientes texto={md()} vivo={props.vivo} rapida={props.rapida} readVisual={props.readVisual} openVisual={props.openVisual} owner={props.visualScope ?? ""} visualBudget={props.visualBudget} />
          </AltoMonotono>
        )}
      </Show>

      <Show when={props.msg.historyRefs?.length}><HistoryDetails refs={props.msg.historyRefs!} turnId={props.msg.turno} /></Show>
      <Show when={props.msg.images?.length ? props.msg.images : null}>
        {(images) => <ImagenesEntregadas items={images()} />}
      </Show>


      <div class={cn(FILA_DEL_MENSAJE, "-ml-1.5")}>
        <Show when={texto()}>
          {(md) => (
            <BotonCopiar
              copiando={props.copiando}
              copiado={props.copiado}
              onCopiar={() => void props.onCopiar(props.msg.turno ?? "", stripNextSteps(md()))}
            />
          )}
        </Show>
        <Show when={props.onFork && props.msg.turno}>
          <TooltipRoot openDelay={RETARDO_TOOLTIP} placement="top">
            <TooltipTrigger
              as={(p: object) => (
                <Button
                  {...p}
                  type="button"
                  variant="ghost"
                  size="iconCompact"
                  class="text-neutral-500"
                  disabled={props.forkeando || props.forkDeshabilitado}
                  aria-label={t("chat.actions.fork")}
                  onClick={(e: MouseEvent) => {
                    (p as { onClick?: (e: MouseEvent) => void }).onClick?.(e);
                    void props.onFork!(props.msg.turno!);
                  }}
                >
                  <Split size={14} class="rotate-90" />
                </Button>
              )}
            />
            <TooltipContent class="whitespace-nowrap">
              {t("chat.actions.fork")}
            </TooltipContent>
          </TooltipRoot>
        </Show>
        <HoraDelTurno at={props.msg.at} />
        <LineaDeProveedor
          agent={props.msg.agent ?? props.agenteDelTurno}
          provider={props.msg.model_vendor}
          model={props.msg.reported_model}
          catalogo={props.catalogo}
          agentLabel={props.agentLabel}
        />
      </div>

    </article>
  );
}

type RespuestaRapida = {
  /** Falso si la caja tampoco podría mandar: sin cuenta o con una pregunta abierta. */
  puede: boolean;
  usada: (texto: string) => boolean;
  onElegir: (texto: string) => Promise<boolean>;
};

/**
 * La respuesta del agente con sus respuestas rápidas pintadas como botones.
 * `Index` y no `For`: cada token trae partes nuevas y `For` remontaría el
 * markdown entero en cada una.
 */
function TextoConSiguientes(props: { texto: string; vivo: boolean; rapida: RespuestaRapida | null; owner: string; visualBudget: VisualBudget; readVisual?: (file: string) => Promise<string>; openVisual?: (file: string) => Promise<void> }) {
  const partes = createMemo(() => {
    const visuals = props.readVisual ? splitChatVisuals(props.texto, props.vivo) : [{ kind: "markdown" as const, markdown: props.texto }];
    return visuals.flatMap<Visual | NextStepsPart>((part) => part.kind === "visual" ? [part] : splitNextSteps(part.markdown, props.vivo));
  });
  const [enviando, setEnviando] = createSignal(false);
  const elegir = async (texto: string) => {
    if (!props.rapida || enviando()) return;
    setEnviando(true);
    try {
      await props.rapida.onElegir(texto);
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Index each={partes()}>
      {(parte) => {
        const bloque = () => {
          const p = parte();
          return p.kind === "next_steps" ? p : null;
        };
        const markdown = () => {
          const p = parte();
          return p.kind === "markdown" ? p.markdown : "";
        };
        return (
          <Show when={parte().kind === "visual" && props.readVisual} fallback={
          <Show when={bloque()} fallback={<Markdown>{markdown()}</Markdown>}>
            <Show when={bloque()?.prose}>
              <Markdown>{bloque()?.prose ?? ""}</Markdown>
            </Show>
            <NextSteps
              options={bloque()?.options ?? []}
              usada={(texto) => props.rapida?.usada(texto) ?? false}
              habilitado={Boolean(props.rapida?.puede && bloque()?.complete) && !enviando()}
              onElegir={(texto) => void elegir(texto)}
            />
          </Show>
          }>
            <ChatVisual visual={parte() as Visual} owner={props.owner} budget={props.visualBudget} read={(file) => props.readVisual!(file)} open={props.openVisual} />
          </Show>
        );
      }}
    </Index>
  );
}

function ImagenesEntregadas(props: { items: string[] }) {
  const imagenes = () => props.items.map(imagenInerte).filter((url): url is string => url !== null);
  return (
    <Show when={imagenes().length > 0}>
      <div class="pt-2">
        <CarruselDeImagenes srcs={imagenes()} />
      </div>
    </Show>
  );
}

/**
 * Con qué se recuerda si el registro de un turno está desplegado.
 *
 * El id del turno cuando lo tiene. Las transcripciones escritas antes de que
 * existiera no lo traen, y ahí se cae al texto: dos turnos del agente con el
 * mismo texto exacto compartirían pliegue, que es un defecto mucho más chico que
 * el que todos compartan uno.
 */
function claveDeTrabajo(msg: Msg): string {
  return msg.turno ?? `texto:${msg.text.slice(0, 64)}`;
}

/** Identidad de la fila que nace con el primer paso y cierra con la respuesta. */
function claveDeBloque(i: string): string {
  return `bloque:${i}`;
}

/** El mecanismo de preguntas no es una respuesta para la persona. */
function textoVisible(texto: string) {
  const anuncioInterno = /\.?\s*preguntas\s*(?:(?:\.|punto)\s*json|\.json)/i;
  return texto
    .split(/\r?\n/)
    .filter((linea) => !anuncioInterno.test(linea))
    .join("\n")
    .trim();
}

/**
 * La interrupción es un hito del hilo, no un error recuperable por texto.
 *
 * Se conserva el formato anterior: las transcripciones ya escritas llevan
 * el aviso largo, y al reabrirlas se ven igual de compactas que las nuevas.
 */
function esInterrupcion(msg: Msg) {
  return (
    msg.role === "system" &&
    msg.meta === "fallo" &&
    (msg.text === "Interrumpido." ||
      msg.text === "chat.turn.cancelled" ||
      msg.text.startsWith("Turno interrumpido."))
  );
}

/** El turno dejó de avanzar; lo que produjo ya está arriba en el hilo. */
function Interrupcion() {
  return (
    <div class="col-start-1 flex items-center gap-3 py-2 text-xs text-neutral-500" role="status">
      <span class="h-px flex-1 bg-border" aria-hidden="true" />
      <span>{t("chat.interrupted")}</span>
      <span class="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  );
}

/** La tarea siguió con el motor nuevo tras cortar su turno para actualizar (`update_resume.rs`). */
function LineaDeSistema(props: { texto: string }) {
  return (
    <div class="col-start-1 flex items-center gap-3 py-2 text-xs text-neutral-500" role="status">
      <span class="h-px flex-1 bg-border" aria-hidden="true" />
      <span>{props.texto}</span>
      <span class="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  );
}

/**
 * El turno que siguió a un cambio de CLI (`provider_handoff_v1`). El motor
 * escribe la prosa —qué agente entró y si retomó su sesión o leyó el texto—;
 * aquí solo se lee como el separador que es.
 */
function TraspasoDeProveedor(props: { texto: string }) {
  return (
    <div
      class="col-start-1 flex items-center gap-3 py-2 text-xs text-neutral-500"
      role="status"
      data-provider-handover
    >
      <span class="h-px flex-1 bg-border" aria-hidden="true" />
      <span class="min-w-0 break-words text-center">{prosa(props.texto)}</span>
      <span class="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  );
}

/** La tarea siguió en otra cuenta, o en la misma cuando volvió su cupo. */
function SiguioTrasElCupo(props: { cambio: CambioPorCupo }) {
  return (
    <div
      class="col-start-1 flex items-center gap-3 py-2 text-xs"
      classList={{
        "text-info-strong": Boolean(props.cambio.to),
        "text-neutral-500": !props.cambio.to,
      }}
      role="status"
      data-quota-row={props.cambio.to ? "switched" : "resumed"}
    >
      <span class="h-px flex-1 bg-border" aria-hidden="true" />
      <span>{prosaDelCambioPorCupo(props.cambio)}</span>
      <span class="h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  );
}

/**
 * Lo que la Bandeja de un agente recibe cuando termina una tarea que lanzó, y
 * la línea del turno con que Terminus la despierta. El informe de la hija va
 * citado debajo: es lo que ella dijo, no la app.
 */
function FilaDeLaBandeja(props: {
  msg: Msg;
  onOpenTask?: (folder: string, task: string, machine?: string | null) => void;
  tareaPorId?: (id: string) => SenderTask | null;
}) {
  const informe = () => (citaInforme(props.msg.meta) ? props.msg.text.trim() : "");
  const tarea = () => {
    if (props.msg.fromTask || props.msg.meta !== "respondido") return props.msg.fromTask ?? null;
    const id = idDeLaEntregaAntigua(props.msg.text);
    return id ? (props.tareaPorId?.(id) ?? null) : null;
  };
  return (
    <div
      class="col-start-1 flex items-start gap-3 py-2 text-xs text-neutral-500"
      role="status"
      data-sender="system"
      data-inbox-row={props.msg.meta}
    >
      <span class="mt-[0.45rem] h-px w-6 shrink-0 bg-border" aria-hidden="true" />
      <span class="flex min-w-0 flex-col items-start gap-1">
        <span class="break-words">
          {prosaDeLaFila(props.msg.meta ?? "", tarea()?.title ?? null, props.msg.woke_by?.length ?? 0)}
          <Show when={props.onOpenTask ? tarea() : null}>
            {(sender) => (
              <>
                {" — "}
                <button
                  type="button"
                  class="cursor-pointer underline underline-offset-2"
                  aria-label={t("chat.recipients.open_task", { title: sender().title })}
                  onClick={() => props.onOpenTask?.(sender().folder, sender().task, sender().machine)}
                >
                  {t("chat.task_completed.open")}
                </button>
              </>
            )}
          </Show>
        </span>
        <Show when={informe()}>
          {(texto) => (
            <blockquote class="m-0 border-l-2 border-border pl-2 break-words whitespace-pre-wrap text-neutral-700">
              {texto()}
            </blockquote>
          )}
        </Show>
      </span>
      <span class="mt-[0.45rem] h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  );
}

/**
 * Lo que le pasó al hilo y no lo dijo el agente: un turno que murió, un
 * aviso de la app. Misma forma que la interrupción, solo cambia el
 * color; el panel se queda en la transcripción para siempre
 * (`runtime/chat/`, el cierre). `role="alert"` interrumpe al lector de
 * pantalla: correcto para un fallo, no para un aviso. El texto sale de
 * `failures::Fallo`, traducido; con un gesto que sirva son dos botones. */
function HitoDelHilo(props: {
  msg: Msg;
  /** Si es el fallo de lo último que se escribió: solo ése ofrece reintentar. */
  vigente: boolean;
  /** Volver a mandar lo último que se escribió. */
  onReintentar: () => void;
  /** Llevar a donde se conectan y se cambian las cuentas. */
  onCuentas: () => void;
  /** Abre la tarea que firmó la fila (`Turn::from_task`). */
  onOpenTask?: (folder: string, task: string, machine?: string | null) => void;
}) {
  const esFallo = () => props.msg.meta === "fallo";
  return (
    <div
      class="col-start-1 flex items-start gap-3 py-2 text-xs"
      classList={{
        "text-warning-strong": esFallo(),
        "text-neutral-500": !esFallo(),
      }}
      role={esFallo() ? "alert" : "status"}
      data-sender="system"
    >
      <span class="mt-[0.45rem] h-px w-6 shrink-0 bg-border" aria-hidden="true" />
      <span class="flex min-w-0 flex-col items-start gap-0.5">
        <span class="break-words">
          {prosaDelFallo(props.msg)}
          <Show when={gestoDeLaFila(props.msg, props.vigente)}>
            {(g) => (
              <>
                {" — "}
                <button
                  type="button"
                  class="cursor-pointer underline underline-offset-2"
                  onClick={() =>
                    g().accion === "reintentar"
                      ? props.onReintentar()
                      : props.onCuentas()
                  }
                >
                  {t(g().clave)}
                </button>
              </>
            )}
          </Show>
          <Show when={props.onOpenTask ? props.msg.fromTask : null}>
            {(sender) => (
              <>
                {" — "}
                <button
                  type="button"
                  class="cursor-pointer underline underline-offset-2"
                  aria-label={t("chat.recipients.open_task", { title: sender().title })}
                  onClick={() => props.onOpenTask?.(sender().folder, sender().task, sender().machine)}
                >
                  {t("chat.task_completed.open")}
                </button>
              </>
            )}
          </Show>
        </span>
        <Show
          when={props.msg.fallo?.detail && props.msg.fallo.detail !== prosaDelFallo(props.msg)
            ? props.msg.fallo : null}
        >
          {(f) => (
            <details class="text-neutral-500">
              <summary class="cursor-pointer text-caption">{t("common.failure.detail")}</summary>
              <p class="m-0 font-mono text-[0.7rem] break-all whitespace-pre-wrap">{f().detail}</p>
            </details>
          )}
        </Show>
      </span>
      <span class="mt-[0.45rem] h-px flex-1 bg-border" aria-hidden="true" />
    </div>
  );
}

/**
 * Acciones y hora de un mensaje, solo al posar en él o al enfocarlas. Con un
 * `group` sin nombre respondería a cualquier ancestro y se encenderían las de
 * todo el hilo. El sitio se reserva para que no baile el hilo.
 */
/** Una marca de laboratorio para comparar con el hilo por tramos; no es una opción de producto. */
const HILO_POR_TRAMOS = "terminus.chat.thread-chunks";
const FILAS_ANTES_DE_PEDIR = 8;

const FILA_DEL_MENSAJE =
  "flex items-center gap-0.5 pt-1 opacity-0 transition-opacity group-hover/mensaje:opacity-100 group-focus-within/mensaje:opacity-100";

function HoraDelTurno(props: { at?: number }) {
  return (
    <Show when={props.at}>
      {(at) => (
        <time
          datetime={new Date(at()).toISOString()}
          tabindex={0}
          class="cursor-default rounded-sm px-1 text-caption leading-4 whitespace-nowrap text-neutral-500 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {mostrarHoraDeTurno(at())}
        </time>
      )}
    </Show>
  );
}

/**
 * De dónde salió un turno —logo del agente y modelo—, tras la hora.
 *
 * **No se inventa el modelo con el que se contestaría hoy**: usa el que el
 * cierre observó en ese turno. El nombre del proveedor no se escribe —el logo
 * ya lo dice—; sin modelo solo queda el logo, con el nombre en el título.
 */
function LineaDeProveedor(props: {
  agent: string;
  provider?: string;
  /** El modelo observado en ese turno, no el elegido ahora. */
  model?: string;
  catalogo: AgentModels | null;
  /** Cómo se llama el agente, para el título cuando no hay proveedor. */
  agentLabel: string;
}) {
  // El nombre del proveedor no se escribe: el logo ya lo dice y el modelo va
  // solo. Queda en el `title` para quien pase el cursor por encima.
  const titulo = () => props.provider ?? props.agentLabel;
  return (
    <span
      class="flex items-center gap-1 whitespace-nowrap rounded-sm px-1 text-caption leading-4 text-neutral-500"
      title={titulo()}
      aria-label={t("chat.actions.provider")}
      data-provider={props.provider}
    >
      <span class="flex size-3.5 shrink-0 items-center justify-center">
        <MarcaAgente id={props.agent} size={12} />
      </span>
      <Show when={props.model}>
        {(id) => (
          <span class="max-w-[16rem] truncate" title={id()}>
            {nombreDeModelo(id(), props.catalogo)}
          </span>
        )}
      </Show>
    </span>
  );
}

function BotonCopiar(props: {
  copiando: boolean;
  copiado: boolean;
  onCopiar: () => void;
}) {
  return (
    <TooltipRoot openDelay={RETARDO_TOOLTIP} placement="top">
      <TooltipTrigger
        as={(p: object) => (
          <Button
            {...p}
            type="button"
            variant="ghost"
            size="iconCompact"
            class="text-neutral-500"
            disabled={props.copiando}
            aria-label={props.copiado ? t("chat.actions.copied") : t("chat.actions.copy")}
            onClick={(e: MouseEvent) => {
              (p as { onClick?: (e: MouseEvent) => void }).onClick?.(e);
              props.onCopiar();
            }}
          >
            <Show when={props.copiado} fallback={<Copy size={14} />}>
              <Check size={14} />
            </Show>
          </Button>
        )}
      />
      <TooltipContent class="whitespace-nowrap">
        {props.copiado ? t("chat.actions.copied") : t("chat.actions.copy")}
      </TooltipContent>
    </TooltipRoot>
  );
}

/** «27 ago, 11:12»; el año solo si no es el actual. */
function mostrarHoraDeTurno(at: number, ahora: Date = new Date()) {
  const fecha = new Date(at);
  const mismoAnio = fecha.getFullYear() === ahora.getFullYear();
  return df({
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    ...(mismoAnio ? {} : { year: "numeric" }),
  }).format(fecha);
}


/** Cuántas fuentes se llegan a ofrecer de una vez. */
const TOPE_MENU = 60;

/**
 * Ordena las fuentes por lo que se está tecleando.
 *
 * Gana el nombre del archivo sobre la ruta —se escribe `@SYSTEM`, no
 * `@harness-app/SY`— y, a igualdad, la ruta más corta: lo que está más cerca de la
 * raíz del proyecto es lo que se menciona más.
 */
function filterMentionSources(fuentes: MentionSource[], consulta: string): MentionSource[] {
  if (!consulta) return fuentes.slice(0, TOPE_MENU);
  const puntos = (f: MentionSource) => {
    const ruta = f.ruta.toLowerCase();
    const base = ruta.slice(ruta.lastIndexOf("/") + 1);
    if (base.startsWith(consulta)) return 0;
    if (base.includes(consulta)) return 1;
    if (ruta.includes(consulta)) return 2;
    return 3;
  };
  return fuentes
    .map((f) => ({ f, p: puntos(f) }))
    .filter((x) => x.p < 3)
    .sort((a, b) => a.p - b.p || a.f.ruta.length - b.f.ruta.length)
    .slice(0, TOPE_MENU)
    .map((x) => x.f);
}

/**
 * Qué material se empezó a ofrecer, en el punto del hilo donde pasó. No hay
 * contrapartida de salida: lo que el agente leyó sigue en la sesión
 * (`--resume`) y solo una sesión nueva lo retira.
 */
function CambioDeContexto(props: {
  cambio: { entraron: string[] };
  catalogo: Source[];
}) {
  const Marca = (p: { id: string }) => {
    const s = () => props.catalogo.find((f) => f.id === p.id);

    return (
      <span class="flex items-center gap-1">
        <Show when={s()}>
          {(f) => <MarcaFuente location={f().location} kind={f().kind} />}
        </Show>
        <span class="min-w-0 truncate">
          {s() ? s()!.etiqueta : t("chat.context.gone_source")}
        </span>
      </span>
    );
  };

  return (
    <div class="flex items-center gap-2 text-caption text-neutral-500">
      <span class="h-px flex-1 bg-border" />
      <div class="flex min-w-0 flex-col gap-1">
        <Show when={props.cambio.entraron.length}>
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <span class="font-semibold text-neutral-700">
              {t("chat.context.added")}
            </span>
            <For each={props.cambio.entraron}>{(id) => <Marca id={id} />}</For>
          </div>
        </Show>
      </div>
      <span class="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * Lo que dice una fila de sistema.
 *
 * El reenvío se ve —quién lo pasó a quién—, o llega una respuesta firmada por
 * alguien a quien nadie llamó y se lee como un error de la app. Se compone
 * aquí solo cuando el turno no trae prosa: la que mande Rust gana, que es la
 * que se auditó.
 */
function textoDeSistema(m: Msg): string {
  const aviso = avisoDeEncargado(m);
  if (aviso) return aviso;
  if (m.meta !== "reenvio" || m.text) return m.text;
  const a = (m.recipients ?? []).map((r) => r.name).join(", ");
  return m.encargado && a
    ? t("chat.recipients.forwarded", { from: m.encargado, to: a, hops: m.hops ?? 1 })
    : m.text;
}

/** Los eventos del turno que no son herramientas, con su clase de fila. */
function claseDeSistema(meta: string | undefined): Clase {
  if (meta === "gasto") return "gasto";
  if (meta === "fin") return "fin";
  return "aviso";
}
