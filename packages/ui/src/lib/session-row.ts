import type { TaskActivity } from "@terminus/design";


/**
 * En qué etapa del trabajo puso una persona una tarea. Ver `sessions::Etapa`
 * para el motivo entero; aquí va lo que eso obliga en pantalla.
 *
 * **No es `EstadoDeTarea` y no puede parecerlo.** Aquel punto lo pone la
 * máquina y dura lo que dura el turno —está trabajando, preguntó, espera que
 * apruebes—; esto lo pone una persona y dura hasta que otra lo cambie. Son dos
 * respuestas a dos preguntas distintas de la misma fila, así que se pintan con
 * dos formas distintas: aquel es un punto de color sin texto, esto es una
 * palabra. Con la misma forma, una tarea marcada «Hecho» que además está
 * contestando tendría dos puntos discutiendo cuál es el estado.
 *
 * **El color no lleva el dato solo**: la palabra está escrita. Tres tonos que
 * solo se distinguen por matiz no llegan a los 3:1 de WCAG 2.2 § 1.4.11 y
 * dejarían la fila sin decir nada a quien no los separa.
 *
 * **La tarea sin etapa no pinta nada.** Una insignia «Sin empezar» en cada fila
 * del historial afirmaría de todas ellas algo que nadie declaró, y convertiría
 * una lista de veinte tareas en veinte insignias iguales — el ruido que hace
 * que la marcada deje de verse.
 *
 * **Y no viaja a la pestaña**, aunque el punto de estado sí lo haga. La pestaña
 * es la tarea que tienes delante: en qué etapa está se ve mirándola. Esto
 * contesta «cuál me queda por mirar», que es una pregunta de la lista.
 */
export type Etapa = "in_progress" | "review" | "done";

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
