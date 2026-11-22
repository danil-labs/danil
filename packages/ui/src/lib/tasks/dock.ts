/**
 * El dock de agentes: quién va primero y cuántos caben. El escritorio lo pinta
 * como una fila al pie del sidebar; el teléfono, como una tira de caras sobre
 * la lista (ver `apps/mobile/docs/mobile.md`).
 */

export type AgentPresence = "working" | "awake" | "asleep";

/** Lado de cada hueco del dock y separación entre huecos, en px (escritorio). */
export const DOCK_SLOT = 26;
export const DOCK_GAP = 6;
/** Huecos que se suponen antes de la primera medida: un sidebar de 240 px. */
export const DOCK_DEFAULT_CAPACITY = 7;

export type DockAgent = {
  name: string;
  /** Sin estado todavía se pinta dormido. */
  status?: AgentPresence;
  liveTasks: number;
  /** Para «Despierto · {n} min». */
  minutesSinceLastTurn?: number | null;
};

const RANK: Record<AgentPresence, number> = { working: 0, awake: 1, asleep: 2 };

/**
 * Orden del dock: trabajando, despiertos y dormidos; dentro de cada grupo, por
 * el nombre que se ve. Los ocultos en su perfil no entran.
 */
export function orderDockAgents<T extends DockAgent>(
  agents: readonly T[],
  labelOf: (agent: T) => string = (a) => a.name,
  isHidden: (agent: T) => boolean = () => false,
): T[] {
  return agents
    .filter((a) => !isHidden(a))
    .map((a) => ({ a, label: labelOf(a) }))
    .sort(
      (x, y) =>
        RANK[x.a.status ?? "asleep"] - RANK[y.a.status ?? "asleep"] ||
        x.label.localeCompare(y.label, undefined, { sensitivity: "base" }) ||
        x.a.name.localeCompare(y.a.name),
    )
    .map(({ a }) => a);
}

/** Huecos de `slot` px separados `gap` px que caben en `width`; al menos uno. */
export function dockCapacity(width: number, slot = DOCK_SLOT, gap = DOCK_GAP): number {
  if (!Number.isFinite(width) || width <= 0) return DOCK_DEFAULT_CAPACITY;
  return Math.max(1, Math.floor((width + gap) / (slot + gap)));
}

/**
 * Reparte `capacity` huecos de una sola fila. El «+» de nuevo agente ocupa uno
 * si está; si no caben todos, el último libre es «+k» con los que faltan. El
 * agente elegido nunca queda escondido: toma el último hueco visible.
 */
export function planDock<T extends { name: string }>(
  ordered: readonly T[],
  capacity: number,
  options: { hasNew?: boolean; selected?: string | null } = {},
): { shown: T[]; overflow: number } {
  const free = Math.max(0, capacity - (options.hasNew ? 1 : 0));
  if (ordered.length <= free) return { shown: [...ordered], overflow: 0 };
  const room = Math.max(0, free - 1);
  const shown = ordered.slice(0, room);
  const chosen = options.selected ? ordered.find((a) => a.name === options.selected) : undefined;
  if (chosen && room > 0 && !shown.includes(chosen)) shown[room - 1] = chosen;
  return { shown, overflow: ordered.length - shown.length };
}

/**
 * En qué carpeta se abre el chat con un agente del dock: la de la tarea abierta
 * si lo tiene, o la única que lo tiene. `null` es que hay que preguntar.
 */
export function agentFolder(available: readonly string[], current: string | null | undefined): string | null {
  if (current && available.includes(current)) return current;
  return available.length === 1 ? available[0] : null;
}

/**
 * A quién se pide la lista de agentes: cada carpeta con tareas, en cada máquina
 * donde las tiene (`""` es la de la ventana). Sin máquina, la web la manda a la
 * primera encendida de la cuenta, que puede no tener esa carpeta.
 */
export function dockSources(
  tasks: readonly { project: string; row: { machine?: string | null } }[],
): { project: string; machine: string }[] {
  const seen = new Map<string, { project: string; machine: string }>();
  for (const { project, row } of tasks) {
    if (!project) continue;
    const machine = row.machine ?? "";
    seen.set(`${project}\n${machine}`, { project, machine });
  }
  return [...seen.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, source]) => source);
}
