/**
 * Los workspaces que el motor de esta computadora conoce de las otras máquinas
 * de la persona (`light_state_machines_v1`): `state_machines` los da del disco,
 * de todas las sesiones de Danil que tiene el motor, sea cual sea el workspace
 * abierto. Se relee con `state.copy_changed` y la versión que ya se tiene.
 */

export const LIGHT_STATE_MACHINES_FEATURE = "light_state_machines_v1";

/**
 * Un workspace que el motor conoce. `local`: existe en esta computadora; `organization`: lo sirve el servidor de una organización.
 * `logo`: la ruta del de aquí (un motor anterior no la manda); `logo_version` cambia con la imagen aunque la ruta sea la misma.
 */
export type EngineWorkspace = { id: string; name: string | null; local: boolean; organization: boolean; machines: string[]; logo?: string | null; logo_version?: string | null };

/** Lo que el riel pinta de un workspace. */
export type RailWorkspace = { id: string; name: string; logo: string | null };

/**
 * El riel de la persona desde un solo índice: los de aquí y los que sirve otra
 * máquina suya con nombre conocido, en el orden del motor (la ventana aplica el suyo).
 * `null` con un motor que aún no da el logo de los de aquí: el riel sale de `list_workspaces`.
 */
export function railOf(rows: readonly EngineWorkspace[]): RailWorkspace[] | null {
  if (rows.some((w) => w.local && w.logo === undefined)) return null;
  return rows
    .filter((w) => w.local || (w.machines.length > 0 && !!w.name))
    .map((w) => ({ id: w.id, name: w.name ?? w.id, logo: w.local ? (w.logo ?? null) : null }));
}

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type Listen = (event: string, handler: () => void) => Promise<() => void>;

/** Los avisos llegan por copia (tareas, proyectos, la máquina): varios seguidos se leen una vez. */
const SETTLE = 150;

type Row = { workspace?: unknown; name?: unknown; local?: unknown; machines?: unknown; logo?: unknown; logo_version?: unknown };

/** El estado de cada otra máquina según la lista de la cuenta que guardó el motor (`machines/<id>/machine.json`). */
function statesOf(rows: unknown): Map<string, string> {
  const found = new Map<string, string>();
  for (const row of Array.isArray(rows) ? (rows as Row[]) : [])
    for (const m of (Array.isArray(row?.machines) ? row.machines : []) as { computer_id?: unknown; state?: unknown }[])
      if (typeof m?.computer_id === "string" && typeof m.state === "string") found.set(m.computer_id, m.state);
  return found;
}

function parse(rows: unknown): EngineWorkspace[] | null {
  if (!Array.isArray(rows)) return null;
  const found: EngineWorkspace[] = [];
  for (const row of rows as Row[]) {
    if (!row || typeof row.workspace !== "string") continue;
    const machines = (Array.isArray(row.machines) ? row.machines : []) as { computer_id?: unknown; organization?: unknown }[];
    found.push({
      id: row.workspace,
      name: typeof row.name === "string" && row.name.trim() ? row.name : null,
      local: row.local === true,
      organization: machines.some((m) => !!m?.organization),
      machines: machines.map((m) => m?.computer_id).filter((id): id is string => typeof id === "string"),
      ...("logo" in row ? { logo: typeof row.logo === "string" && row.logo ? row.logo : null, logo_version: typeof row.logo_version === "string" ? row.logo_version : null } : {}),
    });
  }
  return found;
}

export type EngineWorkspaces = {
  /** Lo último que dijo el motor; `null` si no anuncia la función o aún no contestó: entonces manda la flota. */
  workspaces: () => readonly EngineWorkspace[] | null;
  /** Lo que el motor de aquí anuncia (`machine_list`), según la última lectura. */
  features: () => readonly string[];
  /** El estado de cada otra máquina que dice la vista del motor (`online`, `offline`…). */
  machineStates: () => ReadonlyMap<string, string>;
  /** Vuelve a preguntar; `true` si la lista cambió. */
  refresh: () => Promise<boolean>;
  close: () => void;
};

/**
 * `invoke` es el IPC de la ventana con el motor de aquí; `features`, lo que ese
 * motor anuncia (`machine_list`). `onChange` avisa cuando la lista cambia.
 */
export function createEngineWorkspaces(options: { invoke: Invoke; listen: Listen; features: () => Promise<readonly string[]>; onChange?: () => void }): EngineWorkspaces {
  const { invoke } = options;
  let current: EngineWorkspace[] | null = null;
  let states = new Map<string, string>();
  let announced: readonly string[] = [];
  let version: string | null = null;
  let closed = false;
  let reading: Promise<boolean> | null = null;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop: (() => void) | null = null;

  async function read(): Promise<boolean> {
    if (version === null) announced = await options.features().catch(() => [] as readonly string[]);
    if (version === null && !announced.includes(LIGHT_STATE_MACHINES_FEATURE)) {
      const had = current !== null;
      current = null;
      states = new Map();
      return had;
    }
    let answer: { version?: unknown; not_modified?: unknown; workspaces?: unknown } | null;
    try {
      answer = (await invoke("state_machines", version ? { version } : {})) as typeof answer;
    } catch {
      // Un motor que dejó de saberlo (otro motor tras actualizar) vuelve a la flota; un fallo pasajero conserva lo último.
      return false;
    }
    if (answer?.not_modified === true) return false;
    const next = parse(answer?.workspaces);
    if (!next) return false;
    version = typeof answer?.version === "string" ? answer.version : null;
    current = next;
    states = statesOf(answer?.workspaces);
    return true;
  }

  const refresh = (): Promise<boolean> => {
    if (closed) return Promise.resolve(false);
    if (reading) {
      again = true;
      return reading;
    }
    reading = read()
      .catch(() => false)
      .then((changed) => {
        if (changed && !closed) options.onChange?.();
        return changed;
      })
      .finally(() => {
        reading = null;
        if (again) {
          again = false;
          void refresh();
        }
      });
    return reading;
  };

  void options
    .listen("state.copy_changed", () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), SETTLE);
    })
    .then((unlisten) => {
      if (closed) unlisten();
      else stop = unlisten;
    })
    .catch(() => {});

  return {
    workspaces: () => current,
    machineStates: () => states,
    features: () => announced,
    refresh,
    close: () => {
      closed = true;
      clearTimeout(timer);
      stop?.();
    },
  };
}
