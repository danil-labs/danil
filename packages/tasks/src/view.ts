/**
 * La lista plana de tareas y su único filtro: carpetas, agente y agrupar. Es la vista del sidebar del escritorio (#151) y la de la lista del
 * teléfono; las palabras de cada opción viven en `SIDEBAR_LABELS` de
 * `@terminus/design` (el escritorio las lee de `shell.sidebar.view.*`).
 */
import { type TaskActivity, type TaskState } from "../../design/src/index.ts";
import { type WorkState, WORK_STATES } from "./workState.ts";

/** Qué enseña la lista de tareas. `folders` vacío son todas las carpetas. */
export type SidebarView = {
  folders: string[];
  agent: string | null;
  group: SidebarGrouping;
};

export type SidebarGrouping = "none" | "folder" | "status" | "agent" | "machine";
export type SidebarSection = "active";

export const DEFAULT_SIDEBAR_VIEW: SidebarView = {
  folders: [],
  agent: null,
  group: "folder",
};

export const GROUPINGS: readonly SidebarGrouping[] = ["none", "folder", "status", "agent", "machine"];

/** Lo que la lista sabe de una fila (`SessionRow`) y basta para colocarla. */
export type SidebarTask = {
  id: string;
  folder?: string | null;
  agent?: string | null;
  /** La máquina que la corre si no es la de la ventana; sin ella, es de esta. */
  machine?: string | null;
  pinned?: boolean | null;
  chat_de_agente?: boolean;
  inbox?: boolean;
  archived?: boolean | null;
  esperando: boolean;
  outcome?: "delivered" | "failed" | "interrupted" | null;
  sin_ver?: boolean;
  stage?: "in_progress" | "review" | "done" | null;
  delegated_activity?: TaskActivity;
};

export type SidebarContext<T extends SidebarTask = SidebarTask> = {
  /** Tareas con un turno en marcha (`vivas`). */
  live: Iterable<string>;
  /** Estado de Git/kn ya resuelto al árbol compartido de la tarea. */
  workStateOf?: (task: T) => WorkState;
  /** Tareas paradas esperando que se apruebe una acción (`aprobando`). */
  approving: Iterable<string>;
  /** De qué carpeta es la tarea; por omisión `task.folder`. */
  folderOf?: (task: T) => string | null | undefined;
  /** En qué máquina corre; por omisión `task.machine`, y `""` es esta. */
  machineOf?: (task: T) => string | null | undefined;
};

export type SidebarGroup<T> = {
  kind: "section" | "folder" | "status" | "agent" | "machine";
  /** Sección, id de carpeta, estado, nombre de agente o máquina; `""` es sin carpeta, sin agente o esta máquina. */
  key: string;
  /**
   * Solo en una carpeta con tareas en más de una máquina: cada máquina es su
   * propio grupo, porque en disco son clones distintos. `""` es esta máquina.
   */
  machine?: string;
  tasks: T[];
};

export type SidebarStatusKey = WorkState;

/**
 * Un agente con otra mayúscula es el mismo agente: en Windows y macOS su
 * carpeta es una sola, y una tarea guarda el nombre como se escribió.
 */
export function sameAgent(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/** Una opción de «Agente» del filtro; `installed` falso es un agente que ya no está pero tiene tareas. */
export type AgentOption = { name: string; installed: boolean };

/**
 * Las opciones de «Agente»: los instalados y, de los desinstalados, solo los
 * que aún tienen tareas sin archivar. Sin repetir un agente por mayúsculas;
 * manda como se escribe el instalado. Primero los instalados, por nombre.
 */
export function agentOptions(installed: Iterable<string>, tasks: Iterable<SidebarTask>): AgentOption[] {
  const options = new Map<string, AgentOption>();
  for (const name of installed) {
    if (name && !options.has(name.toLowerCase())) options.set(name.toLowerCase(), { name, installed: true });
  }
  for (const task of tasks) {
    const name = task.agent;
    if (name && !task.archived && !options.has(name.toLowerCase())) options.set(name.toLowerCase(), { name, installed: false });
  }
  const byName = (a: AgentOption, b: AgentOption) => {
    const x = a.name.toLowerCase(), y = b.name.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  };
  return [...options.values()].sort((a, b) => Number(b.installed) - Number(a.installed) || byName(a, b));
}

/** Una vista guardada, tal cual o reparada: lo que no se entiende vuelve al valor por defecto. */
export function sanitizeSidebarView(raw: unknown): SidebarView {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SIDEBAR_VIEW };
  const v = raw as Record<string, unknown>;
  const folders = Array.isArray(v.folders)
    ? [...new Set(v.folders.filter((f): f is string => typeof f === "string" && f !== ""))]
    : [];
  return {
    folders,
    agent: typeof v.agent === "string" && v.agent !== "" ? v.agent : null,
    group: GROUPINGS.includes(v.group as SidebarGrouping) ? (v.group as SidebarGrouping) : DEFAULT_SIDEBAR_VIEW.group,
  };
}

/** Igual que la fila del historial: sin valor del backend, el chat del agente y la bandeja van fijados. */
export function isPinned(task: SidebarTask): boolean {
  return task.pinned ?? (!!task.chat_de_agente || task.inbox === true);
}

function has(ids: Iterable<string>, id: string): boolean {
  if (ids instanceof Set) return ids.has(id);
  if (Array.isArray(ids)) return ids.includes(id);
  for (const x of ids) if (x === id) return true;
  return false;
}

/** La actividad que pinta la marca de estado de esta fila. */
export function activityOf(task: SidebarTask, ctx: Pick<SidebarContext, "live" | "approving">): TaskActivity {
  return task.delegated_activity ?? {
    aprobando: has(ctx.approving, task.id),
    viva: has(ctx.live, task.id),
    esperando: task.esperando,
    outcome: task.outcome,
    sinVer: task.sin_ver,
  };
}

/** Si el estado pide a la persona: aprobar, contestar o mirar un fallo. */
export function needsYou(state: TaskState | null): boolean {
  return state === "approving" || state === "asked" || state === "failed";
}

export function statusKeyOf<T extends SidebarTask>(task: T, ctx: Pick<SidebarContext<T>, "workStateOf">): SidebarStatusKey {
  return ctx.workStateOf?.(task) ?? "unknown";
}

const pinnedFirst = <T extends SidebarTask>(tasks: T[]): T[] =>
  tasks.map((task, i) => ({ task, i }))
    .sort((a, b) => Number(isPinned(b.task)) - Number(isPinned(a.task)) || a.i - b.i)
    .map(({ task }) => task);

function groupBy<T extends SidebarTask>(tasks: T[], keyOf: (task: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const task of tasks) {
    const key = keyOf(task);
    const list = groups.get(key);
    if (list) list.push(task);
    else groups.set(key, [task]);
  }
  return groups;
}

/**
 * Filtra por carpetas y agente y reparte en grupos, conservando el orden de
 * entrada (la más nueva primero). Sin agrupar devuelve siempre una sola
 * sección, con cada tarea en su sitio (la que te necesita lo dice su marca);
 * agrupando, solo los grupos con tareas.
 */
export function applySidebarView<T extends SidebarTask>(
  tasks: readonly T[],
  view: SidebarView,
  ctx: SidebarContext<T>,
): SidebarGroup<T>[] {
  const folderOf = (task: T) => (ctx.folderOf ? ctx.folderOf(task) : task.folder) ?? "";
  const visible = tasks.filter((task) => !task.archived
    && (view.folders.length === 0 || view.folders.includes(folderOf(task)))
    && (view.agent === null || sameAgent(task.agent, view.agent)));

  if (view.group === "none") return [{ kind: "section", key: "active", tasks: pinnedFirst(visible) }];

  let groups: Map<string, T[]>;
  let order: string[];
  if (view.group === "status") {
    groups = groupBy(visible, (task) => statusKeyOf(task, ctx));
    order = [...WORK_STATES];
  } else if (view.group === "machine") {
    // Esta máquina primero; las demás, en el orden en que aparece su tarea más nueva.
    groups = groupBy(visible, (task) => task.machine ?? "");
    order = ["", ...[...groups.keys()].filter((key) => key !== "")];
  } else {
    // Un agente con otra mayúscula cae en el mismo grupo, con el nombre de su tarea más nueva.
    const spelling = new Map<string, string>();
    for (const task of visible) if (task.agent && !spelling.has(task.agent.toLowerCase())) spelling.set(task.agent.toLowerCase(), task.agent);
    const agentOf = (task: T) => (task.agent ? spelling.get(task.agent.toLowerCase())! : "");
    groups = groupBy(visible, view.group === "folder" ? folderOf : agentOf);
    order = [...[...groups.keys()].filter((key) => key !== ""), ""];
  }
  const kind = view.group;
  const machineOf = (task: T) => (ctx.machineOf ? ctx.machineOf(task) : task.machine) ?? "";
  return order.filter((key) => groups.has(key)).flatMap((key): SidebarGroup<T>[] => {
    const tasks = groups.get(key)!;
    // Una carpeta en dos máquinas son dos clones: un grupo por máquina, esta primero
    // y las demás por su tarea más nueva. En una sola máquina, el grupo de siempre.
    const byMachine = kind === "folder" && key !== "" ? groupBy(tasks, machineOf) : null;
    if (!byMachine || byMachine.size < 2) return [{ kind, key, tasks: pinnedFirst(tasks) }];
    const machines = [...byMachine.keys()].sort((a, b) => Number(b === "") - Number(a === ""));
    return machines.map((machine) => ({ kind, key, machine, tasks: pinnedFirst(byMachine.get(machine)!) }));
  });
}

/** La clave de un grupo para listas y plegado: la de la carpeta, más la máquina si se partió. */
export function groupKey(group: Pick<SidebarGroup<unknown>, "kind" | "key" | "machine">): string {
  return group.machine === undefined ? `${group.kind}:${group.key}` : `${group.kind}:${group.key}@${group.machine}`;
}

/** Cuántas opciones del filtro no están en su valor por defecto: el número del botón. */
export function nonDefaultCount(view: SidebarView): number {
  return Number(view.folders.length > 0)
    + Number(view.agent !== null)
    + Number(view.group !== DEFAULT_SIDEBAR_VIEW.group);
}
