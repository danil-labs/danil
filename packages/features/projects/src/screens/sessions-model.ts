import { df } from "../../../../../apps/desktop/src/lib/format";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import type { Etapa } from "./TaskStage";
import type { TaskActivity } from "@terminus/design";

export function readableSessionTitle(title: string): string {
  if (!title.startsWith("/root/")) return title;
  return title.split("/").filter(Boolean).at(-1)?.replaceAll("_", " ") || title;
}

/** Lo que devuelve `task_blockers`: qué estorba para terminar o archivar. */
export type Blockers = {
  unsaved: { project?: string; session: string; title: string; files: string[] }[];
  not_finished: boolean;
};

/** El gesto que quedó esperando a que la persona decida qué hacer con eso. */
export type Aviso = { id: string; finish: boolean; rect?: DOMRect; blockers: Blockers };

/** El título de un tema; el de la Bandeja sale del catálogo, no de `session.json`. */
/** El nombre del agente en la pastilla de la fila: diez caracteres como mucho,
 *  para que el mensaje de al lado conserve su sitio. Completo en el `title`. */
const AGENT_NAME_MAX = 10;
export function shortAgentName(nombre: string): string {
  const letras = [...nombre];
  return letras.length > AGENT_NAME_MAX ? `${letras.slice(0, AGENT_NAME_MAX - 1).join("")}…` : nombre;
}

/**
 * La hora corta de la tarjeta del riel: `ahora`, `4m`, `2h`, `ayer`, `3d` dentro
 * de la semana y después la fecha (`12 oct`). No es un contador: se escribe al
 * pintar la fila y se rehace cuando la fila cambia, no cada minuto.
 */
export function shortTaskTime(when: number, now = Date.now()): string {
  if (!Number.isFinite(when)) return "";
  const minutes = Math.floor((now - when) / 60_000);
  if (minutes < 1) return t("projects.sessions.time_now");
  if (minutes < 60) return t("projects.sessions.time_minutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("projects.sessions.time_hours", { count: hours });
  const midnight = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);
  const days = Math.round((midnight(now) - midnight(when)) / 86_400_000);
  if (days <= 1) return t("projects.sessions.time_yesterday");
  if (days < 7) return t("projects.sessions.time_days", { count: days });
  return df({ day: "numeric", month: "short" }).format(when);
}

export function threadTitle(row: Pick<SessionRow, "inbox" | "title"> | undefined): string {
  return row?.inbox ? t("projects.threads.inbox") : (row?.title ?? "");
}

export type SessionRow = {
  folder?: string;
  workspace?: string;
  delegated_activity?: TaskActivity;
  agent_thread?: boolean;
  /** El título es solo el comando con que nació: lo decide Rust (`Session::command_title`). */
  command_title?: boolean;
  /** Si la sesión nativa ya tiene trabajo: lo decide Rust (`Session::native_work`). */
  native_work?: boolean;
  /** Bandeja antigua del encargado (`Session::inbox`), visible si existe. */
  inbox?: boolean;
  /** El backend decide el pin; las conversaciones antiguas heredan el valor por omisión. */
  pinned?: boolean | null;
  launched_by?: string | null;
  handoff_parent?: string | null;
  handoff_issue?: "missing_source" | "contradictory" | "cycle" | null;
  launcher_available?: boolean;
  root_peer?: boolean;
  /** Hija de una delegación entre máquinas: su coordinador vive allá (`@terminus/tasks` `remote.ts`). */
  remote_parent?: unknown;
  remote_launcher?: string | null;
  has_delegates?: boolean;
  launcher_name?: string | null;
  archived?: boolean | null;
  result_revision?: string | null;
  /** `interrupted`: la persona detuvo el turno; un motor viejo lo manda como `failed`. */
  outcome?: "delivered" | "failed" | "interrupted" | null;
  id: string;
  title: string;
  provider: string;
  /** Con qué modelo corrió. `null` es "el que el agente traiga por omisión". */
  model: string | null;
  last_message?: string | null;
  /**
   * A qué entidades del proyecto apunta la tarea, acumulado turno a turno por
   * el backend. **No se deriva del título**: una fuente mencionada en el turno
   * cinco no está ahí, y es justo lo que hace que se pueda buscar y auditar
   * por referencia en vez de por coincidencia de texto.
   */
  refs: string[];
  /** Cuándo nació. **Es el orden de la lista** (`sessions::list_live_sessions`). */
  created_at: number;
  /** Cuándo se movió por última vez. No es el orden: ver `created_at`. */
  updated_at: number;
  /**
   * Cuándo cerró el último turno, o cuándo empezó el que corre: la hora de la
   * tarjeta del riel. Mismas unidades que `updated_at`, que es su respaldo con
   * un motor que no lo manda.
   */
  last_turn_at?: number | null;
  turns: number;
  /** Borrar al padre conserva a la hija: el historial la muestra en la raíz. */
  parent: string | null;
  /**
   * La llamada del CLI del padre que la abrió, si nació como subagente suyo
   * (`agents::Delegation::Native`). No se le puede escribir: el CLI no
   * reanuda un subagente, y la caja se esconde con esto.
   */
  subagent: string | null;
  /** El agente preguntó algo en esta sesión y nadie ha contestado. */
  esperando: boolean;
  /** Lo pone la ventana desde `workspace/attention.rs`: `list_live_sessions` no lo trae. */
  sin_ver?: boolean;
  /**
   * En qué etapa la puso una persona, o `null` si nadie la marcó. Ver
   * `TaskStage.tsx`.
   */
  stage: Etapa | null;
  /** Con qué criterio corre esta tarea (`workspace/handlers.rs`). */
  agent: string | null;
  /** Quién la llevaba antes del último traspaso; `null` si nunca pasó de mano. */
  previous_agent?: string | null;
  /**
   * El encargado del padre, cuando esta tarea es una hija de orquestación.
   * Derivado, solo para pintar quién la lanzó: NO es el criterio de esta
   * tarea, que no hereda el encargado del padre.
   */
  parent_agent: string | null;
  /**
   * Si esta sesión es el chat persistente de un encargado. El historial la
   * muestra junto a sus tareas en la carpeta; una tarea con `agent` no lleva esto.
   */
  chat_de_agente: boolean;
  /** De qué espacio es (`spaces::of_rows`). Ver `lib/spaces.ts`. */
  space?: string | null;
  /** La máquina que la corre si no es la de la ventana (`@terminus/fleet`); apagada, `machine_on` es `false`. */
  machine?: string;
  machine_on?: boolean;
  /**
   * El relay guardó un cambio (archivar, renombrar, fijar, mover) con la máquina
   * apagada y lo aplica al conectarse (`computers/src/deferred.ts`); hasta
   * entonces la fila lo enseña con una marca discreta, sin error.
   */
  deferred?: boolean;
  /** Con la cuenta de Danil, el estado de la rebanada de su máquina (`@terminus/fleet`) y cuándo se leyó. */
  machine_status?: "ok" | "cached" | "no_answer" | "off" | "outdated" | "license_required";
  machine_at?: number | null;
};

export type SessionsProps = {
  sessions: SessionRow[];
  relatedSessions?: SessionRow[];
  sidebar?: boolean;
  includeArchived?: boolean;
  flat?: boolean;
  readOnly?: boolean;
  groupByAuthor?: boolean;
  groupByHandler?: boolean;
  search?: string;
  matchingIds?: readonly string[];
  onSearchResults?: (count: number) => void;
  current: string | null;
  /**
   * Qué tareas están contestando ahora mismo.
   *
   * **Con una sola tarea a la vez esto no hacía falta**: lo que trabajaba era lo
   * que tenías delante. Desde que se puede lanzar otra sin esperar a la
   * anterior, el historial es el único sitio donde se ve que algo sigue
   * corriendo en una tarea que no estás mirando.
   */
  vivas: string[];
  /**
   * Las tareas paradas esperando que apruebes una acción.
   *
   * **Es el único estado que no avanza sin ti**, así que manda sobre los otros
   * dos: una que trabaja no necesita nada, y una que preguntó puede seguir
   * esperando. Antes esto no se veía en ningún sitio y por eso la hoja de aprobar
   * se pintaba encima de cualquier conversación: era la única forma de no
   * perderla.
   */
  aprobando: string[];
  /**
   * A qué proyectos se puede mover una tarea de esta lista.
   *
   * **Se pasa ya resuelto y no se calcula aquí**: quien monta la lista es el
   * único que sabe de qué grupo es, y una lista que se ofreciera a sí misma
   * como destino sería un movimiento que no mueve nada.
   */
  destinos: { id: string; name: string }[];
  /**
   * De qué grupo es esta lista: el id del proyecto, o `""` para las tareas que
   * no están en ninguno —así nombra el backend a «sin proyecto»
   * (`sessions::move_session`)—.
   *
   * Se necesita entero y no como un booleano: el arrastre tiene que saber cuál
   * de los proyectos de la pantalla es el suyo para no encenderlo como destino.
   */
  de: string;
  onPick: (id: string) => void;
  draggedTask?: string | null;
  onDrag?: (row: SessionRow, event: PointerEvent) => void;
  onDelete: (id: string, members?: number) => void;
  onMove: (id: string, to: string) => void;
  /**
   * Marcar la etapa de una tarea, o quitársela con `null`.
   *
   * **Una hija también se marca.** No se puede mover ni sacar del proyecto
   * —eso rompería el árbol del encargo— pero en qué etapa está el trabajo de
   * una subtarea es exactamente la clase de cosa que hay que poder decir: es
   * la que se queda parada esperando a alguien.
   */
  onEtapa: (id: string, etapa: Etapa | null) => void;
  /**
   * Cambiarle el nombre a una tarea.
   *
   * **Una hija también se renombra**, por lo mismo que se le marca la etapa: su
   * título lo escribió el encargo que la despachó y corregirlo no la saca de su
   * árbol. Lo que no se le ofrece es mover, que sí lo rompería.
   */
  onRenombrar: (id: string, title: string) => void;
  /** Se conecta cuando el backend ofrece la guarda persistente. */
  onPin?: (id: string, pinned: boolean) => void | Promise<void>;
  /** Los espacios a los que puede irse una tarea raíz. Con una sola no se ofrece. */
  spaces?: { id: string; name: string }[];
  /** El nombre de la carpeta, que no cambia al moverla de espacio. */
  carpeta?: string;
  onMoveToSpace?: (id: string, space: string) => void;
  /** Traer a la máquina de la ventana el trabajo de una tarea que corre en otra. */
  onBringHere?: (id: string) => void;
  /** Con tareas de varias carpetas en la misma lista, la de cada fila. Sin esto es `de`. */
  projectOf?: (row: SessionRow) => string;
  destinosDe?: (row: SessionRow) => { id: string; name: string }[];
  carpetaDe?: (row: SessionRow) => string | undefined;
  /** Bajo la cabecera de su carpeta, la fila no repite la carpeta. */
  hideFolder?: boolean;
  /** Bajo su cabecera de máquina, se omite la sección completa. */
  hideMachine?: boolean;
  /** El riel mantiene los intereses Git por carpeta antes de repartir sus grupos. */
  gitManaged?: boolean;
  /**
   * La tarjeta del riel fuera del riel (las delegadas): su fila y su tarjeta
   * flotante, sin lo que el riel hace con la lista.
   */
  card?: boolean;
  /** Hacia dónde sale la tarjeta flotante; el riel la saca a la derecha. */
  hoverCardPlacement?: "left-start" | "right-start";
  folderGroup?: string;
};
