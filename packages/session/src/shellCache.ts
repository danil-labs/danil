import type { SessionRow } from "../../features/projects/src/screens/Sessions";
import { contextSnapshotKey, contextualSnapshot, createSnapshotWriter, snapshotMatchesContext, snapshotStorageKey } from "./context-snapshot.ts";
import type { Project } from "../../../apps/desktop/src/lib/model";
import type { Space } from "../../ui/src/lib/spaces";

/**
 * Lo que pinta el sidebar, por workspace, para enseñarlo antes del primer IPC.
 * Es una foto de la ventana anterior: hasta que el motor contesta, la fila no
 * sirve para actuar. Se guarda con espera y acotada; una foto que no cabe se
 * recorta por carpeta y, si aun así no cabe, no se guarda.
 */
export type ShellSnapshot = {
  workspace: string;
  context?: string;
  projects: Project[];
  sessions: Record<string, SessionRow[]>;
  spaces: Space[];
  desk: string | null;
};

// La versión 2 trae filas con `provider` y `agent`; una foto de la 1 se descarta.
type Stored = { version: 2; last: string; workspaces: Record<string, { saved: number; snapshot: string }> };

const KEY = "harness:shell-cache";
const WORKSPACES = 4;
const ROWS = [80, 30, 10];
const BYTES = 400_000;
export const SAVE_DELAY = 500;

function stored(key = contextSnapshotKey(KEY)): Stored | null {
  try {
    const raw = localStorage.getItem(key);
    const value = raw === null ? null : (JSON.parse(raw) as Stored);
    return value?.version === 2 && typeof value.last === "string" ? value : null;
  } catch {
    return null;
  }
}

/**
 * En la web con varias cuentas de Danil (`web/accounts.ts`) la página es de una
 * sola: solo enseña la foto de un workspace suyo, y la del pedido en `?w=` antes
 * que la última. `null` (el escritorio): la última, sin filtro.
 */
let scope: { mine: (workspace: string) => boolean; prefer: string | null } | null = null;

export function setShellCacheScope(next: typeof scope) {
  scope = next;
}

export function readShellCache(): ShellSnapshot | null {
  const value = stored();
  const wanted = scope?.prefer && value?.workspaces[scope.prefer] ? scope.prefer : value?.last;
  if (!value || !wanted || (scope && !scope.mine(wanted))) return null;
  const entry = value.workspaces[wanted];
  if (!entry) return null;
  try {
    const snapshot = JSON.parse(entry.snapshot) as ShellSnapshot;
    if (snapshot.workspace !== wanted || !Array.isArray(snapshot.projects)) return null;
    // Una foto no es una respuesta: lo que otra máquina dijo vuelve como copia de esa hora.
    const copy = (row: SessionRow): SessionRow => (row.machine && row.machine_status === "ok" ? { ...row, machine_status: "cached" } : row);
    const sessions = Object.fromEntries(Object.entries(snapshot.sessions).map(([folder, rows]) => [folder, rows.map(copy)]));
    return contextualSnapshot({ ...snapshot, sessions });
  } catch {
    return null;
  }
}

export const shellCacheMatches = (snapshot: ShellSnapshot | null, workspace: string | null) => snapshot?.workspace === workspace && snapshotMatchesContext(snapshot);

export function hasShellCache(): boolean {
  return readShellCache() !== null;
}

// Una fila que no cambió conserva su objeto (`conservar`): se codifica una vez.
const encoded = new WeakMap<object, string>();
const encode = (value: object) => {
  let text = encoded.get(value);
  if (text === undefined) {
    text = JSON.stringify(value);
    encoded.set(value, text);
  }
  return text;
};
const list = (values: object[]) => `[${values.map(encode).join(",")}]`;

function encodeSnapshot(snapshot: ShellSnapshot, rows: number): string {
  const sessions = Object.entries(snapshot.sessions)
    .map(([folder, values]) => `${JSON.stringify(folder)}:${list(values.slice(0, rows))}`)
    .join(",");
  return `{"workspace":${JSON.stringify(snapshot.workspace)},"projects":${list(snapshot.projects)},"sessions":{${sessions}},"spaces":${list(snapshot.spaces)},"desk":${JSON.stringify(snapshot.desk)}}`;
}

export function writeShellCache(snapshot: ShellSnapshot, now = Date.now()) {
  const key = snapshotStorageKey(KEY, snapshot);
  const text = ROWS.map((rows) => encodeSnapshot(snapshot, rows)).find((t) => t.length <= BYTES);
  const value = stored(key) ?? { version: 2 as const, last: snapshot.workspace, workspaces: {} };
  // La misma foto ya guardada no se reescribe: cada escritura rehace todo el valor.
  if (value.last === snapshot.workspace && value.workspaces[snapshot.workspace]?.snapshot === text) return;
  if (text === undefined) {
    delete value.workspaces[snapshot.workspace];
  } else {
    value.workspaces[snapshot.workspace] = { saved: now, snapshot: text };
  }
  value.last = snapshot.workspace;
  const kept = Object.entries(value.workspaces)
    .sort(([, a], [, b]) => b.saved - a.saved)
    .slice(0, WORKSPACES);
  value.workspaces = Object.fromEntries(kept);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin espacio se pierde la foto, no el trabajo: el siguiente arranque espera al motor.
    try {
      localStorage.removeItem(key);
    } catch {
      // Sin almacenamiento no hay nada que borrar.
    }
  }
}

/** Olvida las fotos de estos workspaces (una cuenta quitada de este navegador). */
export function forgetShellCache(workspaces: readonly string[]) {
  const value = stored();
  if (!value || !workspaces.some((w) => w in value.workspaces)) return;
  for (const w of workspaces) delete value.workspaces[w];
  try {
    localStorage.setItem(contextSnapshotKey(KEY), JSON.stringify(value));
  } catch {
    // Sin almacenamiento no hay nada que borrar.
  }
}

/** Guarda la última foto pedida tras `SAVE_DELAY` sin pedidos nuevos; `flush` la escribe ya y `cancel` la descarta. */
export function shellCacheWriter(
  write: (snapshot: ShellSnapshot) => void = writeShellCache,
  schedule: (run: () => void, ms: number) => unknown = (run, ms) => setTimeout(run, ms),
  cancel: (handle: unknown) => void = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
) {
  return createSnapshotWriter(write, SAVE_DELAY, schedule, cancel);
}
