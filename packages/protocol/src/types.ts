/**
 * Lo que contestan los comandos de `APP_COMMANDS`, con los nombres de campo del
 * motor (`esperando`, `chat_de_agente`): ni el relay ni el bridge los renombran.
 * Solo los campos que usan los clientes; el motor manda más.
 */
export type EngineError = { code: string; message_key?: string; detail?: unknown };

/** La cuenta de Danil vinculada a un workspace (`danil` de `list_workspaces`). */
export type WorkspaceDanil = { user_id: string; email?: string | null; name?: string | null };
/**
 * Un workspace tiene el mismo id en cada máquina que lo tiene (`groupWorkspaces`).
 * `default_permission_mode`, el modo con que arranca una tarea nueva si la
 * persona eligió uno (`workspaces::Workspace::default_permission_mode`).
 */
export type Workspace = { id: string; name: string; provider?: string | null; remote?: string | null; danil?: WorkspaceDanil | null; default_permission_mode?: string | null };
/** `list_workspaces`. */
/**
 * `list_workspaces` → `machine_resources`. Lo de `memory` en adelante es aditivo
 * y llega con la característica de servicio `machine_usage_v1` (seldon-host
 * `docs/proposals/2026-10-29-machine-resources.md` §3.3): un host anterior solo
 * trae `storage`, y la interfaz lo muestra como «Solo disco», nunca como viejo.
 */
export type MachineResources = {
  measured_at: number;
  error?: "measurement_failed" | "unsupported";
  storage: { id: string; label: string; total_bytes: number; free_bytes: number; available_bytes: number; terminus_bytes: null; attribution: "unknown" }[];
  memory?: { total_bytes: number; available_bytes: number; swap_total_bytes: number; swap_used_bytes: number };
  /** `load` es la carga promedio de 1, 5 y 15 min; `usage_percent`, el uso de 0 a 100, desde la segunda lectura. */
  cpu?: { cores: number; load: [number, number, number]; usage_percent?: number };
  /** PSI `some avg60`, en %. `memory_history`: el de memoria por minuto, el más viejo primero (Linux; vacío el primer minuto). */
  pressure?: { cpu: number; memory: number; io: number; memory_history?: number[] };
  /** `rss_bytes` y `threads` llegan con `machine_usage_v1`; lo demás, ver `EngineUpdate`. */
  engine?: { rss_bytes?: number; threads?: number } & EngineUpdate;
  /** `cgroup` cuenta exacto; `best_effort` (macOS) reparte por proceso; `none`, sin reparto por tarea. */
  attribution?: "cgroup" | "best_effort" | "none";
  tasks?: MachineTaskUsage[];
  other?: { memory_bytes: number; processes: number };
  /** El aviso de presión activo del motor (memoria `some avg60` sostenida), con lo que más usa. */
  pressure_alert?: { since: number; memory: number; tasks: { workspace: string; session: string; title: string; memory_bytes: number }[] };
  /** Cuánto tardó la lectura, en µs. */
  measure_us?: number;
};
/**
 * `engine_update_status` y el bloque `engine` de `machine_resources` (seldon-host
 * `engine_update.rs`): `version` y `build` siempre; el resto, con `engine_update_v1`.
 */
export type EngineUpdate = {
  version?: string;
  build?: string;
  available?: boolean;
  channel?: string;
  /** La última release firmada del canal; `null` si no se conoce. */
  latest?: { release: string; version?: string; commit?: string; sha256?: string; published_at?: string } | null;
  update_available?: boolean;
  /** `current` ya apunta a otra release: se cambia al quedar sin turnos. */
  handover_pending?: boolean;
  download?: { request_id: string; release: string; state: "downloading" | "staged" | "rejected"; error?: string } | null;
  pending?: { request_id?: string; release?: string; mode?: "now" | "when_idle" } | null;
  last?: { request_id?: string; state?: string; error?: string | null } | null;
};
export type MachineTaskUsage = {
  workspace: string;
  session: string;
  /** De la tarea, no del proceso: `finished` (también archivada con turno vivo) con procesos es «Quedó corriendo». */
  state: "running" | "idle" | "finished";
  memory_bytes: number;
  memory_peak_bytes: number;
  /** % de un núcleo, como en `top`: puede pasar de 100. Promedio de los últimos 10 s. */
  cpu_percent: number;
  processes: number;
  pressure_memory: number;
  browsers: { session: string; since: number }[];
  /** Hasta 5. */
  top: { pid: number; command: string; rss_bytes: number }[];
  title?: string;
  project?: string | null;
  archived?: boolean;
  /** En ms, solo si terminó o se archivó. */
  ended_at?: number;
};
export type WorkspaceStorage = {
  bytes: number; recuperable: number; medido_en: number; aviso: string | null;
  tareas: { session: string; project: string; tarea: string; proyecto: string | null; bytes: number }[];
  compartido: { bytes: number }[]; sueltos: { bytes: number }[];
};
/** `cached_at`: la ventana lo agrega cuando la máquina está apagada y la respuesta salió de su última copia. */
export type Startup = { workspaces: Workspace[]; active: string | null; machine_resources?: MachineResources; cached_at?: number | null };
/** `list_projects`: una carpeta del workspace. */
export type Project = { id: string; name: string; working_directory?: string | null; kind?: "git" | "folder"; remote_url?: string | null };
/**
 * Evento `project_clone` y respuesta de `project_clone_status`: el clon que pidió
 * `start_project_clone`. Termina con `done` y `project`, o con `error` (un
 * `Failure` del motor; `projects.error.clone_cancelled` si se canceló).
 */
export type ProjectCloneEvent = {
  workspace?: string;
  operation: string;
  phase: string;
  percent: number | null;
  done: boolean;
  project?: Project;
  error?: { what?: Frase; detail?: string } | string;
};
/**
 * `list_spaces`, y lo que devuelven `create_space` y `rename_space`. `name`
 * `null` es el nombre por omisión del catálogo; `account`, que es de la cuenta
 * (el mismo id en todas las máquinas del workspace).
 */
export type Space = { id: string; name: string | null; folders: string[]; created_at?: number; updated_at?: number; account?: boolean };
/** Un espacio nombrado desde otra respuesta; `deleted` si ya no existe. */
export type SpaceRef = { id: string; name: string | null; deleted?: boolean };
/** Una tarea que eliminar el espacio va a tocar, como la vio la persona. */
export type TaskSeen = {
  folder: string;
  task: string;
  root: string;
  title: string;
  working: boolean;
  /** Lo que tiene sin commitear, con su hash: si cambia, el motor no borra. */
  files: { path: string; hash: string }[];
  kn_pending: string[];
};
/** `space_delete_preview`: lo que se detiene, descarta o deja sin guardar. `last`, si es el único espacio. */
export type DeletePreview = { space: SpaceRef; last: boolean; tasks: TaskSeen[] };
/** `delete_space({ id, seen })`: `seen` es exactamente lo de la previa; `discard` si hay archivos sin commitear. */
export type DeleteConsent = { tasks: TaskSeen[]; discard: boolean };
/** `delete_space`: sin `deleted`, `changed` trae la previa nueva (algo cambió) y `failures` lo que no se pudo archivar. */
export type DeleteOutcome = { deleted: boolean; changed: DeletePreview | null; failures: { folder: string; task: string; error: unknown }[] };
/** `archived_tasks`: las archivadas de todas las carpetas, con los espacios que nombran (aunque ya no existan). */
export type ArchivedTasks = { tasks: (SessionRow & { folder: string })[]; spaces: SpaceRef[] };

/** Mantener despierta: Siempre, Con agentes, Apagado. */
export type KeepAwakeMode = "on" | "agent" | "off";
/** `keep_awake_status` y `set_keep_awake`: `active`, si ahora la mantiene despierta; `supported`, si su sistema sabe hacerlo. */
export type KeepAwakeStatus = { mode: KeepAwakeMode; active: boolean; supported: boolean };

/** Un puerto que escucha en la máquina. */
export type OpenPort = {
  /** Estable mientras el puerto sea el mismo. */
  id: string;
  pid: number;
  puerto: number;
  /** Como la reporta el sistema: `127.0.0.1:3000`, `*:5173`. */
  direccion: string;
  /** La que abre un navegador en esa máquina: `http://localhost:5173`. */
  url: string;
  comando: string;
};
/** Lo que una tarea dejó corriendo fuera del grupo de su agente; `orphan`, si nadie lo va a recoger. */
export type TaskProcess = { id: string; pid: number; command: string; cpu_percent: number; elapsed_seconds: number; orphan: boolean };
/** `list_ports`: por tarea y los de fuera; `aviso` dice por qué puede venir vacía. */
export type OpenPorts = {
  tareas: { session: string; project: string; tarea: string; proyecto: string | null; puertos: OpenPort[]; processes: TaskProcess[] }[];
  externos: OpenPort[];
  aviso: string | null;
};

/** `list_live_sessions`: una tarea abierta de una carpeta. */
export type SessionRow = {
  id: string;
  title: string;
  provider: string;
  model: string | null;
  last_message?: string | null;
  created_at: number;
  updated_at: number;
  /**
   * Cuándo cerró el último turno, o cuándo empezó el que corre. Mismas unidades
   * que `updated_at`; un motor viejo no lo manda y la tarjeta usa `updated_at`.
   */
  last_turn_at?: number | null;
  esperando: boolean;
  /** `interrupted`: la persona detuvo el turno, distinto de `failed`. */
  outcome?: "delivered" | "failed" | "interrupted" | null;
  /** El agente con nombre que la lleva. */
  agent: string | null;
  /** El agente que la llevaba antes del último traspaso; `null` si nunca pasó de mano. */
  previous_agent?: string | null;
  space?: string | null;
  pinned?: boolean | null;
  archived?: boolean | null;
  chat_de_agente?: boolean;
  /** Un hilo nuevo del agente (no su chat de siempre). */
  agent_thread?: boolean;
  /** El título es solo el comando con que nació; un motor viejo no lo manda. */
  command_title?: boolean;
  inbox?: boolean;
  parent?: string | null;
  launched_by?: string | null;
  launcher_available?: boolean;
  /** La ejecutora viva de la que continúa por handoff; un motor viejo no lo manda. */
  handoff_parent?: string | null;
  /** Por qué no cuelga de quien le cedió; un motor viejo no lo manda. */
  handoff_issue?: "missing_source" | "contradictory" | "cycle" | null;
  /** Hija de una delegación entre máquinas; un motor viejo no lo manda (`@terminus/tasks` `remote.ts`). */
  remote_parent?: { machine: string; workspace?: string | null; task: string; request_id?: string | null } | null;
  stage?: "in_progress" | "review" | "done" | null;
};

/** `list_agents`: los agentes con nombre de una carpeta. */
export type AgentList = { agents: { name: string; description?: string | null }[] };
export type AgentPresence = "working" | "awake" | "asleep";
/** `list_agent_status`. */
export type AgentStatusRow = { name: string; status: AgentPresence; minutes_since_last_turn: number | null; live_tasks: number };

/** `list_providers`: Codex, Claude… */
export type ProviderInfo = { id: string; label: string; available: boolean; driver: boolean };

export type Option = { value: string; label: string; detail?: string | null };
export type Question = { id: string; question: string; header?: string | null; options: Option[]; multiple: boolean; free_text: boolean };
/** `answer_question`: una respuesta por pregunta. */
export type Answer = { turn: string; question: string; chosen: string[]; free_text: string | null };

/** Un turno de `load_session`. */
export type Turn = {
  history_refs?: HistoryRef[];
  id?: string;
  role: string;
  text: string;
  at?: number;
  meta?: string | null;
  /** Por qué falló, cuando se pudo clasificar (`failures::Fallo`). Sin este campo la clase se guarda y no se ve. */
  fallo?: { clase: string; detail?: string; vuelve_en?: number; reintentos?: number; resumes_at?: number } | null;
  /** Con qué cuenta siguió tras quedarse sin cupo (`quota::QuotaResume`). */
  quota?: { from?: string | null; to?: string | null; until?: number | null } | null;
  model?: string | null;
  /** Tiempo de trabajo activo del tramo del agente; falta en tareas antiguas. */
  duration_ms?: number | null;
  /** Una decisión de permiso: va firmada por la persona, con el texto vacío. */
  permission?: PermissionDecision | null;
  tools?: TurnTool[];
  questions?: Question[] | null;
  answers?: Answer[] | null;
  /** Rutas en la máquina de lo que la persona adjuntó (las viejas, `entradas/…`). */
  attachments?: string[] | null;
  /** El turno en su orden: lo que el agente dijo, con las herramientas (`tool` indexa `tools`) donde las usó. */
  pieces?: TurnPiece[] | null;
  /** Un `!`: el comando va en `text`. */
  shell?: { cwd: string; output: string; exit_code: number | null; duration_ms: number; truncated: boolean } | null;
  /** El encargado que escribió este input, si no fue la persona (`Turn::agent`). */
  agent?: string | null;
  /** La tarea que lo escribió por el CLI (`Turn::from_task`). */
  from_task?: SenderTask | null;
};
/** `sessions::PermissionDecision`. */
export type PermissionDecision = { tool: string; target?: string | null; allow: boolean };
/** Un turno que sigue contestando (`turn::list_live_turns`); `started_at` en ms de la máquina. */
export type LiveTurn = { session: string; started_at: number };
/** La tarea que escribió un input, como era al escribirlo (`sessions::SenderTask`). */
export type SenderTask = { folder: string; task: string; title: string; provider: string; model?: string | null; machine?: string | null };
/** Un paso del turno; `images` son data URLs que produjo la herramienta. `ok: false` si falló. */
export type TurnTool = { name?: string; target?: string | null; images?: string[]; ok?: boolean | null };
/** Un trozo de `Turn.pieces`. */
export type TurnPiece = { text: string } | { tool: number };
/** `preview_file` y `attachment_preview`. */
export type FilePreview = {
  rel: string;
  kind: "html" | "image" | "text" | "pdf" | "binary";
  text?: string | null;
  data_url?: string | null;
  /** El PDF en base64. */
  pdf?: string | null;
  bytes: number;
  truncated: boolean;
};
/** `tree_show`: un archivo de un árbol de la tarea. */
export type TreeContent = { kind: string; text: string; bytes: number; truncated: boolean; data_url?: string | null; pdf?: string | null };
/** `list_task_trees`: un árbol de la tarea (su copia de trabajo, y los que declare). */
export type TaskTree = { key: string; name: string; path: string; kind: "git" | "folder" | "kn"; missing: boolean };
/** Una carpeta de `tree_files`: `lazy` e `ignored` no traen sus archivos en la lista. */
export type TreeFolder = { path: string; repo: boolean; lazy?: boolean; ignored?: boolean };
/** `tree_files`: las rutas de los archivos de un árbol, con sus carpetas. */
export type TreeFiles = { paths: string[]; folders: TreeFolder[]; truncated: boolean };
/** `load_session`. */
/** The `history` field of a read: `turns[i]` is turn `start + i`. */
export type HistoryPage = { version?: number; revision?: string; total: number; start: number; end: number; limit: number; has_more: boolean };

export type OpenedSession = {
  id: string;
  /** El CLI de la tarea, no el proveedor del modelo (el `model_vendor` del cable). */
  provider: string;
  model: string | null;
  observed_model?: string | null;
  agent?: string | null;
  permission_mode?: string | null;
  turns: Turn[];
  history?: HistoryPage | null;
  /**
   * Con `provider_handoff_v1`: si `set_session_provider` la dejaría cambiar de
   * CLI. Un motor anterior no lo manda; ausente es que no puede (`canHandOver`).
   */
  can_hand_over?: boolean;
  /** La clave del catálogo (`chat.handover.*`) que explica el rechazo. */
  hand_over_blocked?: string | null;
};

/** `pending_requests`. */
export type PendingRequests = {
  questions: { request_id: string; turn: string }[];
  permissions: { request_id: string; tool: string; target: string | null }[];
};

export type AttentionState = "approving" | "asked" | "failed" | "unseen";
/** `list_workspace_attention` y el evento `attention`. */
export type WorkspaceAttention = { workspace: string; tasks: { session: string; project: string; state: AttentionState }[] };

/** El evento `chat`. */
export type ChatEvent = {
  workspace?: string;
  session: string;
  kind: string;
  text: string;
  meta: string | null;
  ok: boolean | null;
  request_id: string | null;
  target?: string | null;
  starts_message?: boolean;
};
/** Un evento del motor tal como llega (`service events`). */
export type EngineEvent = { name: string; payload: unknown; workspace?: string | null };

// --- El cuadro de escribir ---------------------------------------------------

/** Un texto del motor: ya escrito, o una clave del catálogo del escritorio con sus datos. */
export type Frase = string | { clave: string; datos?: Record<string, string | number> | null };

/** Un modelo de `list_models`; `efforts` vacío es que no se elige razonamiento. */
export type ModelOption = { id: string; label: string; note?: Frase | null; efforts: string[]; default_effort: string | null };
/** `list_models`. */
export type ProviderModels = { provider: string; models: ModelOption[]; fallback?: boolean | null };
/** `list_permission_modes`: `por_omision` es el que toma una tarea nueva; `falta` dice por qué no se puede usar. */
export type PermissionModeOption = { id: string; label: Frase; falta?: Frase | null; por_omision?: boolean };
/** `list_slash_menu`: los comandos del CLI y las skills. */
export type SlashMenu = { commands: { name: string; description?: string | null }[]; skills: { name: string; description?: string | null }[]; side_question?: string | null };
/** `list_mentions`: archivos y carpetas que se pueden nombrar con `@`. */
export type MentionList = { fuentes: { ruta: string; tipo: string; fuente?: string | null }[]; truncado?: boolean };
/**
 * `project_base_branches`. El motor manda `remote` como booleano. Un doble de
 * desarrollo llegó a mandar el nombre del remoto, o `null`.
 */
export type BaseBranches = {
  branches: { reference: string; name: string; remote?: boolean | string | null; commit?: string | null; ahead?: number | null; behind?: number | null }[];
  selected: string | null;
  fetched_at?: number | null;
};
/** `task_blockers`: lo que impide archivar sin preguntar. */
export type TaskBlockers = { unsaved: { session: string; title: string; files: string[] }[]; not_finished?: boolean };

// --- Cuentas de IA ---------------------------------------------------------------

/** Una cuenta de `list_accounts`; `identity` es el correo, si el CLI lo dice. */
export type AiAccount = {
  id: string;
  label: string;
  created_at?: number | null;
  identity: string | null;
  authenticated_at: number | null;
  /** Identidad estable de la suscripción o workspace; no se muestra. */
  credential_group?: string | null;
};
/** `list_accounts(provider)`. */
export type AccountList = { provider: string; active: string | null; accounts: AiAccount[] };
/** `account_status`. */
export type AccountStatus = { id: string; authenticated: boolean; detail?: string | null };
/** Una ventana de consumo: `used_pct` usado (0–100) y cuándo vuelve a empezar, en ms. */
export type UsageWindow = { label: string; used_pct: number; resets_at: number | null };
/** `account_limits`: el consumo, si se pudo leer. */
export type AccountLimits =
  | { mode: "read"; windows: UsageWindow[]; plan: string | null; fetched_at: number }
  | { mode: "waiting"; retry_at: number; detail?: unknown; last?: { windows: UsageWindow[]; plan: string | null; fetched_at: number } | null }
  | { mode: "no_account" | "revoked" | "failed" | "in_use"; what?: unknown; detail?: unknown };
/** `run_shell_command`: la tarea (nueva si se mandó sin sesión) y su turno. */
export type ShellRun = { session: string; turn: string };
/** El evento `account` de un inicio de sesión por tubería (enlace y código); `account` es el id de la cuenta. */
export type LoginEvent = { account: string; kind: "url" | "confirm" | "code" | "notice" | "done"; text: string };

/** Referencia de sólo lectura a un campo original; cada fragmento vuelve autorizado por tarea. */
export type HistoryRef = { version: 1; turn: number; pointer: string; revision: string; bytes: number; project?: string; session?: string };
export type HistoryChunk = { version: 1; revision: string; offset: number; next: number; total: number; done: boolean; text: string };
