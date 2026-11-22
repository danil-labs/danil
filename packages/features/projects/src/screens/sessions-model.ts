import { df } from "../../../../../apps/desktop/src/lib/format";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import type { Etapa } from "./TaskStage";

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

import type { SessionRow } from "../../../../ui/src/lib/session-row.ts"; export type { SessionRow };

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
