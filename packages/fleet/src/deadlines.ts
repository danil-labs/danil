/**
 * Toda espera tiene tope y termina con un error con nombre. Los plazos son los
 * del relay (`computers`): lecturas 60 s allá y 15 s aquí, para que la rebanada
 * se marque «sin respuesta» antes; acciones 60 s; lo que enciende una VM 330 s.
 */
import { INTENT_COMMANDS } from "../../computers/src/index.ts";

export const READ_DEADLINE = 15_000;
export const ACTION_DEADLINE = 60_000;
export const INTENT_DEADLINE = 330_000;

export type Deadlines = { read: number; action: number; intent: number };
export const DEADLINES: Deadlines = { read: READ_DEADLINE, action: ACTION_DEADLINE, intent: INTENT_DEADLINE };

const READ = /^(list_|load_|read_|get_|preview_)|_status$|^(workspaces_startup|archived_tasks|session_usage|task_history|session_folder|setup_required|check_environment|account_limits|project_base_branches|chat_background|file_size|pending_requests|task_coordinator|turn_authors|danil_sessions|danil_workspace_account|danil_connect_options|account_relay_token|account_credentials_list|account_exists|artifact_history|attachment_preview|office_preview|session_worktree)$|^tree_(changes|diff|files|folder|show|summary|office_preview|typst_target)$/;

// El panel de una tarea (árbol, cambios, vistas previas) solo lee: abrirla no enciende su VM.
// `archived_tasks` es una lectura (el relay la guarda en su espejo): con la máquina apagada contesta la copia, no la enciende.
export type CommandClass = "read" | "action" | "intent";

export function classOf(command: string): CommandClass {
  if (INTENT_COMMANDS.has(command)) return "intent";
  return READ.test(command) ? "read" : "action";
}

export const isRead = (command: string) => classOf(command) === "read";

/**
 * Lo que la ventana pide sola, sin un gesto de la persona: marcar una tarea
 * vista, vigilar su árbol, sondeos, tamaños, ramas y vistas previas. No son
 * lecturas (no tienen rebanada ni copia en el relay), pero tampoco encienden
 * una VM apagada: con la máquina apagada fallan con `machine_off`. Antes caían
 * en «acción», y abrir o volver a la pestaña de la web encendía la VM.
 */
export const PASSIVE: ReadonlySet<string> = new Set([
  "watch_task_tree", "unwatch_task_tree", "mark_task_seen", "cli_task_opened", "site_sweep", "service_poll",
  "kn_pending", "kn_cloud_state", "source_freshness", "skill_source_freshness", "source_detail",
  "install_size", "provider_download_size", "machine_list", "env_secrets_list", "tasks_awaiting_quota",
  "git_host_projects", "git_host_areas", "git_host_available_areas", "repo_branches", "publications_of",
  "chat_visual_part", "artifact_read_part", "tree_read_part", "has_mcp_app", "space_delete_preview", "task_lifecycle_preview",
  "local_runtime", "local_downloads", "wsl_state", "launcher_state", "zotero_bib_links",
  "check_git_host", "check_google_drive", "check_integration", "check_mcp",
  "guest_children", "guest_channels", "guest_events",
  // El disco de la máquina: medirlo o limpiarlo nunca la enciende.
  "list_storage", "reclaim_storage", "empty_build_cache", "collect_orphans",
]);
