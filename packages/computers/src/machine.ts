/**
 * Reglas de producto sobre una computadora, iguales en la web y en el teléfono:
 *
 * - Abrir la app nunca enciende una máquina. Solo una acción (lista de
 *   intención) despierta una VM administrada, a través del relay.
 * - Cada máquina se muestra solo como encendida, apagada o encendiéndose; un
 *   apagado es neutro, nunca un error.
 * - Una máquina propia (una Mac, otro VPS con Seldon Host) apagada no se puede
 *   despertar: el relay no tiene a quién pedírselo.
 * - Con la VM apagada, las lecturas del espejo vuelven de la copia del relay
 *   (`cached`); sin copia, `machine_off`.
 */
import type { Computer } from "./api.ts";

/** Lo que manda el relay más lo que pone la fila de `/v1/computers`. */
export type MachineState = "unknown" | "starting" | "online" | "offline" | "stopped" | "provisioning" | "version_mismatch" | "outdated";

/** Lo único que se le muestra a la persona; `outdated` es que su motor no habla el contrato de este cliente. */
export type Power = "on" | "off" | "starting" | "outdated";

export function powerOf(state: string): Power {
  if (state === "online") return "on";
  if (state === "starting") return "starting";
  if (state === "outdated" || state === "version_mismatch") return "outdated";
  return "off";
}

/** Adaptadores del orquestador del plano de control (`KNOWN_PROVIDERS` en `computers/src/orchestrator`). */
export const MANAGED_PROVIDERS: ReadonlySet<string> = new Set(["aws-ec2"]);
/** Tipos de máquina propia que la nube no puede encender. */
export const UNWAKEABLE_KINDS: ReadonlySet<string> = new Set(["physical", "computer", "vps", "self_hosted", "byo"]);

/**
 * Si el relay puede encender esta computadora: una VM administrada sí, una
 * máquina propia no. Manda `wakeable` si el plano de control lo dice; si no,
 * `kind`; si no, el proveedor (una fila sin proveedor es de antes de que
 * existiera y es una VM). La usan la web, el escritorio y el teléfono.
 */
/** El sistema que se le puede decir a la persona. `darwin` y `win32` son los de Node. */
export type SystemId = "linux" | "macos" | "windows";

/** El sistema de una fila o de `status.os`. Cualquier otra cosa es que no se sabe. */
export function systemOf(raw: unknown): SystemId | null {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "linux") return "linux";
  if (v === "macos" || v === "darwin") return "macos";
  if (v === "windows" || v === "win32") return "windows";
  return null;
}

export function wakes(c: Pick<Computer, "provider" | "kind" | "wakeable">): boolean {
  if (typeof c.wakeable === "boolean") return c.wakeable;
  if (c.kind && UNWAKEABLE_KINDS.has(c.kind)) return false;
  return !c.provider || MANAGED_PROVIDERS.has(c.provider);
}

/** La VM que Danil administra para la persona, frente a una máquina suya conectada. */
export const isManaged = wakes;

/** Las administradas primero y luego por nombre: el orden decide qué máquina encabeza un workspace compartido. */
export function orderComputers<T extends Pick<Computer, "provider" | "kind" | "wakeable" | "name" | "computer_id">>(computers: readonly T[]): T[] {
  const label = (c: T) => c.name?.trim() || c.computer_id;
  return [...computers].sort((a, b) => Number(wakes(b)) - Number(wakes(a)) || label(a).localeCompare(label(b)));
}

/** La máquina por omisión: la VM administrada, si hay; si no, la primera. */
export function defaultComputer<T extends Pick<Computer, "provider" | "kind" | "wakeable">>(computers: readonly T[]): T | null {
  return computers.find(wakes) ?? computers[0] ?? null;
}

/**
 * Lo que enciende una computadora apagada en el relay (`INTENT_COMMANDS` de
 * `computers/src/protocol.ts`). Cualquier otra llamada con la máquina apagada
 * contesta desde el espejo o con `machine_off`.
 */
export const INTENT_COMMANDS: ReadonlySet<string> = new Set([
  // Orquestadores remotos por el MCP de Danil Machines (`connections.ts`).
  "connect_external",
  "connection_call",
  "disconnect_external",
  "send_message",
  "inject_message",
  "create_project",
  // `create_encargado` es el nombre de los motores anteriores al contrato con `agent`.
  "create_encargado",
  "create_agent",
  "create_agent_thread",
  "add_account",
  "login_account",
  "submit_login_code",
  "respond_permission",
  "answer_question",
  "answer_shell_output",
  "run_shell_command",
  "queue_ready",
  "resume_awaiting_quota",
  "recreate_task_work",
  // Clonar y crear carpetas en otra computadora, y darle acceso a un proveedor o a un host de git.
  "start_project_clone",
  "add_repo_url",
  "attach_repo",
  "start_browser_login",
  "finish_browser_login",
  "connect_git_host",
  "set_api_key",
  "add_workspace",
  "radiant_login",
  // Workspaces de la cuenta: crear aquí uno de la cuenta con su id y clonar un proyecto suyo.
  "materialize_workspace",
  "ensure_project",
  // Llevar trabajo: importar despierta el destino (`{probe: true}`) y cancelar borra allá.
  // Las partes nunca: su contenido no puede quedar guardado en `pending:`.
  "work_import",
  "work_cancel",
  // Exportar despierta la de origen al traer de vuelta (computers#16): 330 s, como cualquier intención.
  "work_export",
]);

/**
 * Acciones ligeras que, con la máquina apagada (VM o propia), el relay guarda y
 * aplica al volver a conectarse, sin encenderla (`DEFERRED_COMMANDS` de
 * `computers/src/deferred.ts`; los `deferrable: true` de `commands.json`). La
 * respuesta llega enseguida con `deferred.queued_at` y la lista ya lo refleja.
 */
export const DEFERRED_COMMANDS: ReadonlySet<string> = new Set([
  "set_task_archived",
  "delete_session",
  "rename_session",
  "set_session_pinned",
  "move_task_to_space",
]);

export const isDeferrable = (command: string) => DEFERRED_COMMANDS.has(command);

/** Lecturas que el relay guarda y contesta desde su copia (`MIRROR_COMMANDS` de `computers/src/mirror.ts`). */
export const MIRROR_COMMANDS: ReadonlySet<string> = new Set([
  "workspaces_startup",
  "list_workspaces",
  "get_profile",
  "list_projects",
  "list_spaces",
  "list_live_sessions",
  "list_archived",
  "archived_tasks",
  "list_delegated_sessions",
  "task_coordinator",
  "list_agent_status",
  "list_providers",
  "load_session",
  "load_queue",
  "task_history",
  "session_usage",
  "pending_requests",
  "list_active_turns",
  "list_live_turns",
  "list_workspace_attention",
  "list_agents",
]);

/** Qué hacer con una acción según la máquina, antes de mandarla. */
export function canAct(computer: Pick<Computer, "provider" | "kind" | "wakeable">, state: string): "now" | "wakes" | "asleep" | "outdated" {
  const power = powerOf(state);
  if (power === "on") return "now";
  if (power === "outdated") return "outdated";
  if (wakes(computer)) return "wakes";
  // Encendiéndose sin orquestador: el conector de la máquina está llegando solo.
  return power === "starting" ? "wakes" : "asleep";
}
