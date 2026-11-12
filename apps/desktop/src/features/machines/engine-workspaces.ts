/**
 * Los workspaces que el motor de esta computadora conoce de las otras máquinas
 * de la persona (`light_state_machines_v1`): `state_machines` los da del disco,
 * de todas las sesiones de Danil que tiene el motor, sea cual sea el workspace
 * abierto. Se relee con `state.copy_changed` y la versión que ya se tiene.
 */

export const LIGHT_STATE_MACHINES_FEATURE = "light_state_machines_v1";

/** Un workspace que el motor conoce. `local`: existe en esta computadora; `organization`: lo sirve el servidor de una organización. */
export type EngineWorkspace = { id: string; name: string | null; local: boolean; organization: boolean; machines: string[] };

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type Listen = (event: string, handler: () => void) => Promise<() => void>;

/** Los avisos llegan por copia (tareas, proyectos, la máquina): varios seguidos se leen una vez. */
const SETTLE = 150;

type Row = { workspace?: unknown; name?: unknown; local?: unknown; machines?: unknown };

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
    });
  }
  return found;
}

export type EngineWorkspaces = {
  /** Lo último que dijo el motor; `null` si no anuncia la función o aún no contestó: entonces manda la flota. */
  workspaces: () => readonly EngineWorkspace[] | null;
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
  let version: string | null = null;
  let closed = false;
  let reading: Promise<boolean> | null = null;
  let again = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop: (() => void) | null = null;

  async function read(): Promise<boolean> {
    if (version === null && !(await options.features().catch(() => [] as readonly string[])).includes(LIGHT_STATE_MACHINES_FEATURE)) {
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
    refresh,
    close: () => {
      closed = true;
      clearTimeout(timer);
      stop?.();
    },
  };
}
