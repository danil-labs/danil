import { type SystemId } from "@terminus/computers";
import { SEP } from "@terminus/fleet";
import { REMOTE_CHILD_FEATURE, type RemoteScope } from "@terminus/tasks";
import { createRoot, createSignal } from "solid-js";
import { invoke } from "../../lib/invoke";
import { t } from "../../lib/i18n";
import { createPref, escribirPref, leerPref } from "../../lib/prefs";
import { isMac } from "../../lib/window";
import { capabilities } from "../../lib/platform";

export { runsWorkspace } from "./runs-workspace";

/**
 * `machine_list`: `hosts` es si tiene el workspace abierto (`null`, que no se sabe
 * sin encenderla); `materializes`, si puede hacerlo suyo con el mismo id al crear ahí;
 * `refuses`, que el relay no la deja usarlo (no tiene permiso ahí).
 * `wakes`: VM administrada. `os` solo si se sabe; si falta, no se inventa.
 * `features`: lo que su motor anuncia (`status.service_features`). `power`, lo que
 * sabe la flota (`starting`: encendiéndose); `version`, su `host_version`, también apagada.
 */
export type Machine = { id: string; local: boolean; active: boolean; on: boolean; power?: "on" | "off" | "starting" | "outdated"; version?: string; hosts: boolean | null; materializes?: boolean; refuses?: boolean; wakes?: boolean; os?: SystemId; features?: readonly string[] };

/** Lo que el picker sabe del proyecto de la tarea nueva: las máquinas con su carpeta y su remoto. */
export type ProjectPlace = { name: string; machines?: string[]; remote_url?: string | null } | null | undefined;

/**
 * Por qué una máquina no puede correr la tarea nueva, o `null` si puede. Un
 * proyecto sin remoto se lleva desde la máquina donde vive mientras esté
 * encendida; apagada, sus tareas solo corren ahí.
 */
export function unavailable(m: Machine, project: ProjectPlace, all: Machine[] = machines()): "workspace" | "project" | null {
  if (m.hosts === false && !m.materializes) return "workspace";
  if (project?.machines && !project.remote_url && !project.machines.includes(m.id)) {
    const sourceOn = project.machines.some((id) => all.find((x) => x.id === id)?.on);
    if (!sourceOn) return "project";
  }
  return null;
}

// Una sola lista para toda la ventana. Señal y no `createResource`, que
// suspendería la vista entera mientras contestan.
const [machines, setMachines] = createRoot(() => createSignal<Machine[]>([]));
export { machines };

export const refetchMachines = () =>
  invoke<Machine[]>("machine_list")
    .then(setMachines)
    .catch(() => setMachines([]));

/**
 * Dónde se crea la próxima tarea, por workspace; sin entrada, en la máquina de la
 * ventana. Se recuerda con las preferencias de la ventana (`lib/prefs.ts`).
 */
const [elegidas, guardarElegidas] = createRoot(() =>
  createPref<Record<string, string>>("machines.run_on", {}),
);

/** La máquina elegida para `workspace`, si sigue en la lista y puede correr una tarea de `project`. */
export function runOn(workspace: string | null, project?: ProjectPlace): string | null {
  const id = workspace ? elegidas()[workspace] : undefined;
  const machine = id ? machines().find((m) => m.id === id) : undefined;
  if (!id || machine?.active || (machine && unavailable(machine, project))) return null;
  return machines().length === 0 || machine ? id : null;
}

export function setRunOn(workspace: string | null, id: string | null) {
  if (!workspace) return;
  const { [workspace]: _, ...resto } = elegidas();
  guardarElegidas(id ? { ...resto, [workspace]: id } : resto);
}

/** Con esta cabecera la orden va a esa máquina sin salir del workspace (`router.ts`). */
export function runOnOptions(workspace: string | null, project?: ProjectPlace) {
  const id = runOn(workspace, project);
  return id ? { headers: { "x-terminus-machine": id } } : undefined;
}

/**
 * Cómo lee la ventana las hijas remotas (`@terminus/tasks`): solo si la máquina
 * de la fila anuncia `remote_child_v1`; la de la ventana es la de las filas sin
 * `machine`. El coordinador va con el id de panel: suelto si es de esta máquina.
 */
export function remoteChildScope(): RemoteScope {
  // `machines()` se lee solo ante una fila con `remote_parent`: sin hijas remotas,
  // el riel no se suscribe a la lista de máquinas ni se recalcula cuando cambia.
  return {
    announces: (machine) => !!machines().find((m) => (machine ? m.id === machine : m.local))?.features?.includes(REMOTE_CHILD_FEATURE),
    idOf: (machine, task) => (machine === (machines().find((m) => m.local)?.id ?? null) ? task : `${machine}${SEP}${task}`),
  };
}

/**
 * El id de panel de la tarea que firmó un mensaje en `machine`. El panel pudo
 * ponerle el prefijo de la máquina que guardó el mensaje, que no es la suya.
 */
export function senderTaskId(machine: string, task: string): string {
  return remoteChildScope().idOf(machine, task.slice(task.lastIndexOf(SEP) + 1));
}

/** La máquina de la fila de una tarea del riel; la registra `App.tsx`, que es quien tiene las filas. */
let taskRowMachine: (id: string) => string | null | undefined = () => null;

export function setTaskRowMachine(lookup: (id: string) => string | null | undefined) {
  taskRowMachine = lookup;
}

/**
 * Las opciones de una orden sobre algo con id de panel (una tarea, un space, una
 * cuenta de IA): en la máquina que lo guarda. De una tarea manda su fila; si aún
 * no la hay, su prefijo.
 */
export function machineOf(id: string | null | undefined) {
  const machine = id ? (taskRowMachine(id) ?? capabilities().taskMachine?.(id) ?? null) : null;
  return machine ? { headers: { "x-terminus-machine": machine } } : undefined;
}

/** «Traer a esta Mac» o «a esta PC»: solo donde hay motor local, el escritorio. */
export const bringHereLabel = () => (isMac() ? t("shell.machines.bring_here_mac") : t("shell.machines.bring_here_pc"));
export const canBringHere = () => !!capabilities().nativeWindow;

// Los nombres viven fuera de Solid (la flota): esta señal hace que quien los pinta los vuelva a leer.
const [namesRead, setNamesRead] = createRoot(() => createSignal(0));

/** Una máquina cambió de nombre: «Ejecutar en», etiquetas y avisos lo vuelven a leer. */
export const machineNamesChanged = () => setNamesRead((n) => n + 1);

export const machineName = (id: string, local = id === "local") => {
  namesRead();
  return local ? (isMac() ? t("shell.machines.this_mac") : t("shell.machines.this_computer")) : (capabilities().machineName?.(id) ?? id);
};

const ORIGINS = "machines.carry_origins";

/** De dónde se llevó el trabajo con el que nació una tarea (`carry.ts`). */
export type CarryOrigin = {
  machine: string;
  branch: string | null;
  at: number;
  /** Al traer: la tarea de la otra máquina de la que viene, para abrirla. */
  from?: { session: string; project: string; title: string };
};

export const carryOrigin = (session: string): CarryOrigin | null => leerPref<Record<string, CarryOrigin>>(ORIGINS, {})[session] ?? null;

export function rememberOrigin(session: string, origin: CarryOrigin) {
  // Solo las últimas: la etiqueta es de la tarea recién llevada, no un historial.
  const kept = Object.entries({ ...leerPref<Record<string, CarryOrigin>>(ORIGINS, {}), [session]: origin }).slice(-50);
  escribirPref(ORIGINS, Object.fromEntries(kept));
}

/** VM administrada. Sin `wakes` (un motor anterior) vale lo de antes: lo que no es la máquina de la ventana. */
export function wakesOf(m: { wakes?: boolean; local: boolean }): boolean {
  return m.wakes ?? !m.local;
}

/** El nombre del sistema, si la fila lo trae. La barra de la tarea no lo usa. */
export function machineSystem(id: string): string | null {
  const os = machines().find((m) => m.id === id)?.os;
  return os ? t(`shell.machines.os.${os}`) : null;
}

/** Si esa máquina es una VM administrada. Una que no está en la lista y no es la de la ventana se queda como VM. */
export function machineWakes(id: string): boolean {
  const row = machines().find((m) => m.id === id);
  if (row) return wakesOf(row);
  const here = capabilities().windowMachine?.();
  if (!id || id === "local" || (here && id === here.id)) return false;
  return true;
}
