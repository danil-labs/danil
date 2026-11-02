/**
 * Los comandos que la app móvil manda al motor de una máquina, por cualquiera
 * de sus dos caminos: el relay de Danil Computers y el bridge de desarrollo.
 * Son funciones de ventana (`service invoke`, `commands.json`), con los nombres
 * del contrato renombrado (`agent` = agente con nombre, `provider` = Codex,
 * Claude…). Es una lista cerrada: el bridge rechaza el resto con 403 y el
 * cliente del relay ni lo envía (`command_not_allowed`). Un comando nuevo se
 * agrega aquí a propósito, nunca un pase genérico al motor, y se anota en
 * `apps/mobile/docs/mobile.md` («Lista cerrada»).
 */
export const APP_READS = [
  "list_activity",
  "read_activity",
  "read_activity_log",
  "list_workspaces",
  "list_storage",
  "list_projects",
  "list_spaces",
  "list_live_sessions",
  "list_agents",
  "list_agent_profiles",
  "list_agent_status",
  "list_providers",
  "load_session",
  "pending_requests",
  "list_active_turns",
  // Desde cuándo corre el turno: el reloj del turno en curso.
  "list_live_turns",
  "list_workspace_attention",
  // El cuadro de escribir, como el de la ventana: modelos y razonamiento,
  // permisos, la barra de comandos, las menciones y la rama base.
  "list_models",
  "list_permission_modes",
  "list_slash_menu",
  "list_mentions",
  "project_base_branches",
  // Archivar pregunta antes si algo lo impide (cambios sin guardar).
  "task_blockers",
  // Las cuentas de IA de cada máquina y su consumo.
  "list_accounts",
  "account_status",
  "account_limits",
  // El fondo de los chats del workspace, detrás de la conversación.
  "chat_background",
  // Lo enriquecido del chat, como en la ventana: las visualizaciones del agente
  // (su árbol `terminus-chat-visuals`), y las imágenes, archivos y adjuntos que
  // el mensaje nombra por su ruta en la máquina.
  "tree_show",
  // Los archivos de la tarea: sus árboles y la lista de cada uno. Se leen igual que en la ventana,
  // sin encender nada que no esté encendido, y un archivo se abre con `tree_show`.
  "list_task_trees",
  "tree_files",
  // Un visual que no cabe de una vez: por partes de 512 KiB, con sus imágenes incrustadas.
  "chat_visual_part",
  "preview_file",
  "attachment_preview",
  // Carpeta nueva y clonar en la máquina: dónde quedan y cómo va un clon.
  "get_project_directory",
  "project_clone_status",
  // Llevar el trabajo de una carpeta a la máquina donde nace la tarea: qué hay sin subir y la llave para sellar.
  "work_status",
  "work_key",
  // El PR de cada tarea en su tarjeta: git por carpeta, primero las tareas visibles.
  "list_session_git",
  // La UI nueva (`APP_FEATURES`): Mantener despierta, los puertos abiertos y las
  // archivadas de todas las carpetas. Un motor anterior que no las conoce apaga
  // solo esa función (`isUnknownCommand`).
  "keep_awake_status",
  "list_ports",
  "archived_tasks",
] as const;

export const APP_ACTIONS = [
  "send_message",
  "inject_message",
  "stop_turn",
  "respond_permission",
  // Cambiar el modo de permisos con el turno en marcha: el turno vivo no relee el del cuadro.
  "set_permission_mode",
  // Cambiar de CLI dentro de la tarea (`provider_handoff_v1`): el siguiente
  // turno abre sesión nueva con la conversación como texto o retoma la aparcada.
  "set_session_provider",
  "answer_question",
  "mark_task_seen",
  // La tarjeta de vista previa: Fijar, Archivar y Cambiarle el nombre.
  "set_session_pinned",
  "rename_session",
  "set_task_archived",
  "finish_task",
  "delete_session",
  // `!` en el cuadro: un comando de terminal en la carpeta de la tarea.
  "run_shell_command",
  "stop_shell_command",
  // Adjuntar desde el teléfono: el archivo viaja en base64 y queda en la máquina.
  // `guardar_adjunto` acepta documentos y el nombre original (motor con
  // `attachment_documents_v1`); el de imágenes queda para los motores anteriores.
  "guardar_imagen_pegada",
  "guardar_adjunto",
  "prepare_attachments",
  // Iniciar sesión en una cuenta de IA en otra máquina (enlace y código) y cerrarla.
  "add_account",
  "login_account",
  "submit_login_code",
  "cancel_login",
  "discard_account",
  "remove_account",
  // El próximo turno corre con esta cuenta. No enciende la máquina: el uso solo se muestra si ya está encendida.
  "set_active_account",
  // «Nueva carpeta» y «Clonar repo» desde la tarea nueva: el clon corre en segundo
  // plano y avisa con el evento `project_clone`.
  "create_project",
  "start_project_clone",
  "cancel_project_clone",
  // Llevar trabajo (`@terminus/carry`): exportar en el origen, copiar por partes, importar y cancelar.
  "work_export",
  "work_read_part",
  "work_write_part",
  "work_import",
  "work_cancel",
  // Una tarea nueva en otra máquina dentro del space de esta: el space se comparte antes con la cuenta.
  "share_space",
  // Los espacios desde el teléfono: crear, renombrar y eliminar. Eliminar enseña
  // antes lo que se detiene o descarta (`space_delete_preview`) y manda de vuelta
  // eso mismo (`seen`): si el motor ve algo más, no borra.
  "create_space",
  "rename_space",
  "space_delete_preview",
  "delete_space",
  // Mantener despierta la máquina de la tarea: Siempre (`on`), Con agentes (`agent`) o Apagado (`off`).
  "set_keep_awake",
] as const;

export const APP_COMMANDS: readonly AppCommand[] = [...APP_READS, ...APP_ACTIONS];

export type AppCommand = (typeof APP_READS)[number] | (typeof APP_ACTIONS)[number];

export function isAppCommand(command: string): command is AppCommand {
  return (APP_COMMANDS as readonly string[]).includes(command);
}

export function isAppAction(command: string): boolean {
  return (APP_ACTIONS as readonly string[]).includes(command);
}

/**
 * Lo que la UI nueva enciende por función, con los comandos que usa. El
 * primero es la lectura que la prueba: si la máquina no la conoce, la función
 * no se enseña para esa máquina (`CommandSupport.feature`).
 */
export const APP_FEATURES = {
  spaces: ["list_spaces", "create_space", "rename_space", "space_delete_preview", "delete_space"],
  keep_awake: ["keep_awake_status", "set_keep_awake"],
  ports: ["list_ports"],
  archived: ["archived_tasks"],
} as const satisfies Record<string, readonly AppCommand[]>;

export type AppFeature = keyof typeof APP_FEATURES;

/** Estados de atención que avisan cuando una tarea entra en ellos. */
export const NEEDS_YOU = ["approving", "asked", "failed"] as const;
