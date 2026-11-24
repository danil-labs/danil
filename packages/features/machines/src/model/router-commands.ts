import { type Slice } from "./fleet/index.ts";

export type Args = Record<string, unknown>;

export type Options = { headers?: HeadersInit } | undefined;

export type Invoke = (command: string, args?: Args, options?: Options) => Promise<unknown>;

export type Failure = { what: unknown; detail: unknown };

/** Content reads may use display copies; list_live_turns remains local to the window. */
export const FAN = new Set(["list_projects", "list_portfolios", "list_live_sessions", "list_spaces", "list_workspace_attention", "list_session_git", "list_task_mentions"]);

export const CONTEXT = new Set(["add_folder", "add_repo_url", "set_workspace_source", "set_root", "list_sources", "source_freshness", "source_detail", "update_source", "remove_source", "list_source_branches", "set_source_skill", "sync_workspace_context"]);

export const STORAGE = new Set(["list_storage", "reclaim_storage", "empty_build_cache", "collect_orphans"]);

export const LISTING = new Set(["list_workspaces", "workspaces_startup"]);

/** Lo que crea algo nuevo: en un workspace que esa máquina no tiene, primero lo hace suyo. */
export const CREATE = new Set(["send_message", "run_shell_command", "create_project", "clone_project", "start_project_clone"]);

/** Lo que pone una tarea de otra máquina en un space de esta ventana: el space se comparte antes. */
export const WITH_SPACE = new Set([...CREATE, "create_empty_session", "move_task_to_space", "set_task_archived"]);

/** De esta computadora por definición: sus cuentas de IA, su sesión de Danil, Radiant. */
const OF_THIS_MACHINE = /(^|_)accounts?($|_)|login|^radiant_|^danil_|^account_relay_token$/;

/** Las credenciales de la cuenta son del workspace: van a la máquina que lo atiende, como las demás órdenes con `scope`. */
const ACCOUNT_CREDENTIALS = /^account_credentials?_|^github_account_/;

export const ofThisMachine = (command: string) => OF_THIS_MACHINE.test(command) && !ACCOUNT_CREDENTIALS.test(command);

/** La sesión de Danil y Radiant son siempre de esta ventana; las cuentas de IA, de la máquina que nombra la cabecera o el id. */
export const OF_THIS_WINDOW = /^radiant_|^danil_|^account_relay_token$|^agents_session_/;

/** Las órdenes con canal pierden el canal por el relay: vuelve solo la respuesta final. */
const CHANNELS: Record<string, string> = { clone_project: "progress", list_session_git: "progress", watch_task_tree: "changes" };

export const UNKNOWN = new Set(["command", "unsupported", "command_not_allowed"]);

/** El relay no deja usar ese workspace en esa máquina. */
export const REFUSED_WORKSPACE = new Set(["workspace_not_linked", "workspace_mismatch"]);

/** Lo que abre un archivo en esta computadora: el de una tarea de otra máquina está allá. */
export const FILES = /^(site_|typst_live_)|^(open_file_external|tree_open_external)$/;

/** Los demás códigos del relay, con la frase que la ventana ya conoce (los de `proxy.rs`). */
export const SERVICE_KEYS: Record<string, string> = {
  service_busy: "shell.service.busy",
  task_busy: "shell.service.busy",
  app_unavailable: "shell.service.engine_down",
  io: "shell.service.unreachable",
  command: "shell.service.command",
  unsupported: "shell.service.command",
  command_not_allowed: "shell.service.command",
  response_too_large: "shell.service.too_large",
};

/** Cada cuánto se vuelve a preguntar la misma lectura a otra máquina mientras la ventana la repite. */
export const REFRESH_GAP = 1_500;

export const NOTIFY_AFTER = 200;

/** Cuánto vale una lectura del registro de la cuenta, y cuánto espera una lista por ella. */
export const REGISTRY_FOR = 30_000;

export const REGISTRY_WAIT = 4_000;

/** Cuánto espera lo que la ventana no relee sola (workspaces, cuentas) a lo vivo antes de contestar con lo guardado. */
export const FRESH_WAIT = 1_500;

export const FIRST_ANSWER_GRACE = 100;

export const PROGRESSIVE = new Set([...LISTING, "list_projects", "list_portfolios", "list_live_sessions", "list_spaces", "list_workspace_attention", "list_task_mentions"]);

/** En la web no hay instalador: lo que la ventana pregunta de él se contesta aquí. */
export const NO_SETUP: Record<string, unknown> = { setup_required: false, prepare_runtime: { stages: [], running: false }, list_live_turns: [] };

/** El índice de estado ligero del motor de aquí (`light_state_v1`) y sus copias de las otras máquinas (`light_state_machines_v1`). */
export const LIGHT_STATE = "light_state_v1";

export const LIGHT_COPIES = "light_state_machines_v1";

/** Lo que la barra lee del índice en vez de preguntar a cada máquina, y su recurso. */
export const INDEXED: Record<string, "tasks" | "projects"> = { list_live_sessions: "tasks", list_projects: "projects" };

/** Cuánto vale lo leído del índice de aquí sin volver a preguntar (con la versión, `not_modified`). */
export const LOCAL_INDEX_FOR = 1_000;

/** Una copia de otra máquina la rehace el motor y lo avisa (`state.copy_changed`); esto es solo por si un aviso se perdió. */
export const COPY_INDEX_FOR = 30_000;

/** Qué vuelve a leer la ventana cuando cambia la rebanada de una lectura. */
export type SliceChange = "sessions" | "projects" | "spaces" | "attention" | "mentions" | "workspaces";

export const CHANGES: Record<string, SliceChange> = {
  list_workspaces: "workspaces",
  workspaces_startup: "workspaces",
  list_live_sessions: "sessions",
  list_projects: "projects",
  list_portfolios: "projects",
  list_spaces: "spaces",
  list_workspace_attention: "attention",
  list_task_mentions: "mentions",
};

export function withoutChannel(command: string, args: Args): Args {
  const channel = CHANNELS[command];
  if (!channel || !(channel in args)) return args;
  const { [channel]: _dropped, ...rest } = args;
  return rest;
}

/** Una copia de Git sirve para mostrar el último estado, nunca para autorizar el cierre. */
export function gitSlice(slice: Slice): Slice {
  if (slice.status === "ok" || !slice.value || typeof slice.value !== "object" || Array.isArray(slice.value)) return slice;
  return { ...slice, value: Object.fromEntries(Object.entries(slice.value).map(([id, row]) =>
    [id, row && typeof row === "object" ? { ...row, stale: true } : row])) };
}
