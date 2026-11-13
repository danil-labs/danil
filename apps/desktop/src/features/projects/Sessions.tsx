import { invoke } from "../../lib/invoke.ts";
import ChevronRight from "lucide-solid/icons/chevron-right";
import MoreVertical from "lucide-solid/icons/more-vertical";
import Pin from "lucide-solid/icons/pin";
import PinOff from "lucide-solid/icons/pin-off";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import { createEffect, createMemo, createSignal, For, type JSX, lazy, mapArray, on, onCleanup, Show, Suspense } from "solid-js";
import { Dynamic } from "solid-js/web";
import { arrastrar, fueArrastre, tareaEnVuelo } from "../../lib/drag";
import { enfocarYSeleccionar } from "../../lib/focus";
import { df } from "../../lib/format";
import { t } from "../../lib/i18n";
import { createPref } from "../../lib/prefs";
import { SESSION_TITLE_MAX_LENGTH } from "../../lib/projectNames";
import { esProvisional } from "../../lib/taskDraft";
import { cn } from "../../lib/utils";
import { Button } from "../../ui/Button";
import { asFailure, type Failure, FailureNote } from "../../ui/Failure";
import { celebrateFinishedTask, FinishTaskButton } from "../../ui/FinishTaskButton";
import { KeyedList } from "../../ui/KeyedList";
import { Input } from "../../ui/Input";
import { Toast, ToastPortal } from "../../ui/Toast";
import { MarcaAgente } from "../../ui/icons";
import {
  ITEM_DE_MENU,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../ui/Popover";
import { WithMentions } from "../chat/WithMentions";
import FolderChip from "./FolderChip";
import { gitAppearance, RailPull, sessionGitDescription } from "./SessionGit";
import { WithTaskHoverCard } from "./TaskHoverCardTrigger";
import { MachineChip } from "../machines/MachineChip";
import { bringHereLabel, canBringHere, machines } from "../machines/store";
import { createTaskHistories } from "./taskHistories";

// Solo hace falta cuando algo estorba al terminar o archivar: fuera de la carga inicial.
const TaskBlockersDialog = lazy(() => import("./TaskBlockersDialog"));
import { AstroAvatar } from "./AstroAvatar";
import { displayName, watchProfiles } from "./profiles";
import EtapaDeTarea, { ETAPAS, type Etapa } from "./TaskStage";
import EstadoDeTarea from "./TaskStatus";
import { matchesTaskQuery } from "./taskSearch";
import { canFinishTask, effectiveTaskGit, type GitStatus, sharesTaskGit, watchSessionGit } from "./taskGit";
import { authorKey, authorKeys, isSubtask } from "./taskAuthors";
import { descendientes, type Rama as RamaDeTareas, taskTree } from "./taskTree";
import { rolledOutcome, type TaskActivity, taskPriority } from "@terminus/design";
import { taskCard, buildTaskTree, taskIdentity, withTaskAncestors } from "@terminus/tasks";

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

type EstadoDelWorktree = { available: boolean; owned: boolean };

/**
 * Qué tareas padre están desplegadas, por id. Una rama nace plegada: las
 * subtareas se levantan solas mientras el turno corre, y desplegadas empujan
 * hacia abajo el resto del historial sin que nadie lo haya pedido. La fila de
 * resumen dice cuántas hay y es la que las abre.
 *
 * **Vive en el módulo y no dentro del componente**, al revés que los proyectos
 * plegados del riel. El motivo es que esta lista se monta varias veces a la vez
 * —una por proyecto en el riel, más la del proyecto abierto en el panel
 * principal— y las mismas tareas salen en dos de ellas. Con una señal por
 * instancia, plegar una tarea en el riel la dejaría desplegada en la vista del
 * proyecto hasta el siguiente arranque: dos listas de lo mismo diciendo cosas
 * distintas de la misma tarea. `chasis/Sidebar.tsx` no tiene ese problema
 * porque su lista de proyectos se pinta en un solo sitio.
 *
 * Se recuerda entre arranques: lo que alguien desplegó es lo que sí quiere ver,
 * y volver a abrirlo en cada arranque es trabajo que nadie pidió.
 */
const [desplegadas, setDesplegadas] = createPref<string[]>(
  "historial.subtareas.abiertas",
  [],
);

const alternarDesplegada = (id: string) =>
  setDesplegadas(
    desplegadas().includes(id)
      ? desplegadas().filter((x) => x !== id)
      : [...desplegadas(), id],
  );

/**
 * El historial del proyecto. `Nueva tarea` es una acción del sidebar, arriba de
 * la lista, y sobrevive al riel cuando la lista no.
 *
 * **En pantalla es «tarea» y en el código es `Session`**: quien usa la app pide
 * una tarea, y «sesión» nombra el mecanismo con que se cumple —un proceso de
 * agente que arranca, contesta y se reanuda—. Ver `workspace/sessions.rs`.
 *
 * **Las hijas van anidadas bajo su padre y no se mueven de proyecto.** Una tarea
 * hija es un encargo despachado por su padre (`workspace/orchestration.rs`) y la anidación
 * ES esa relación: moverla sola dejaría al padre apuntando a un id que ya no
 * está en su proyecto. Borrarse sí puede — un encargo fallido se limpia aquí.
 *
 * **Plegado dice qué esconde.** El chevron es el mismo control con que se pliega
 * un proyecto en el riel (`chasis/Sidebar.tsx`), y el hueco se reserva también
 * en las filas sin hijas para que los títulos no se desalineen. Una subtarea no
 * es una carpeta —puede estar parada esperando a una persona—, así que plegada
 * la fila lleva dos datos y ninguna glosa:
 *
 * - **Cuántas esconde**, en número. El plural lo declara el catálogo, nunca un
 *   ternario en el JSX, y el número se escribe con el locale del manifiesto
 *   (`lib/format.ts`): un `Intl` de nivel de módulo lo escribiría a la española
 *   bajo una interfaz en maya, sin dar error.
 * - **Si algo de dentro espera a alguien**, con el punto de `EstadoDeTarea` y su
 *   orden de urgencia: `aprobando` —la única que no avanza sin ti—, `vivas` y
 *   `esperando` (`sessions::sin_contestar`, el agente preguntó y nadie
 *   contestó).
 *
 * **El punto del padre no se toca al plegar**, y revertirlo no enseña el daño:
 * mezclarle el estado de sus hijas haría que la fila y su pestaña dijeran cosas
 * distintas de la misma tarea, y el orden de urgencia se tragaría la pregunta
 * sin contestar de una hija bajo un padre trabajando. Son dos puntos en dos
 * sitios: el de la tarea junto al título y el de lo plegado junto al número.
 *
 * **Renombrar no mueve nada** — la identidad es el id, que es la carpeta
 * (`sessions::rename_session`). Hay dos gestos porque ninguno basta solo: doble
 * clic en la fila, que no se encuentra sin probarlo y no se da con el teclado, y
 * «Cambiarle el nombre» en el menú, la única puerta para quien no usa ratón. El
 * campo sale en el sitio del título y relleno con el nombre de ahora: lo que se
 * corrige es lo que se lee en esa fila. **Salir del campo guarda; `Escape`
 * descarta** — un `onBlur` que cancela borra lo tecleado al ir a pulsar
 * cualquier otra cosa, sin decir nada.
 *
 * **Las acciones de la fila son un menú.** Dos íconos sueltos hacen que la fila
 * se lea como una barra de herramientas, y la cruz —el gesto irreversible— es la
 * más fácil de pulsar sin querer. Ningún disparador lleva `onClick` encima: la
 * prop propia pisaría el que `PopoverTrigger` pasa dentro de `p` y el panel no
 * abriría —Kobalte no compone manejadores, gana el último—, así que **quien no
 * deja pasar el clic a la fila es la fila**, que ignora lo que venga de su
 * columna de acciones. Lo comprueba `tests/unit/triggers.test.mjs`.
 */
export default function Sessions(props: {
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
  /** `members` is the task plus the subtasks the confirmation announced. */
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
}) {
  /** Fila de dos líneas con tarjeta flotante: el riel y quien la pide. */
  const tarjetaDelRiel = () => !!props.sidebar || !!props.card;
  const projectOf = (row: SessionRow) => props.projectOf?.(row) ?? props.de;
  const projectOfId = (id: string) => {
    const row = props.sessions.find((s) => s.id === id);
    return row ? projectOf(row) : props.de;
  };
  /** La cabecera que lleva una orden a la máquina de una tarea de otra máquina. */
  const enSuMaquina = (id: string) => {
    const machine = props.sessions.find((s) => s.id === id)?.machine;
    return machine ? { headers: { "x-terminus-machine": machine } } : undefined;
  };
  /** Una tarea de otra máquina que está apagada: lo que se le pide lo guarda el relay. */
  const apagada = (id: string) => {
    const row = props.sessions.find((s) => s.id === id);
    return !!row?.machine && row.machine_on === false;
  };
  const avisarCambio = (project: string) =>
    window.dispatchEvent(new CustomEvent("harness:tasks-changed", { detail: { project } }));
  const otherSpaces = (row: SessionRow) =>
    row.chat_de_agente || row.agent_thread || row.inbox
      ? []
      : (props.spaces ?? []).filter((i) => i.id !== row.space);
  const [finishing, setFinishing] = createSignal<string[]>([]);
  const [archiving, setArchiving] = createSignal<string[]>([]);
  /**
   * Las que se acaban de archivar o finalizar y la lista todavía no trae
   * archivadas: salen de la barra en el mismo gesto, no cuando vuelve el motor
   * (que mata turnos y toma los candados de la familia) y la relectura. Si el
   * motor lo rechaza, vuelven. Se sueltan solas cuando la fila llega archivada.
   */
  const [saliendo, setSaliendo] = createSignal<ReadonlySet<string>>(new Set());
  const sacar = (id: string) => setSaliendo((ids) => new Set(ids).add(id));
  const devolver = (id: string) => setSaliendo((ids) => {
    if (!ids.has(id)) return ids;
    const next = new Set(ids);
    next.delete(id);
    return next;
  });
  createEffect(() => {
    const ids = saliendo();
    if (ids.size === 0) return;
    const filas = new Map(props.sessions.map((s) => [s.id, s]));
    const quedan = [...ids].filter((id) => filas.has(id) && !filas.get(id)?.archived);
    if (quedan.length !== ids.size) setSaliendo(new Set(quedan));
  });
  const [actionFailure, setActionFailure] = createSignal<Failure | null>(null);
  const [aviso, setAviso] = createSignal<Aviso | null>(null);
  const finishTask = async (id: string, rect: DOMRect) => {
    if (finishing().includes(id)) return;
    setFinishing(ids => [...ids, id]);
    setActionFailure(null);
    try {
      const project = projectOfId(id);
      sacar(id);
      // La fila sale y el cohete despega en el mismo gesto: esperar a que el
      // motor mate turnos y tome los candados deja el estallido solo.
      celebrateFinishedTask(rect);
      await invoke("finish_task", { project, id }, enSuMaquina(id));
      // `anunciar` no actualiza esta ventana: su firma es la de quien
      // escribió, y el sondeo la descarta. Sin este aviso el archivado
      // queda en disco y la lista de aquí sigue mostrando la fila.
      avisarCambio(project);
    } catch (error) {
      devolver(id);
      setActionFailure(asFailure(error));
    } finally {
      setFinishing(ids => ids.filter(value => value !== id));
    }
  };
  const archiveTask = async (id: string) => {
    if (archiving().includes(id)) return;
    setArchiving(ids => [...ids, id]);
    setActionFailure(null);
    try {
      const project = projectOfId(id);
      sacar(id);
      setMenu(null);
      await invoke("set_task_archived", { project, id, archived: true }, enSuMaquina(id));
      avisarCambio(project);
    } catch (error) {
      devolver(id);
      setActionFailure(asFailure(error));
    } finally {
      setArchiving(ids => ids.filter(value => value !== id));
    }
  };
  // `finish_task` y `set_task_archived` matan los turnos y toman los candados
  // de la familia antes de mirar el árbol: sin esta pregunta previa la espera
  // es real y el error llega al final, sin salida.
  const intentar = async (id: string, finish: boolean, rect?: DOMRect) => {
    const marcar = finish ? setFinishing : setArchiving;
    if ((finish ? finishing() : archiving()).includes(id)) return;
    // Apagada no hay turnos que matar ni árbol que mirar: archivar se aplaza
    // (el relay lo aplica al conectarse) y no se enciende solo para preguntar.
    if (!finish && apagada(id)) {
      await archiveTask(id);
      return;
    }
    marcar(ids => [...ids, id]);
    setActionFailure(null);
    // La pregunta es corta; la fila se queda con la llama encendida mientras
    // vuelve. Sacarla antes obligaría a devolverla, y el cohete despegaría por
    // una tarea que todavía tiene algo en el camino.
    let blockers: Blockers;
    try {
      blockers = await invoke<Blockers>("task_blockers", { project: projectOfId(id), id, finish }, enSuMaquina(id));
    } catch (error) {
      setActionFailure(asFailure(error));
      return;
    } finally {
      marcar(ids => ids.filter(value => value !== id));
    }
    if (blockers.unsaved.length === 0 && !blockers.not_finished) {
      await (finish && rect ? finishTask(id, rect) : archiveTask(id));
      return;
    }
    setAviso({ id, finish, rect, blockers });
  };
  const descartarYSeguir = async () => {
    const a = aviso();
    if (!a) return;
    setAviso(null);
    const marcar = a.finish ? setFinishing : setArchiving;
    marcar(ids => [...ids, a.id]);
    try {
      for (const work of a.blockers.unsaved) {
        await invoke("discard_task_changes", { project: work.project ?? projectOfId(a.id), id: work.session, files: work.files }, enSuMaquina(a.id));
      }
    } catch (error) {
      setActionFailure(asFailure(error));
      return;
    } finally {
      marcar(ids => ids.filter(value => value !== a.id));
    }
    // Se vuelve a mirar: lo que apareció mientras el aviso estaba abierto se
    // queda en disco, y tiene que verse en el aviso y no en un error plegado.
    // La fila sigue ahí: el cohete sale del botón de ahora y no de donde
    // estaba cuando se abrió el aviso.
    const boton = document.querySelector<HTMLElement>(`[data-sesion="${a.id}"] [data-session-finish]`);
    await intentar(a.id, a.finish, boton?.getBoundingClientRect() ?? a.rect);
  };
  // La barra enseña solo lo vivo: las archivadas no se pintan ni se observan. Con
  // cientos archivadas, pedir su git y su historial en cada barrido trababa la ventana.
  // En la barra no se anidan subtareas: se consultan desde la vista de subtareas
  // del chat. Solo asoman, sueltas, al buscar o si las fijaron.
  const enBarra = createMemo(() => props.sessions.filter(s => (props.includeArchived || (!s.archived && !saliendo().has(s.id)))
    && (!props.sidebar || !!props.search?.trim() || s.pinned || !isSubtask(s))));
  // Un observador de git, de perfiles y de historiales por carpeta de la
  // lista: las cachés son por carpeta y se comparten con las demás vistas.
  const carpetasVistas = createMemo(
    () => props.projectOf ? [...new Set(enBarra().map(projectOf))].sort() : [props.de],
    [],
    { equals: (a, b) => a.length === b.length && a.every((x, i) => x === b[i]) },
  );
  const porCarpeta = createMemo(mapArray(carpetasVistas, (project) => {
    const filas = createMemo(() => props.projectOf ? enBarra().filter((s) => projectOf(s) === project) : enBarra());
    const watcher = watchSessionGit(project);
    const gitInput = createMemo(() => JSON.stringify([
      filas().map(s => [s.id, s.updated_at]), props.vivas, props.current,
    ]));
    createEffect(on(gitInput, () => {
      if (props.gitManaged) return;
      watcher.prioritize([...(props.current ? [props.current] : []), ...props.vivas, ...filas().map(s => s.id)]);
      watcher.refresh();
    }));
    onCleanup(watcher.release);
    const [historiales] = createTaskHistories<EstadoDelWorktree>(() => project, filas);
    return { git: watcher.rows, profiles: watchProfiles(project), historiales };
  }));
  // Con una sola carpeta se devuelve su registro tal cual: un objeto nuevo
  // repintaría todas las filas aunque git no hubiera cambiado.
  const gitRows = createMemo<Record<string, GitStatus>>(() => {
    const todas = porCarpeta();
    return todas.length === 1 ? todas[0].git() : Object.assign({}, ...todas.map((c) => c.git()));
  });
  // Borrar se lleva la carpeta de trabajo entera, y esos documentos no están
  // commiteados en ningún lado: no tienen de dónde volver. Por eso la
  // confirmación vive en la propia fila, con lo que se pierde escrito.
  const [confirmando, setConfirmando] = createSignal<string | null>(null);
  // Deleting a native child takes only that task, and the engine leaves pinned descendants out with their subtree.
  const subtasksOf = (row: SessionRow) => {
    if (row.parent) return 0;
    const count = (branch: RamaDeTareas<SessionRow>): number => branch.hijas.filter(h => !fijada(h.tarea)).reduce((n, h) => n + 1 + count(h), 0);
    const find = (branches: RamaDeTareas<SessionRow>[]): RamaDeTareas<SessionRow> | undefined => {
      for (const branch of branches) {
        if (taskIdentity(branch.tarea) === taskIdentity(row)) return branch;
        const inner = find(branch.hijas);
        if (inner) return inner;
      }
    };
    const branch = find(taskTree(props.relatedSessions ?? props.sessions, false));
    return branch ? count(branch) : 0;
  };
  // El menú va por portal: escapa del recorte deliberado del sidebar, y con
  // veinte proyectos la lista de destinos no desplaza lo que hay debajo.
  const [menu, setMenu] = createSignal<string | null>(null);
  // Qué tarea se está renombrando, y con qué borrador. **El campo sustituye al
  // título en su propia fila** en vez de abrir un diálogo: lo que se está
  // corrigiendo es lo que se lee ahí, y sacarlo a una hoja aparte lo separa de
  // las filas de al lado, que son con las que uno lo distingue.
  const [renombrando, setRenombrando] = createSignal<string | null>(null);
  const [borrador, setBorrador] = createSignal("");

  const empezarARenombrar = (s: SessionRow) => {
    setMenu(null);
    setConfirmando(null);
    setBorrador(s.title);
    setRenombrando(s.id);
  };

  /**
   * El árbol: las raíces en el orden que ya traen —las más nuevas primero, por
   * cuándo nacieron— y las hijas de cada una anidadas debajo.
   *
   * **El orden lo fija `sessions::list_live_sessions` y aquí no se toca.** Iba por
   * última actividad, y eso hacía que una tarea saltara de sitio cada vez que
   * su agente escribía un delta —la suya o la de cualquier otra que estuviera
   * contestando—: la lista se barajaba bajo el puntero. Qué está pasando ahora
   * lo dice `EstadoDeTarea`, que no mueve ninguna fila.
   *
   * Activas y archivadas se arman cada una por el `archived` de la fila, no
   * por el de su raíz: finalizar una hija no espera al padre.
   */
  const profiles = createMemo<ReturnType<ReturnType<typeof watchProfiles>>>(() => {
    const todas = porCarpeta();
    return todas.length === 1 ? todas[0].profiles() : Object.assign({}, ...todas.map((c) => c.profiles()));
  });
  const query = createMemo(() => (props.search ?? "").trim());
  const matchedSessions = createMemo(() => enBarra().filter(session => {
    if (props.matchingIds && !props.matchingIds.includes(taskIdentity(session))) return false;
    if (!query()) return true;
    const git = effectiveTaskGit(session, gitRows(), props.relatedSessions ?? props.sessions);
    const agente = session.agent ? displayName(session.agent, profiles()[session.agent]) : null;
    return matchesTaskQuery([session.title, session.last_message, git?.branch, git?.alias, agente, props.carpetaDe?.(session)], query());
  }));
  const filteredSessions = createMemo(() => props.sidebar ? matchedSessions() : withTaskAncestors(enBarra(), matchedSessions()));
  const matchIds = createMemo(() => new Set(matchedSessions().map(taskIdentity)));
  const contextual = (row: SessionRow) => !matchIds().has(taskIdentity(row));
  const [expansionOverrides, setExpansionOverrides] = createSignal<Record<string, boolean>>({});
  const expansionContext = createMemo(() => JSON.stringify([
    query(), props.matchingIds ? [...props.matchingIds].sort() : null, props.current,
    enBarra().filter(row => row.pinned).map(taskIdentity).sort(),
  ]));
  createEffect(on(expansionContext, () => setExpansionOverrides({})));
  const temporaryExpansion = createMemo(() => {
    const targets = query() || props.matchingIds ? matchedSessions() : enBarra().filter(row => row.pinned || row.id === props.current);
    const ancestors = new Set<string>();
    const visit = (branches: RamaDeTareas<SessionRow>[]) => {
      for (const branch of branches) {
        if (branch.hijas.length) ancestors.add(taskIdentity(branch.tarea));
        visit(branch.hijas);
      }
    };
    visit(buildTaskTree(withTaskAncestors(enBarra(), targets)));
    return ancestors;
  });
  if (props.onSearchResults) {
    createEffect(() => props.onSearchResults?.(matchedSessions().length));
    onCleanup(() => props.onSearchResults?.(0));
  }
  const activas = createMemo<RamaDeTareas<SessionRow>[]>((previas) => props.flat || props.sidebar
    ? filteredSessions().map(tarea => ({ tarea, hijas: [] }))
    : taskTree(filteredSessions(), props.includeArchived ? null : false, previas, props.groupByHandler === true));
  const hayMaquinas = createMemo(() => machines().length > 1);
  const hideFolder = (row: SessionRow) => props.hideFolder && (props.folderGroup === undefined || projectOf(row) === props.folderGroup);
  const destinosDe = (row: SessionRow) => props.destinosDe?.(row) ?? props.destinos;
  const fijada = (row: SessionRow) => row.pinned ?? (row.chat_de_agente || row.inbox === true);
  const setPinned = async (row: SessionRow) => {
    if (!props.onPin) return;
    setMenu(null);
    setActionFailure(null);
    try {
      await props.onPin(row.id, !fijada(row));
      avisarCambio(projectOf(row));
    } catch (error) {
      setActionFailure(asFailure(error));
    }
  };

  /**
   * Una fila del historial, y **nada más que la fila**.
   *
   * No conoce a sus hijas: el expansor es la fila de resumen que dibuja el
   * árbol, así que aquí no hace falta saber si esta tarea tiene encargos — y una
   * fila que no las conoce no puede volver a reservarles sitio.
   */
  const gitDe = (row: SessionRow) => effectiveTaskGit(row, gitRows(), props.relatedSessions ?? props.sessions);

  /** La tarjeta compartida mide 52 px; estado, menú y hora comparten la columna derecha. */
  const FilaDelRiel = (r: {
    s: SessionRow;
    actividad: TaskActivity;
    titulo: JSX.Element;
    /** Terminada y vista: la fila se apaga y vuelve a su color al pasar el puntero. */
    apagada: boolean;
    /** Si el hueco del estado puede pasar a ser el menú: no renombrando ni en solo lectura. */
    conMenu: boolean;
    menu: () => JSX.Element;
    cohete: () => JSX.Element;
  }) => {
    // Qué lleva la línea 2 lo decide la tarjeta compartida con el teléfono (`@terminus/tasks`).
    const tarjeta = () => taskCard(r.s, { live: props.vivas, approving: props.aprobando, hideFolder: hideFolder(r.s), hideMachine: props.hideMachine });
    const activeAgent = () => r.s.agent;
    const git = () => gitDe(r.s);
    // La rama de quien comparte el árbol de su padre se dice en la fila del padre.
    const propioDeOtra = () => !!git().shared_with || sharesTaskGit(r.s, gitRows(), props.relatedSessions ?? props.sessions);
    const nombre = (agente: string) => displayName(agente, profiles()[agente]);
    // Con un motor que no manda `last_turn_at`, la última vez que se movió.
    const cuando = () => r.s.last_turn_at ?? r.s.updated_at;
    // Memo: al hacer clic el menú se reinicia y, sin él, la ranura reescribe su clase.
    const abierto = createMemo(() => menu() === r.s.id);
    // La sección dice kn, el PR o, sin PR, el nombre de la rama.
    const conPr = () => (git().kind === "branch" || git().kind === "detached") && !!git().pull_known && !!git().pull;
    const conGit = () => !propioDeOtra() && (git().kind === "kn" || git().kind === "branch" || conPr());
    const gitStyle = () => {
      const appearance = gitAppearance(git());
      return git().stale ? { ...appearance, color: "text-neutral-500" } : appearance;
    };
    return <div class={cn("task-card-lines", r.conMenu && "task-card-with-menu")} data-menu-open={abierto() ? "" : undefined}>
      <div class="task-card-main">
        <div class="task-card-title flex h-[22px] min-w-0 items-center gap-1.5">
          <Show when={activeAgent()}>
            {(agent) => (
              <span class="task-card-face" data-session-agent title={nombre(agent())} aria-label={nombre(agent())}>
                <AstroAvatar name={agent()} status="awake" body={profiles()[agent()]?.body} avatar={profiles()[agent()]?.avatar} size={16} />
              </span>
            )}
          </Show>
          <div class="min-w-0 flex-1">{r.titulo}</div>
          <Show when={!tarjetaDelRiel()}><EtapaDeTarea etapa={r.s.stage} /></Show>
        </div>
        <div data-session-preview data-no-folder={hideFolder(r.s) ? "" : undefined} data-no-machine={hayMaquinas() ? undefined : ""} class={cn("task-card-metadata text-xs font-normal leading-4 text-neutral-500", activeAgent() && "task-card-has-agent", r.apagada && "opacity-80 group-hover/session:opacity-100")}>
          <span data-session-provider class="task-card-provider" title={tarjeta().provider ?? r.s.provider} aria-label={tarjeta().provider ?? r.s.provider}><MarcaAgente id={r.s.provider} size={13} /></span>
          <Show when={!hideFolder(r.s)}>
            <span class="task-card-slot">
              <Show when={props.carpetaDe?.(r.s)}>{folder =>
                <FolderChip id={projectOf(r.s)} name={folder()} untitled={tarjetaDelRiel()} class="min-w-0 text-xs text-neutral-500" />
              }</Show>
            </span>
          </Show>
          <Show when={hayMaquinas()}>
            <span class="task-card-slot">
              <MachineChip machine={r.s.machine || machines().find((machine) => machine.local)?.id || "local"} on={r.s.machine_on !== false} class="min-w-0" />
            </span>
          </Show>
          <span class="task-card-git">
            <Show when={conGit()}><Show when={git().kind === "kn" || !conPr()} fallback={<RailPull status={git()} />}>
                <span data-session-pr class={cn("inline-flex min-w-0 items-center gap-1", gitStyle().color)} title={sessionGitDescription(git())} aria-label={sessionGitDescription(git())}><Dynamic component={gitStyle().icon} size={12} aria-hidden="true" /><Show when={git().kind === "branch"}><span class="min-w-0 truncate">{git().branch}</span></Show></span>
              </Show></Show>
            <span class="task-card-tail">
              <Show when={r.s.deferred}><span data-deferred class="shrink-0 text-neutral-500" title={t("projects.sessions.deferred")} aria-label={t("projects.sessions.deferred")}>⧗</span></Show>
              <span class="task-card-rocket">{r.cohete()}</span>
            </span>
          </span>
        </div>
      </div>
      {/* La hora y el ⋯ (y, con ellos, el loader y el punto) en una caja
          pegada al padding derecho. El loader no se mueve aunque la hora sea
          más ancha, y el ⋯ se centra sobre él. */}
      <div class="task-card-end">
        <div class="task-card-end-mark">
          <span data-session-status class="task-card-mark">
            <EstadoDeTarea {...r.actividad}
              tarjeta
              provisional={esProvisional(r.s.id)} archivada={!!r.s.archived} />
          </span>
          <Show when={r.conMenu}><span data-session-actions class={cn("absolute inset-y-0 left-1/2 z-10 hidden w-[22px] -translate-x-1/2 items-center justify-center group-hover/session:inline-flex group-focus-within/session:inline-flex", abierto() && "inline-flex")} data-abierto={abierto() ? "true" : undefined}>{r.menu()}</span></Show>
        </div>
        <span data-session-time class="task-card-time text-[0.71875rem] tabular-nums">{shortTaskTime(cuando())}</span>
      </div>
    </div>;
  };

  /** En el riel y en las delegadas la fila lleva su tarjeta flotante; en las demás listas, no. */
  const ConTarjeta = (c: { s: SessionRow; children: JSX.Element }) => (
    <Show when={tarjetaDelRiel()} fallback={c.children}>
      <WithTaskHoverCard
        task={c.s}
        placement={props.hoverCardPlacement}
        folderName={props.carpetaDe?.(c.s)}
        folderId={projectOf(c.s) || undefined}
        git={gitDe(c.s)}
        agentProfile={c.s.agent ? profiles()[c.s.agent] : undefined}
        agentStatus={props.vivas.includes(c.s.id) ? "working" : undefined}
        disabled={props.readOnly || renombrando() === c.s.id || menu() === c.s.id || !!tareaEnVuelo()}
        onOpen={() => props.onPick(c.s.id)}
        onPin={() => void setPinned(c.s)}
        onArchive={() => void intentar(c.s.id, false)}
      >
        {c.children}
      </WithTaskHoverCard>
    </Show>
  );

  const Fila = (f: { s: SessionRow }) => {
    // En la barra el coordinador lleva también la actividad de sus subtareas, que no se pintan ahí.
    const activity = (): TaskActivity => (props.sidebar ? f.s.delegated_activity : undefined) ?? ({
      aprobando: props.aprobando.includes(f.s.id),
      viva: props.vivas.includes(f.s.id),
      esperando: f.s.esperando,
      outcome: f.s.outcome,
      sinVer: f.s.sin_ver,
    });
    // Agrupando por agente la cabecera ya lo dice; en el chat del agente, también.
    const title = () => f.s.inbox ? t("projects.threads.inbox")
      : f.s.chat_de_agente && !f.s.agent_thread ? t("projects.threads.persistent_chat")
      : f.s.command_title ? t("projects.threads.command")
      : f.s.title;
    /**
     * Cierra el renombrado guardando lo escrito.
     *
     * **Salir del campo guarda, no cancela.** Un campo en línea sin botón de
     * guardar cuyo `onBlur` descarta borra lo tecleado al ir a pulsar cualquier
     * otra cosa, sin decir nada. Descartar tiene su gesto, y es `Escape`.
     *
     * Un nombre en blanco no borra el que había: el vacío no es un nombre, y
     * Rust lo rechaza igual (`sessions::titulo_de_tarea`).
     */
    const guardarNombre = () => {
      if (renombrando() !== f.s.id) return;
      const n = borrador().trim();
      setRenombrando(null);
      if (n && n !== f.s.title) props.onRenombrar(f.s.id, n);
    };

    /** `missing_source` no se marca: borrar la fuente de una receptora fijada es legítimo. */
    const handoffRoto = () => f.s.handoff_issue === "contradictory" || f.s.handoff_issue === "cycle";
    const marcaDeFijada = () => <span role="img" aria-label={t("projects.sessions.pinned")} title={t("projects.sessions.pinned")} class="shrink-0 text-neutral-500"><Pin size={12} /></span>;
    /**
     * Terminada y vista en la tarjeta del riel: sin marca, la fila se apaga
     * —el título en `neutral-700` y la segunda línea al 80 %— y recupera su color al
     * pasar el puntero.
     */
    const apagada = createMemo(() => tarjetaDelRiel() && !taskPriority(activity()) && !esProvisional(f.s.id));
    const conMenu = createMemo(() => !props.readOnly && renombrando() !== f.s.id && (props.draggedTask ?? tareaEnVuelo()?.id) !== f.s.id);
    // Sin memo, el clic (que pasa por «en vuelo») reescribe las clases con el mismo valor: tests/perf/open-task-cost.mjs.
    /** El título, o el campo que lo renombra en su sitio y con su misma medida. */
    const Titulo = () => (
      <>
      {/* El campo debe conservar la altura y tipografía del título para no desplazar el historial al editar. */}
      <Show
        when={renombrando() === f.s.id}
        fallback={
          // El cohete es absoluto: sin este hueco el título se mete debajo. Por
          // `:has`, no por clase reactiva: cada fila mutaría al llegar git.
          <div class={cn(
            "flex min-w-0 items-center gap-1 text-ui leading-[1.35]",
            // La tarjeta del riel: 13,5 px en su línea de 18, sin chincheta ni «Contexto».
            tarjetaDelRiel() && "text-[0.84375rem] leading-[18px]",
            apagada() && "text-neutral-700 group-hover/session:text-neutral-950",
          )}>
            <Show when={fijada(f.s) && !tarjetaDelRiel()}>{marcaDeFijada()}</Show>
            <Show when={handoffRoto()}><span role="img" aria-label={t("projects.sessions.handoff_issue")} title={t("projects.sessions.handoff_issue")} class="shrink-0 text-warning-strong"><TriangleAlert size={12} /></span></Show>
            <Show when={contextual(f.s) && !tarjetaDelRiel()}><span class="shrink-0 text-caption font-normal text-neutral-500">{t("projects.sessions.context")}</span></Show>
            <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"><WithMentions>{f.s.subagent ? readableSessionTitle(title()) : title()}</WithMentions></span>
          </div>
        }
      >
        <form
          data-session-rename
          class="min-w-0"
          onSubmit={(e) => {
            e.preventDefault();
            guardarNombre();
          }}
        >
          <Input
            ref={enfocarYSeleccionar}
            variant="ghost"
            // `font-sans` conserva la letra del título, y
            // `p-0`/`min-h-0` devuelve su altura: 13 px por 1,35, los
            // mismos que el título. El peso lo hereda, para que
            // la tarea abierta siga en negrita mientras se renombra.
            class="block h-auto min-h-0 rounded-none border-0 p-0 font-sans text-ui leading-[1.35] text-inherit [font-weight:inherit]"
            maxlength={SESSION_TITLE_MAX_LENGTH}
            value={borrador()}
            aria-label={t("projects.sessions.rename_label", {
              title: f.s.title,
            })}
            onInput={(e) => setBorrador(e.currentTarget.value)}
            onBlur={guardarNombre}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setRenombrando(null);
              }
            }}
          />
        </form>
      </Show>
      </>
    );
    /** El cohete es el único de los dos controles que ocupa sitio en la fila. */
    const puedeFinalizar = () =>
      !props.readOnly && !fijada(f.s) && canFinishTask(
        f.s,
        effectiveTaskGit(f.s, gitRows(), props.relatedSessions ?? props.sessions),
        props.vivas.includes(f.s.id) || props.aprobando.includes(f.s.id),
      );

    /**
     * El menú de acciones de la fila. En la tarjeta del riel su disparador es
     * el hueco del estado y empieza por fijar; en las demás listas vive en la
     * capa de acciones, con la etapa.
     */
    const Menu = (m: { riel: boolean }) => (
      <Popover
        open={menu() === f.s.id}
        onOpenChange={(abierto) => {
          setMenu(abierto ? f.s.id : null);
          if (!abierto) setConfirmando(null);
        }}
        placement="right-start"
        gutter={6}
      >
        {/* Sin `onClick` propio: ver la cabecera del módulo. */}
        <PopoverTrigger
          as={(p: object) => (
            <button
              {...p}
              class={m.riel
                ? cn(
                    "task-card-mark rounded-[5px] border-0 bg-transparent p-0 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-primary",
                    menu() === f.s.id && "bg-neutral-200 text-neutral-950",
                  )
                : "grid place-items-center rounded-sm border-0 bg-transparent px-1 py-0.5 leading-[1.3] text-neutral-500 hover:bg-neutral-200 hover:text-neutral-950"}
              aria-label={t("projects.sessions.actions_named", {
                title: f.s.title,
              })}
              aria-haspopup="menu"
              title={t("projects.sessions.actions")}
            >
              <MoreVertical size={m.riel ? 14 : 15} />
            </button>
          )}
        />
        <PopoverContent
          role={confirmando() === f.s.id ? "alertdialog" : "menu"}
          aria-label={confirmando() === f.s.id ? t("projects.sessions.delete") : undefined}
          class={confirmando() === f.s.id ? "w-72 p-3" : "max-h-72 w-56 overflow-y-auto p-1"}
        >
          <Show when={confirmando() === f.s.id} fallback={<>
              {/* En la tarjeta del riel fijar va primero: el alfiler ya no
                  tiene botón propio en la fila. */}
              <Show when={props.onPin}>
                <button
                  role="menuitem"
                  data-session-pin
                  aria-label={fijada(f.s) ? t("projects.sessions.unpin_named", { title: f.s.title }) : t("projects.sessions.pin_named", { title: f.s.title })}
                  class={`${ITEM_DE_MENU} flex items-center gap-2 font-semibold`}
                  onClick={() => void setPinned(f.s)}
                >
                  <Show when={fijada(f.s)} fallback={<Pin size={14} class="shrink-0 text-neutral-500" aria-hidden="true" />}>
                    <PinOff size={14} class="shrink-0 text-neutral-500" aria-hidden="true" />
                  </Show>
                  {fijada(f.s) ? t("projects.sessions.unpin") : t("projects.sessions.pin")}
                </button>
                <span class="my-1 block h-px bg-border" />
              </Show>
              {/* La etapa no se marca desde la tarjeta del riel, que no la enseña. */}
              <Show when={!m.riel}>
              <Popover placement="right-start" gutter={6}>
                <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                  <PopoverTrigger as={(trigger: object) => (
                    <button {...trigger} role="menuitem" aria-haspopup="menu" class={`${ITEM_DE_MENU} flex items-center justify-between gap-2`}>
                      {t("projects.sessions.stage")}<ChevronRight size={14} />
                    </button>
                  )} />
                </div>
                <PopoverContent role="menu" class="w-56 p-1">
                  <For each={ETAPAS}>
                    {(e) => (
                      <button
                        role="menuitemradio"
                        aria-checked={f.s.stage === e.id}
                        class={cn(
                          ITEM_DE_MENU,
                          "truncate",
                          f.s.stage === e.id && "font-semibold",
                        )}
                        onClick={() => {
                          setMenu(null);
                          props.onEtapa(f.s.id, e.id);
                        }}
                      >
                        {e.rotulo()}
                      </button>
                    )}
                  </For>
                  <button
                    role="menuitemradio"
                    aria-checked={!f.s.stage}
                    class={cn(
                      ITEM_DE_MENU,
                      "truncate",
                      !f.s.stage && "font-semibold",
                    )}
                    onClick={() => {
                      setMenu(null);
                      props.onEtapa(f.s.id, null);
                    }}
                  >
                    {t("projects.stage.none")}
                  </button>
                </PopoverContent>
              </Popover>
              <span class="my-1 block h-px bg-border" />
              </Show>

              {/* Renombrar está escrito, y el doble clic es el atajo.
                El gesto de la fila no lo encuentra quien no lo prueba, y
                con el teclado no se da: si la única forma de cambiarle el
                nombre a una tarea fuera un doble clic, para media pantalla
                no existiría. */}
              <button
                role="menuitem"
                class={ITEM_DE_MENU}
                onClick={() => empezarARenombrar(f.s)}
              >
                {t("projects.sessions.rename")}
              </button>
              <span class="my-1 block h-px bg-border" />

              <Show when={!f.s.parent && destinosDe(f.s).length > 0}>
                <Popover placement="right-start" gutter={6}>
                  <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                    <PopoverTrigger as={(trigger: object) => (
                      <button {...trigger} role="menuitem" aria-haspopup="menu" class={`${ITEM_DE_MENU} flex items-center justify-between gap-2`}>
                        {t("projects.sessions.move_to")}<ChevronRight size={14} />
                      </button>
                    )} />
                  </div>
                  <PopoverContent role="menu" class="max-h-72 w-56 overflow-y-auto p-1">
                    <For each={destinosDe(f.s)}>
                      {(d) => (
                        <button
                          role="menuitem"
                          class={`${ITEM_DE_MENU} truncate`}
                          onClick={() => {
                            setMenu(null);
                            props.onMove(f.s.id, d.id);
                          }}
                        >
                          {d.name}
                        </button>
                      )}
                    </For>
                  </PopoverContent>
                </Popover>
                <span class="my-1 block h-px bg-border" />
              </Show>

              <Show when={!f.s.parent && !f.s.archived && otherSpaces(f.s).length > 0}>
                <Popover placement="right-start" gutter={6}>
                  <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                    <PopoverTrigger as={(trigger: object) => (
                      <button {...trigger} role="menuitem" aria-haspopup="menu" data-move-space={f.s.id} class={`${ITEM_DE_MENU} flex items-center justify-between gap-2`}>
                        {t("spaces.move.to")}<ChevronRight size={14} />
                      </button>
                    )} />
                  </div>
                  <PopoverContent role="menu" aria-label={t("spaces.move.to")} class="max-h-72 w-60 overflow-y-auto p-1">
                    <For each={otherSpaces(f.s)}>
                      {(d) => (
                        <button
                          role="menuitem"
                          class={`${ITEM_DE_MENU} truncate`}
                          onClick={() => {
                            setMenu(null);
                            props.onMoveToSpace?.(f.s.id, d.id);
                          }}
                        >
                          {d.name}
                        </button>
                      )}
                    </For>
                    <Show when={props.carpetaDe?.(f.s) ?? props.carpeta}>
                      {(c) => <p class="m-0 px-2 pt-1 pb-1.5 text-caption text-neutral-500">{t("spaces.move.folder_stays", { folder: c() })}</p>}
                    </Show>
                  </PopoverContent>
                </Popover>
              </Show>

              <Show when={!f.s.parent && projectOf(f.s) !== ""}>
                <button
                  role="menuitem"
                  class={ITEM_DE_MENU}
                  onClick={() => {
                    setMenu(null);
                    props.onMove(f.s.id, "");
                  }}
                >
                  {t("projects.sessions.remove_from_project")}
                </button>
              </Show>

              <Show when={props.onBringHere && f.s.machine && canBringHere()}>
                <button
                  role="menuitem"
                  class={ITEM_DE_MENU}
                  data-bring-here-menu
                  onClick={() => {
                    setMenu(null);
                    props.onBringHere?.(f.s.id);
                  }}
                >
                  {bringHereLabel()}
                </button>
              </Show>

              <Show when={!f.s.archived && !fijada(f.s)}>
                <button
                  role="menuitem"
                  class={ITEM_DE_MENU}
                  disabled={archiving().includes(f.s.id)}
                  onClick={() => void intentar(f.s.id, false)}
                >
                  {t("projects.sessions.archive")}
                </button>
              </Show>
              <Show when={m.riel}><span class="my-1 block h-px bg-border" /></Show>
              <button
                role="menuitem"
                class={`${ITEM_DE_MENU} text-error-strong`}
                onClick={() => {
                  setConfirmando(f.s.id);
                }}
              >
                {t("projects.sessions.delete")}
              </button>
          </>}>
            <div
              data-session-confirm
              class="min-w-0"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setConfirmando(null); setMenu(null); }
              }}
            >
              <p class="m-0 mb-1.5 text-xs leading-[1.4] text-neutral-500">
                {subtasksOf(f.s) > 0 ? t("projects.sessions.delete_confirm_family", { count: subtasksOf(f.s) }) : t("projects.sessions.delete_confirm")}
              </p>
              <div class="flex gap-1.5">
                <Button
                  variant="danger"
                  size="compact"
                  ref={(el: HTMLElement) =>
                    queueMicrotask(() => el.focus({ preventScroll: true }))
                  }
                  onClick={() => {
                    setConfirmando(null);
                    setMenu(null);
                    props.onDelete(f.s.id, 1 + subtasksOf(f.s));
                  }}
                >
                  {t("projects.sessions.delete")}
                </Button>
                <Button
                  variant="outline"
                  size="compact"
                  onClick={() => { setConfirmando(null); setMenu(null); }}
                >
                  {t("projects.sessions.keep")}
                </Button>
              </div>
            </div>
          </Show>
        </PopoverContent>
      </Popover>
    );

    return (
      <ConTarjeta s={f.s}>
        {/* `aria-current` además de la clase, y no es adorno: la fila
          abierta se marcaba solo con fondo y negrita, así que un
          lector de pantalla recorría veinte tareas sin saber cuál
          está abierta.

          **Sin `marca-seleccion`:** en una lista sangrada bajo su
          proyecto, la barra de acento morada compite con la propia
          sangría. El borde en `neutral-500` es lo que cumple los 3:1 que
          pide WCAG 2.2 § 1.4.11 —4,13:1 en claro y 4,53:1 en oscuro—; el
          fondo y la negrita solos no llegaban. */}
        <div
          data-sesion={f.s.id}
          data-pinned={fijada(f.s) ? "true" : undefined}
          data-apagada={apagada() ? "true" : undefined}
          class={tarjetaDelRiel() ? cn(
            // La tarjeta: 52 px fijos y dos líneas, pase lo que pase con los datos.
            "group/session relative flex h-[52px] min-w-0 cursor-pointer flex-col justify-center gap-[5px] rounded-[10px] border border-transparent py-[7px] pr-2.5 pl-2.5 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-primary",
            // Abierta: un tinte y un borde suave. Ni barra de color, ni negrita, ni sombra.
            f.s.id === props.current && "border-border bg-neutral-200 hover:bg-neutral-200",
            // Fijada: el borde lo dibuja `::after` para poder abrirle un hueco
            // arriba al centro, donde va el alfiler sin fondo; los 7 px de
            // arriba son los que el alfiler necesita para no recortarse.
            fijada(f.s) && "tarjeta-fijada mt-[7px] border-transparent",
            renombrando() === f.s.id && "bg-neutral-200 hover:bg-neutral-200",
            menu() === f.s.id && f.s.id !== props.current && "bg-neutral-100",
            (props.draggedTask ?? tareaEnVuelo()?.id) === f.s.id &&
              "border-neutral-500 bg-transparent opacity-45 [border-style:dashed] hover:bg-transparent",
          ) : cn(
            "group/session relative grid min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-0.5 rounded-sm border border-transparent py-1 pr-1 pl-2 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-primary",
            f.s.id === props.current &&
              "border-neutral-500 bg-neutral-200 font-semibold text-neutral-950 shadow-sm",
            fijada(f.s) && "tarjeta-fijada mt-[7px] rounded-[10px] border-transparent",
            renombrando() === f.s.id && "bg-neutral-200 hover:bg-neutral-200",
            // Con el menú abierto el puntero puede irse de la fila, y el velo
            // del menú se vería recortado sobre otro fondo.
            menu() === f.s.id && "bg-neutral-100",
            (props.draggedTask ?? tareaEnVuelo()?.id) === f.s.id &&
              "border-border bg-transparent opacity-40 [border-style:dashed]",
          )}
          aria-current={f.s.id === props.current ? "true" : undefined}
          role="link"
          tabIndex={0}
          onKeyDown={event => {
            if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
            event.preventDefault();
            props.onPick(f.s.id);
          }}
          // **Renombrando, la fila se rellena.** El campo perdió su borde y su
          // anillo para no cambiar de tamaño (ver el `Input` de abajo), así que
          // el estado se marca donde no cuesta píxeles: en el fondo de la fila,
          // que ya es la superficie con la que esta lista dice «esto es lo que
          // estás mirando». Con el caret y el nombre seleccionado dentro, es la
          // misma señal que da renombrar en el Finder.
          data-renombrando={renombrando() === f.s.id ? "true" : undefined}
          // **La fila que va en la mano se atenúa, y eso es lo que hace
          //  visible el gesto.** El chip que sigue al puntero solo dice
          //  QUÉ se lleva; sin que el origen reaccione, la lista se ve
          //  intacta y el arrastre parece no mover nada. Es la
          //  retroalimentación que da por hecha cualquier arrastre del
          //  sistema: lo que se levanta deja su hueco marcado.
          data-en-vuelo={(props.draggedTask ?? tareaEnVuelo()?.id) === f.s.id ? "true" : undefined}
          // El shell puede abrir la vista en un panel; el gesto de mover
          // entre carpetas conserva sus restricciones para tareas hijas.
          onPointerDown={(e) => {
            if (props.readOnly) return;
            const en = e.target as HTMLElement;
            if (en.closest("[data-session-actions]")) return;
            // Tampoco desde la confirmación de borrado: ahí lo que hay
            // que poder hacer es pulsar uno de los dos botones.
            if (en.closest("[data-session-confirm]")) return;
            // Ni desde el campo de renombrar: ahí el gesto de arrastrar es
            // seleccionar texto, y sin esta línea seleccionar media palabra
            // levantaría la tarea y la movería de proyecto al soltar.
            if (en.closest("[data-session-rename]")) return;
            if (props.onDrag) {
              props.onDrag(f.s, e);
              return;
            }
            if (f.s.parent || f.s.chat_de_agente) return;
            arrastrar(e, { id: f.s.id, de: projectOf(f.s), titulo: f.s.title }, (a) =>
              props.onMove(f.s.id, a),
            );
          }}
          onClick={(e) => {
            // El menú vive en un portal: Solid deja subir su clic por esta
            // fila aunque el botón no esté dentro de ella.
            if (!e.currentTarget.contains(e.target as Node)) return;
            // Lo de la columna de acciones no abre la tarea, y esto es
            // lo único que lo impide: el disparador del menú NO puede
            // llevar un `onClick` propio sin matar el que lo abre.
            if ((e.target as HTMLElement).closest("[data-session-actions]")) return;
            if ((e.target as HTMLElement).closest("[data-session-rename]")) return;
            // Soltar después de arrastrar dispara un `click` igual.
            if (fueArrastre()) return;
            props.onPick(f.s.id);
          }}
          // **Doble clic sobre la fila renombra**, que es el gesto con el que se
          // renombra cualquier cosa de una lista. Es un atajo del que ya está en
          // el menú y no la única puerta: un gesto sin rótulo no lo encuentra
          // quien no lo busca, y con el teclado no se da.
          //
          // El primero de los dos clics abre la tarea, y eso se queda: es lo que
          // hace la fila, y renombrar la que tienes delante es justo el caso.
          onDblClick={(e) => {
            if (props.readOnly || f.s.chat_de_agente) return;
            const en = e.target as HTMLElement;
            if (en.closest("[data-session-actions]")) return;
            if (en.closest("[data-session-confirm]")) return;
            if (en.closest("[data-session-rename]")) return;
            empezarARenombrar(f.s);
          }}
        >
          <div class="col-span-full min-w-0">
            <Show when={fijada(f.s)}>
              {/* El alfiler va en el hueco del borde, arriba al centro, sin fondo. */}
              <span role="img" aria-label={t("projects.sessions.pinned")} class="pointer-events-none absolute -top-1.5 left-1/2 flex size-3 -translate-x-1/2 items-center justify-center text-neutral-500">
                <Pin size={11} class="tarjeta-fijada-alfiler" aria-hidden="true" />
              </span>
            </Show>
            <FilaDelRiel
              s={f.s}
              actividad={activity()}
              titulo={<Titulo />}
              apagada={apagada()}
              conMenu={conMenu()}
              menu={() => <Menu riel={tarjetaDelRiel()} />}
              cohete={() => (
                <Show when={puedeFinalizar() && renombrando() !== f.s.id}>
                  <span data-session-actions data-finish-slot class="flex">
                    <FinishTaskButton
                      compact
                      label={t("projects.sessions.finish")}
                      description={f.s.subagent || gitRows()[f.s.id]?.shared_with
                        ? t("projects.sessions.finish_shared_description")
                        : t("projects.sessions.finish_description")}
                      busy={finishing().includes(f.s.id)}
                      onFinish={rect => void intentar(f.s.id, true, rect)}
                    />
                  </span>
                </Show>
              )}
            />
          </div>


        </div>
      </ConTarjeta>
    );
  };

  /** Una raíz con su rama de encargos. La pintan las dos listas: activas y archivadas. */
  const Rama = (r: { rama: RamaDeTareas<SessionRow>; hija?: boolean; trasLasFijadas?: boolean }) => {
    const rama = () => r.rama;
    // Cuenta y estado del plegado: todo lo de debajo, a cualquier nivel.
    const escondidas = () => descendientes(rama());
    const expanded = () => expansionOverrides()[taskIdentity(rama().tarea)] ?? (temporaryExpansion().has(taskIdentity(rama().tarea)) || desplegadas().includes(rama().tarea.id));
    const toggle = () => {
      const id = taskIdentity(rama().tarea);
      if (temporaryExpansion().has(id) || expansionOverrides()[id] !== undefined) {
        setExpansionOverrides(previous => ({ ...previous, [id]: !expanded() }));
      } else alternarDesplegada(rama().tarea.id);
    };
    return (
      <li>
        <Show when={r.trasLasFijadas}>
          <span aria-hidden="true" data-pinned-divider class="mx-1.5 my-[5px] block h-px bg-border" />
        </Show>
        <Fila s={rama().tarea} />
        <Show when={rama().hijas.length > 0}>
          <button
            type="button"
            class="mt-0.5 ml-2.5 flex w-[calc(100%-10px)] cursor-pointer items-center gap-1.5 rounded-sm border-0 bg-transparent px-1.5 py-0.5 text-left text-caption leading-[1.2] text-neutral-500 tabular-nums hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
            aria-expanded={expanded()}
            aria-label={
              !expanded()
                ? t("projects.sessions.subtasks_expand", {
                    count: escondidas().length,
                    title: rama().tarea.title,
                  })
                : t("projects.sessions.subtasks_collapse", {
                    count: escondidas().length,
                    title: rama().tarea.title,
                  })
            }
            onClick={toggle}
          >
            <ChevronRight
              size={12}
              class={cn(
                "shrink-0 transition-transform",
                expanded() && "rotate-90",
              )}
            />
            {/* El estado de lo escondido va aquí, que es donde está lo
                escondido. El punto del padre sigue siendo suyo. */}
            <EstadoDeTarea
              ambito="plegadas"
              aprobando={escondidas().some((h) =>
                props.aprobando.includes(h.id),
              )}
              viva={escondidas().some((h) => props.vivas.includes(h.id))}
              esperando={escondidas().some((h) => h.esperando)}
              outcome={rolledOutcome(escondidas())}
              sinVer={escondidas().some((h) => h.sin_ver)}
            />
            {/* Sin repetirlo al lector de pantalla: el `aria-label` del
                botón ya dice cuántas son. */}
            <span aria-hidden="true">
              {t("projects.sessions.subtasks_count", {
                count: escondidas().length,
              })}
            </span>
          </button>
        </Show>

        {/* La sangría con su hilo es la relación entera: encargos de
            la fila de arriba, sin rótulo que lo explique. */}
        <Show
          when={
            rama().hijas.length > 0 && expanded()
          }
        >
          <ul class="mt-0.5 ml-2.5 flex min-w-0 list-none flex-col gap-0.5 border-l border-border p-0 pl-1.5 [&>li]:min-w-0">
            <KeyedList each={rama().hijas} by={branch => taskIdentity(branch.tarea)}>{h => <Rama rama={h()} hija />}</KeyedList>
          </ul>
        </Show>
      </li>
    );
  };

  const [collapsedAuthors, setCollapsedAuthors] = createPref<string[]>(`taskAuthors.collapsed.${props.de}`, []);
  const toggleAuthor = (key: string) => setCollapsedAuthors(collapsedAuthors().includes(key) ? collapsedAuthors().filter(item => item !== key) : [...collapsedAuthors(), key]);
  const authorLabel = (key: string) => key.startsWith("agent:")
    ? displayName(key.slice(6), profiles()[key.slice(6)])
    : key === "unassigned" ? t("projects.sessions.without_agent")
    : key === "agent" ? t("projects.sessions.launched_by_agent")
    : key === "user" ? t("projects.sessions.launched_by_you")
    : t("projects.sessions.launcher_unknown");
  const AuthorGroups = (groupProps: { branches: RamaDeTareas<SessionRow>[] }) => {
    const keys = createMemo(() => authorKeys(groupProps.branches.map((branch) => branch.tarea), props.groupByHandler));
    // El orden relativo viene del backend; solo las fijadas suben dentro de su agente.
    const ofAuthor = (key: string) => groupProps.branches.filter(branch => authorKey(branch.tarea, props.groupByHandler) === key)
      .sort((a, b) => Number(fijada(b.tarea)) - Number(fijada(a.tarea)));
    const ordenadas = createMemo(() => [...groupProps.branches].sort((a, b) => Number(fijada(b.tarea)) - Number(fijada(a.tarea))));
    // En el riel una línea fina separa las fijadas de las demás: va en la primera que no lo está.
    const trasLasFijadas = createMemo(() => {
      if (!props.sidebar) return null;
      const lista = ordenadas();
      const primera = lista.findIndex((branch) => !fijada(branch.tarea));
      return primera > 0 ? taskIdentity(lista[primera].tarea) : null;
    });
    return <Show when={props.groupByAuthor !== false} fallback={<ul class={cn("m-0 flex min-w-0 list-none flex-col p-0 [&>li]:min-w-0", tarjetaDelRiel() ? "gap-0.5" : "gap-2")}><KeyedList each={ordenadas()} by={branch => taskIdentity(branch.tarea)}>{branch => <Rama rama={branch()} trasLasFijadas={trasLasFijadas() === taskIdentity(branch().tarea)} />}</KeyedList></ul>}>
      <For each={keys()}>{key => <section data-task-author={key} aria-label={authorLabel(key)} class="flex min-w-0 flex-col gap-1">
      <div class="group/task-author flex items-center gap-1.5 px-2 pt-1 text-xs font-medium text-neutral-500">
        <Show
          when={key.startsWith("agent:")}
          fallback={
            <button
              class="relative grid size-[18px] shrink-0 place-items-center rounded-sm focus-visible:outline-2 focus-visible:outline-primary"
              aria-expanded={!collapsedAuthors().includes(key)}
              aria-label={t(collapsedAuthors().includes(key) ? "shell.sidebar.expand_group" : "shell.sidebar.collapse_group", { name: authorLabel(key) })}
              onClick={() => toggleAuthor(key)}>
              <ChevronRight size={14} class={cn("transition-transform", !collapsedAuthors().includes(key) && "rotate-90")} />
            </button>
          }
        >
          <button class="group/author-icon relative grid size-[18px] shrink-0 place-items-center rounded-sm focus-visible:outline-2 focus-visible:outline-primary"
            aria-expanded={!collapsedAuthors().includes(key)}
            aria-label={t(collapsedAuthors().includes(key) ? "shell.sidebar.expand_group" : "shell.sidebar.collapse_group", { name: authorLabel(key) })}
            onClick={() => toggleAuthor(key)}>
            <span class="transition-opacity group-hover/task-author:opacity-0 group-focus-visible/author-icon:opacity-0"><AstroAvatar name={key.slice(6)} status="asleep" body={profiles()[key.slice(6)]?.body} avatar={profiles()[key.slice(6)]?.avatar} size={18} /></span>
            <ChevronRight size={14} class={cn("absolute opacity-0 transition-[opacity,transform] group-hover/task-author:opacity-100 group-focus-visible/author-icon:opacity-100", !collapsedAuthors().includes(key) && "rotate-90")} />
          </button>
        </Show>
        <span class="min-w-0 truncate">{authorLabel(key)}</span>
      </div>
      {/* El hilo sangrado es de quién es la tarea, igual que el del proyecto
          dice de qué carpeta es: sin él, cabecera y tareas están al mismo
          nivel y el grupo no se ve dónde acaba. */}
      <ul hidden={collapsedAuthors().includes(key)} class="m-0 ml-2 flex min-w-0 list-none flex-col gap-2 border-l border-border p-0 pl-1.5 [&>li]:min-w-0">
        <KeyedList each={ofAuthor(key)} by={branch => taskIdentity(branch.tarea)}>{branch => <Rama rama={branch()} />}</KeyedList>
      </ul>
    </section>}</For>
    </Show>;
  };

  return (
    <div class="flex min-w-0 flex-col gap-2">
      <Show when={actionFailure()}>{failure => (
        <ToastPortal>
          <Toast tone="error" onDismiss={() => setActionFailure(null)}>
            <div class="max-h-[50vh] overflow-y-auto break-words">
              <FailureNote f={failure()} />
            </div>
          </Toast>
        </ToastPortal>
      )}</Show>
      <Show when={query()}>
        <p data-search-results class="m-0 px-2 text-caption text-neutral-500" aria-live="polite">
          {matchedSessions().length === 0 ? t("projects.agent_tasks.no_results") : t("projects.sessions.search_results", { count: matchedSessions().length })}
        </p>
      </Show>
      <Show when={aviso()}>{a => (
        <Suspense>
          <TaskBlockersDialog
            aviso={a()}
            onCerrar={() => setAviso(null)}
            onArchivar={(id) => { setAviso(null); void intentar(id, false); }}
            onDescartar={() => void descartarYSeguir()}
          />
        </Suspense>
      )}</Show>
      <Show when={activas().length > 0}>
        <AuthorGroups branches={activas()} />
      </Show>

    </div>
  );
}
