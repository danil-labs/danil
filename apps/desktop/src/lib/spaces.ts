import { isSubtask, type LauncherRow } from "../../../../packages/tasks/src/flat.ts";
import { t } from "./i18n.ts";

/**
 * Los espacios de la ventana: espejo de `workspace/spaces.rs`. La
 * ventana nunca resuelve de cuál es una tarea: lo dice `SessionRow.space`.
 * Una fila con `space` nulo no se pudo resolver, y se pinta en todos los
 * escritorios.
 */
export type Space = {
  id: string;
  /** `null` es el nombre por omisión del catálogo. */
  name: string | null;
  /** Las agregadas, en el orden del riel. Ninguna manda sobre las demás. */
  folders: string[];
  created_at: number;
  updated_at: number;
  /** De la cuenta de Danil: el mismo id en todas las máquinas del workspace. */
  account?: boolean;
};

export type SpaceRef = { id: string; name: string | null; deleted?: boolean };

export type FileMark = { path: string; hash: string };

export type TaskSeen = {
  folder: string;
  task: string;
  root: string;
  title: string;
  working: boolean;
  files: FileMark[];
  kn_pending: string[];
};

export type DeletePreview = { space: SpaceRef; last: boolean; tasks: TaskSeen[] };

export type DeleteOutcome = {
  deleted: boolean;
  changed: DeletePreview | null;
  failures: { folder: string; task: string; error: unknown }[];
};

type Fila = LauncherRow & {
  id?: string;
  space?: string | null;
  archived?: boolean | null;
  pinned?: boolean | null;
  /** La máquina de la cuenta que tiene la tarea; sin ella, es de esta computadora. */
  machine?: string | null;
};

export const spaceName = (i: { name: string | null } | null | undefined) =>
  i?.name ?? t("spaces.default_name");

/**
 * Si la fila se pinta en el escritorio `desk`. Sin escritorio se pinta todo.
 * Una tarea de otra máquina en un space de la cuenta trae el mismo id que aquí;
 * en uno que solo tiene esa máquina, el de esa máquina (con su prefijo).
 */
export function enEscritorio(row: Fila, desk: string | null): boolean {
  if (desk === null) return true;
  return !row.space || row.space === desk;
}

/**
 * De qué escritorio vivo es la fila, o `null` si de ninguno en concreto. Una
 * tarea de otra máquina en un space que solo tiene esa máquina no lleva a
 * ninguno: abrirla no saca a la persona del escritorio donde la ve.
 */
export function escritorioDeFila(row: Fila | undefined, vivas: readonly Space[]): string | null {
  if (!row || !row.space) return null;
  const viva = vivas.find((i) => i.id === row.space);
  if (!viva || (row.machine && !viva.account)) return null;
  return viva.id;
}

/**
 * Las carpetas del riel en «Tareas»: las agregadas en su orden y después toda
 * carpeta con una tarea viva del escritorio, en el orden de la lista. Ninguna
 * tarea viva se esconde. Solo cuentan las que el riel enseña (`flattenTasks`):
 * una subtarea vive bajo su lanzador, y por ella sola la carpeta quitada
 * volvía al riel diciendo «Sin tareas todavía».
 */
export function carpetasDelEscritorio<P extends { id: string }>(
  projects: readonly P[],
  desk: Space | null,
  sesiones: Record<string, readonly Fila[]>,
): P[] {
  if (!desk) return [...projects];
  const porId = new Map(projects.map((p) => [p.id, p]));
  const agregadas = desk.folders.map((id) => porId.get(id)).filter((p): p is P => p !== undefined);
  const conTareas = projects.filter(
    (p) =>
      !desk.folders.includes(p.id) &&
      (sesiones[p.id] ?? []).some((r) => !r.archived && (r.pinned || !isSubtask(r)) && enEscritorio(r, desk.id)),
  );
  return [...agregadas, ...conTareas];
}

export const claveDeVista = (s: { folder: string; task: string }) => `${s.folder}\u0000${s.task}`;

/**
 * Qué marcar en la previa que volvió: una tarea que no estaba es «nueva»; una
 * que empezó a trabajar o tiene un archivo o un pendiente que no se vio,
 * «cambió». Es la misma comparación que `spaces::unseen`.
 */
export function marcasDeCambio(vista: readonly TaskSeen[], ahora: readonly TaskSeen[]): Map<string, "new" | "changed"> {
  const marcas = new Map<string, "new" | "changed">();
  const clave = claveDeVista;
  const antes = new Map(vista.map((s) => [clave(s), s]));
  for (const s of ahora) {
    const visto = antes.get(clave(s));
    if (!visto) {
      marcas.set(clave(s), "new");
      continue;
    }
    const nuevoArchivo = s.files.some((f) => !visto.files.some((v) => v.path === f.path && v.hash === f.hash));
    const nuevoPendiente = s.kn_pending.some((p) => !visto.kn_pending.includes(p));
    if ((s.working && !visto.working) || nuevoArchivo || nuevoPendiente) marcas.set(clave(s), "changed");
  }
  return marcas;
}
