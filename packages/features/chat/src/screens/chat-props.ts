import type { Preview } from "../../../../ui/src/lib/preview.ts";
import type { InvokeOptions } from "../../../../host/src/native.ts";
import { type JSX } from "solid-js";
import type { ThreadSearchTarget } from "./ThreadSearch";
import type { OlderState } from "../model/history";
import type { ObservedTurnActivity as TurnActivity } from "../model/activityObservation";
import { type Lectura } from "../model/threadWindow";
import { type MentionTarget, type PlaceCandidate, type TextEdit, type TaskCandidate, type TaskMention } from "../../../../ui/src/lib/taskMentions";
import { type Recipient, type RecipientCandidate, type SenderTask } from "../../../../ui/src/lib/recipients";
import { type MentionSources } from "../../../../ui/src/lib/mentions";
import type { Agent, AgentModels, HandlerStatus, ModoDePermiso, Source } from "../../../../ui/src/lib/model";
import type { CreateFreeRouterConsent } from "../../../../ui/src/lib/freeRouterConsent.ts";
import type { MachineOf } from "../queries/history-details";
import { type CatalogosDeModelos, type OpcionDeModelo } from "../../../../ui/src/lib/models";
import { type CliCommand, type Skill } from "../../../../ui/src/lib/skills";
import type { Superficie } from "../../../../ui/src/lib/surfaces";
import type { Ventana } from "../../../../ui/src/lib/usage";
import { type AlMargen } from "../components/SideQuestion";
import { type ColaDeMensajesProps } from "../components/MessageQueue";
import { type ComandoEnVivo } from "../components/ShellCard";
import { type AlmacenDePreguntas, type RespuestaEnviada } from "../components/Questions";
import { type MachineWaitStatus } from "../components/TurnStatus";
import type { Msg, PermissionOrigin } from "../model/messageTypes";
import type { HandoffPresentation } from "../../../../ui/src/lib/handoff.ts";
import { type VistaDeLaConversacion } from "./chat-model";

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
  activities?: readonly TurnActivity<Msg>[];
  handoff?: HandoffPresentation;
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
  /** La máquina de la tarea se enciende para recibir el mensaje que ya salió. */
  machineWait?: MachineWaitStatus | null;
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
  onRecipient?: (name: string, label: string, trigger: import("../../../../ui/src/lib/mentions").Trigger) => void;
  onReference?: (target: MentionTarget, label: string, trigger: import("../../../../ui/src/lib/mentions").Trigger) => void;
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
  renderAvatar: (props: { name: string; status: HandlerStatus; body?: string | null; avatar?: string | null; size?: number; class?: string }) => JSX.Element;
  renderPdf: (props: { base64: string; name: string }) => JSX.Element;
  createFreeRouterConsent: CreateFreeRouterConsent;
  machineOf: MachineOf;
  /** Identificador numérico de workspace en plataforma (opcional, para proxy MCP). */
  workspaceId?: string | null;
};
