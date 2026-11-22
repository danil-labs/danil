/** Cuántos proyectos abre el selector antes de «Más proyectos…». */
export const RECENT_LIMIT = 8;

/** Última vez que se eligió cada proyecto en este selector: id → epoch en ms. */
export type PickedAt = Record<string, number>;

type Ranked = { id: string; name: string; created_at?: number | null };

// Las tareas fechan en ms; un valor por debajo de 1e12 son segundos (no llega a 1e12 hasta el año 33658).
const ms = (at: number | null | undefined) =>
  typeof at === "number" && Number.isFinite(at) && at > 0 ? (at < 1e12 ? at * 1000 : at) : 0;

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** El máximo de su última tarea viva, su última elección y su creación; nunca `updated_at`. */
export function recency(project: Ranked, activity: Readonly<Record<string, number>>, picked: Readonly<PickedAt>): number {
  return Math.max(ms(activity[project.id]), ms(picked[project.id]), ms(project.created_at));
}

/** Del más reciente al más viejo; los empates, por nombre y después por id. */
export function byRecent<P extends Ranked>(projects: readonly P[], activity: Readonly<Record<string, number>>, picked: Readonly<PickedAt>): P[] {
  const at = new Map(projects.map((p) => [p.id, recency(p, activity, picked)]));
  return [...projects].sort((a, b) =>
    (at.get(b.id) ?? 0) - (at.get(a.id) ?? 0)
    || collator.compare(a.name, b.name)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Los `limit` más recientes y el resto; el proyecto `current` queda siempre entre los visibles. */
export function recentProjects<P extends Ranked>(
  projects: readonly P[],
  activity: Readonly<Record<string, number>>,
  picked: Readonly<PickedAt>,
  current: string,
  limit = RECENT_LIMIT,
): { visible: P[]; rest: P[] } {
  const sorted = byRecent(projects, activity, picked);
  const visible = sorted.slice(0, limit);
  const rest = sorted.slice(limit);
  const kept = current ? rest.findIndex((p) => p.id === current) : -1;
  if (kept >= 0) visible.push(...rest.splice(kept, 1));
  return { visible, rest };
}

/** La actividad de cada proyecto: la de su tarea viva que se movió más tarde. */
export function activityByProject<T>(tasks: Readonly<Record<string, readonly T[]>>, lastActivity: (task: T) => number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [project, rows] of Object.entries(tasks)) {
    if (!project) continue;
    for (const row of rows) out[project] = Math.max(out[project] ?? 0, lastActivity(row));
  }
  return out;
}

const isMap = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Lo guardado en `projects.last_picked`, sea cual sea su forma: `workspace → {id → epoch}` o vacío. */
export function storedPicks(stored: unknown): Record<string, PickedAt> {
  return isMap(stored) ? (stored as Record<string, PickedAt>) : {};
}

/** Las elecciones de un workspace; lo que no sea un mapa cuenta como ninguna. */
export function picksIn(stored: unknown, workspace: string): PickedAt {
  const here = storedPicks(stored)[workspace];
  return isMap(here) ? (here as PickedAt) : {};
}

/** Anota la elección y descarta los ids que ya no existen. */
export function rememberPick(picked: Readonly<PickedAt>, id: string, now: number, existing: Iterable<string>): PickedAt {
  const out: PickedAt = {};
  for (const known of existing) {
    const at = picked[known];
    if (typeof at === "number" && Number.isFinite(at)) out[known] = at;
  }
  if (id) out[id] = now;
  return out;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Proyectos que la persona apartó del selector, por workspace: workspace → ids. */
export type HiddenProjects = Record<string, string[]>;

/** Los ids ocultos de un workspace; un valor guardado con otra forma cuenta como ninguno. */
export function hiddenIn(hidden: unknown, workspace: string | null | undefined): Set<string> {
  const ids = workspace && isRecord(hidden) ? hidden[workspace] : null;
  return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string" && !!id) : []);
}

/**
 * Oculta o muestra `id` en `workspace`. Solo toca ese workspace y descarta de él
 * los ids que ya no existen; los demás workspaces quedan igual.
 */
export function setHidden(
  hidden: unknown,
  workspace: string,
  id: string,
  hide: boolean,
  existing: Iterable<string>,
): HiddenProjects {
  const out = { ...(isRecord(hidden) ? hidden : {}) } as HiddenProjects;
  if (!workspace || !id) return out;
  const known = new Set(existing);
  const ids = hiddenIn(hidden, workspace);
  if (hide) ids.add(id);
  else ids.delete(id);
  const kept = [...ids].filter((h) => known.has(h)).sort();
  if (kept.length) out[workspace] = kept;
  else delete out[workspace];
  return out;
}

/**
 * Las secciones del selector sin texto: los `limit` más recientes, el resto y,
 * al final, los ocultos. Un oculto no cuenta entre los recientes, salvo el
 * proyecto `current`, que siempre se ve aunque esté oculto.
 */
export function pickerSections<P extends Ranked>(
  projects: readonly P[],
  activity: Readonly<Record<string, number>>,
  picked: Readonly<PickedAt>,
  hidden: ReadonlySet<string>,
  current: string,
  limit = RECENT_LIMIT,
): { visible: P[]; rest: P[]; hidden: P[] } {
  const shown = projects.filter((p) => !hidden.has(p.id) || p.id === current);
  const { visible, rest } = recentProjects(shown, activity, picked, current, limit);
  return { visible, rest, hidden: byRecent(projects.filter((p) => hidden.has(p.id) && p.id !== current), activity, picked) };
}

/**
 * Cuántas tareas activas tiene cada proyecto, contadas de las tareas vivas que
 * la ventana ya cargó. Las archivadas no cuentan (una pestaña abierta las trae
 * de vuelta con `archived`). Un proyecto sin lista leída no tiene entrada: su
 * número no se conoce y no se inventa.
 */
export function activeTaskCounts<T extends { archived?: boolean | null }>(tasks: Readonly<Record<string, readonly T[]>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [project, rows] of Object.entries(tasks)) {
    if (!project) continue;
    out[project] = rows.filter((row) => row.archived !== true).length;
  }
  return out;
}

/** El número de la fila: sin `counts`, el del motor; con él, solo el que se conoce (`null` si no). */
export function taskCountOf(project: { id: string; sessions: number }, counts: Readonly<Record<string, number>> | undefined): number | null {
  return counts ? (counts[project.id] ?? null) : project.sessions;
}
