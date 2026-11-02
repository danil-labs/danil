#!/usr/bin/env node
/**
 * Que cada comando registrado tenga quien lo invoque, y cada `invoke` un comando.
 *
 * Registrado es lo que atiende la ventana (`src-tauri/src/extracted/mod.rs`) más
 * lo que el contrato del motor declara (`src-tauri/crates/engine-protocol/commands.json`).
 *
 * ## La otra mitad del puente
 *
 * `bridge.mjs` cubre los nombres de evento. Esto cubre la mitad que aquel deja
 * escrita como pendiente: **los nombres de comando de `invoke()`**. El agujero es
 * el mismo y peor de tapar, porque `invoke<T>("...")` es una **aserción** y no una
 * validación — el genérico describe lo que uno espera de vuelta, no lo que Rust
 * promete, y el nombre del comando es una cadena suelta que no mira nadie:
 *
 *   - `tsc` la da por buena: para TypeScript es un `string` cualquiera.
 *   - `cargo` la da por buena: para Rust el comando existe y está registrado.
 *   - El único que se entera es el usuario, al pulsar el botón.
 *
 * Y se entera mal. Un comando que no existe rechaza la promesa con un mensaje del
 * runtime de Tauri, así que la pantalla se queda como estaba o aparece un error
 * que no se parece a «esto no está conectado».
 *
 * ## Los dos sentidos son dos defectos distintos, y por eso los dos fallan
 *
 * A diferencia de `bridge.mjs` —que solo exige que lo escuchado se emita, porque
 * emitir sin oyente es una decisión legítima— aquí las dos direcciones son
 * defectos:
 *
 *   - **Invocado y no registrado**: revienta al abrir esa pantalla. Es el que
 *     duele.
 *   - **Registrado y no invocado**: es código muerto que aparenta estar vivo.
 *     Mantiene compilando —y por tanto vigente— la cadena entera que cuelga de
 *     él, y el `invoke_handler` es justo el sitio donde nadie mira si algo sobra,
 *     porque quitarlo no rompe nada.
 *
 * Si un comando se registra a propósito antes de tener interfaz que lo use, va en
 * `SIN_INTERFAZ` con el motivo escrito al lado. Que cueste una línea es el punto.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { relative } from "node:path";
// `.pathname` en Windows da `/C:/…` y revienta.
import { fileURLToPath } from "node:url";
import { walkFiles } from "../git.mjs";
import { COMANDOS_PENDIENTES } from "../engine-pending.mjs";

const LIB = fileURLToPath(new URL("../../src-tauri/src/extracted/mod.rs", import.meta.url));
const CONTRACT = fileURLToPath(new URL("../../src-tauri/crates/engine-protocol/commands.json", import.meta.url));
// Extensiones del motor fuera de la huella (`engine-protocol` `EXTENSIONS`): las despacha
// la ventana igual que el contrato.
const EXTENSIONS = fileURLToPath(new URL("../../src-tauri/crates/engine-protocol/extensions", import.meta.url));
const WEB = fileURLToPath(new URL("../../src", import.meta.url));
/**
 * **Todos los árboles de interfaz, no uno.**
 *
 * Hoy hay uno solo. La lista existe porque un árbol nuevo al lado —otra
 * superficie, un puerto en curso— se lleva los `invoke` fuera de la vista de
 * este guarda, que seguiría dando verde sobre lo que queda. Mismo motivo que en
 * `bridge.mjs`.
 *
 * Aquí el riesgo de quedarse ciego es menor que allá, porque el conteo de
 * `invoke` sin explicar ya falla por su cuenta: un comando registrado que nadie
 * invoca se reporta igual.
 */
const ARBOLES = [WEB].filter((d) => existsSync(d));

/**
 * Comandos registrados que todavía no invoca nadie, con el porqué. Vacío es lo
 * normal: el registro es la lista de lo que la app hace, no de lo que podría.
 */
const SIN_INTERFAZ = {
  delete_session: "contrato legacy; la ventana exige task_lifecycle_v1 con previa y consentimiento",
  // La columna derecha de la tarea nueva se quitó: sus archivos viven dentro de la tarea. Siguen en el contrato del motor.
  create_empty_session: "la pedía la columna derecha de la tarea nueva, que ya no existe; queda en el contrato del motor",
  // Extensión de orquestadores: las pide el relay de Danil Computers (MCP remoto), no una pantalla.
  connect_external: "la pide el MCP remoto de Danil Computers por el relay",
  connection_call: "la pide el MCP remoto de Danil Computers por el relay",
  disconnect_external: "la pide Danil Computers al revocar una conexión",
  run_activity_command: "el CLI ejecuta mantenimiento; los clientes solo consultan sus registros",
  import_chat_background: "la ventana manda el fondo reducido como `data:` (`set_chat_background`); queda en el contrato congelado para motores anteriores",
  git_host_pending_setup: "el CLI del motor lo usa para completar la conexión; permanece en el contrato congelado",
  finish_git_host_setup: "el CLI del motor espera la instalación; la ventana actualiza al regresar",
  set_session_pinned: "el gesto de fijar lo implementa la tarea de frontend en paralelo",
  set_session_provider: "la UI de cambio de proveedor llega con las tareas de escritorio y teléfono; el proxy ya la despacha",
  // Lo pide el conector del motor al recibir `memory.changed` del relay (seldon-host #108).
  sync_workspace_memory: "la sincronización de la memoria la programa el conector; ninguna pantalla la pide",
  // Los pide el conector al recibir `credentials.changed` y `credentials.reseal` del relay (seldon-host #144, #145).
  sync_account_credentials: "la reconciliación de las credenciales la programa el conector; ninguna pantalla la pide",
  reseal_account_credential: "sellar para otra máquina lo pide el relay al conector; ninguna pantalla lo hace",
  github_account_changed: "tirar la caché del token de GitHub lo pide el conector con `credentials.changed`; ninguna pantalla lo hace",
  // El backend prepara los árboles; esta lectura aún no tiene pantalla.
  session_worktree: "el árbol y sus notas aún no se pintan en ninguna pantalla",
  // El renombre lo hace hoy el agente con `git branch -m`; la app lo reconcilia.
  worktree_rename_branch: "el renombre al entregar aún no tiene gesto en pantalla",
  // Lo incluido se repara entero con `install_tool {"tool":"bundled-work-tools"}`.
  set_workspace_terminal_theme: "el selector de terminal no se ofrece hoy (docs/visual-system.md); el comando es del motor",
  install_base_tool: "lo usa bootstrap::prepare_runtime; la ventana repara lo incluido con install_tool",
  remove_tool: "lo incluido con Terminus no se desinstala; queda en el contrato congelado",
  remove_google_drive: "quitar el binario de Drive es de Configuración; el onboarding solo desconecta",
  // Del contrato de seldon-host dev; la ventana los llama en terminus#243.
  google_drive_desktop_status: "lo llama el alta de Drive con la app oficial (terminus#243)",
  install_google_drive_desktop: "lo llama el alta de Drive con la app oficial (terminus#243)",
  open_google_drive_desktop: "lo llama el alta de Drive con la app oficial (terminus#243)",
  start_local_model: "elegir el modelo no lo carga: lo levanta el turno que lo usa (models::ensure_serving)",
  tree_typst_target: "lo pide typst_live::typst_live_open desde el Rust de la ventana: el webview nunca da la ruta de arranque",
  danil_client_token: "lo pide proxy::account_relay_token desde el Rust de la ventana: la credencial de máquina no sale del motor",
  import_chat_background_data: "lo usaba «Usar este workspace aquí», ya borrado; el fondo llegará desde la cuenta de Danil en la fase 2 (docs/account-workspace.md)",
  remove_provider: "sin forma confiable de saber qué instaló Terminus, se quitó el botón",
  remove_gh: "sin forma confiable de saber qué instaló Terminus, se quitó el botón",
  // Sin pantalla hasta el metabuscador del workspace: una archivada no se
  // desarchiva ni tiene historial por carpeta.
  list_archived: "el índice de archivadas por carpeta espera al metabuscador del workspace",
  backup_task_work: "respaldar vivía en el Historial de tareas, que salió de la ventana",
  restore_task_work: "restaurar vivía en el Historial de tareas, que salió de la ventana",
  create_agent_thread: "los temas antiguos se conservan para lectura; las conversaciones nuevas nacen como tareas",
  sources_in_use: "traer material ya no espera a que acabe el turno que lo lee; el motor lo usa para no cambiar de rama bajo un turno",
  materialize_workspace: "lo pide la web por el relay a la máquina elegida (features/machines/router.ts); la ventana local abre sus propios workspaces",
  ensure_project: "lo pide la web por el relay antes de crear una tarea en otra máquina; el motor lo llama solo en send_message y run_shell_command",
  sync_workspace: "lo llama el conector del motor al recibir workspace.changed del relay",
  share_space: "lo pide el router de máquinas (features/machines/router.ts, `native`) antes de crear algo en otra máquina desde un space de esta",
  danil_workspace_link:
    "la sincronización sigue a la sesión de Danil: el motor vincula todos los workspaces; sin interruptor por workspace",
  danil_workspace_unlink:
    "la sincronización sigue a la sesión de Danil: el motor vincula todos los workspaces; sin interruptor por workspace",
  danil_workspace_link_status:
    "la sincronización sigue a la sesión de Danil: el motor vincula todos los workspaces; sin interruptor por workspace",
  tree_diff: "el diff de un turno se pintaba bajo cada turno del chat; ahora «Editó N archivos» abre el panel de la tarea en «Cambios» (tree_changes)",
  // `docs/agents.md` § Estado observable: el comando de agregación existe
  // para que el riel deje de sondear; el riel mismo no está construido.
};

/**
 * `invoke<Tipo>("nombre"` y `invoke("nombre"`.
 *
 * El genérico no puede llevar paréntesis (`[^()]`) y por eso no se escapa: con
 * `[\s\S]*?` el motor sigue buscando el `>` que le falta línea abajo y termina
 * emparejando un `invoke` con el nombre de otro que está veinte líneas más
 * lejos. Anidado sí —`<Record<string, X>>`— porque expande hasta el `>` que le
 * cuadre.
 */
const INVOCA = /\binvoke\s*(?:<[^()]*?>)?\s*\(\s*"([^"]+)"/g;
/** Toda aparición de `invoke`, para cazar las que la de arriba no explica. */
const INVOCA_TODO = /\binvoke\s*[<(]/g;

function linea(texto, index) {
  return texto.slice(0, index).split("\n").length;
}

// ------------------------------------------------------- lo que Rust registra

const lib = readFileSync(LIB, "utf8");
const bloque = lib.match(/generate_handler!\s*\[([\s\S]*?)\]/);
if (!bloque) {
  console.error(
    `No encuentro \`generate_handler![...]\` en ${relative(process.cwd(), LIB)}.\n` +
      `Ahí vive el registro de comandos; sin él este chequeo no mira nada.`,
  );
  process.exit(2);
}

const registrados = new Map();
for (const l of bloque[1].split("\n")) {
  const sin = l.replace(/\/\/.*$/, "").trim().replace(/,$/, "");
  if (!sin) continue;
  // `modulo::comando` — al frontend solo le llega el último segmento.
  const m = sin.match(/^([\w:]+::)?(\w+)$/);
  if (m) registrados.set(m[2], (m[1] ?? "").replace(/::$/, "") || "lib");
}

// Lo que atiende el motor: su registro no vive en este repositorio, así que
// manda el contrato congelado (`commands.json`).
const manifest = JSON.parse(readFileSync(CONTRACT, "utf8"));
for (const command of manifest.commands) {
  if (!["invoke", "stream", "desktop"].includes(command.kind)) continue;
  if (!registrados.has(command.name)) registrados.set(command.name, `contrato (${command.path})`);
}
for (const file of existsSync(EXTENSIONS) ? readdirSync(EXTENSIONS).filter((f) => f.endsWith(".json")) : []) {
  for (const command of JSON.parse(readFileSync(`${EXTENSIONS}/${file}`, "utf8")).commands ?? []) {
    if (!["invoke", "stream"].includes(command.kind)) continue;
    if (!registrados.has(command.name)) registrados.set(command.name, `extensión ${file} (${command.path})`);
  }
}

// ------------------------------------------------- lo que el frontend invoca

const invocados = new Map();
const dinamicos = [];
for (const { dir, f } of ARBOLES.flatMap((dir) =>
  [...walkFiles(dir, [".ts", ".tsx"])].map((f) => ({ dir, f })),
)) {
  const texto = readFileSync(f, "utf8");
  const rel = relative(dir, f);
  // Se lee el archivo entero y no línea a línea: el genérico de `invoke<T>` se
  // parte en varias líneas cuando el tipo de vuelta es un objeto escrito ahí.
  const explicados = new Set();
  for (const m of texto.matchAll(INVOCA)) {
    explicados.add(m.index);
    if (!invocados.has(m[1])) invocados.set(m[1], []);
    invocados.get(m[1]).push(`${rel}:${linea(texto, m.index)}`);
  }
  // Lo que quede sin explicar es un `invoke` con el nombre en una variable: no
  // se puede seguir, así que se reporta en vez de darlo por comprobado.
  for (const m of texto.matchAll(INVOCA_TODO)) {
    if (!explicados.has(m.index)) dinamicos.push(`${rel}:${linea(texto, m.index)}`);
  }
}

// ------------------------------------------------------------------ el fallo

const fantasmas = [...invocados].filter(([n]) => !registrados.has(n) && !(n in COMANDOS_PENDIENTES));
const llegados = Object.keys(COMANDOS_PENDIENTES).filter((n) => registrados.has(n));
const muertos = [...registrados.keys()]
  .filter((n) => !invocados.has(n) && !(n in SIN_INTERFAZ))
  .sort();

if (dinamicos.length) {
  console.error(
    `\`invoke\` con el nombre en una variable — no puedo seguirlo:\n` +
      dinamicos.map((d) => `  ${d}`).join("\n") +
      `\n\nEl nombre del comando va como literal para que esto pueda comprobarlo.\n`,
  );
}

for (const [n, donde] of fantasmas) {
  console.error(`Nadie registra «${n}» — lo invoca ${donde.join(", ")}`);
}
for (const n of llegados) {
  console.error(`«${n}» ya está en el contrato: quítalo de scripts/engine-pending.mjs.`);
}
for (const n of muertos) {
  console.error(`Nadie invoca «${n}» — lo registra ${registrados.get(n)}`);
}

if (!fantasmas.length && !muertos.length && !dinamicos.length && !llegados.length) {
  console.log(
    `Los ${registrados.size} comandos registrados los invoca alguien` +
      (Object.keys(SIN_INTERFAZ).length
        ? `, salvo ${Object.keys(SIN_INTERFAZ).length} con motivo escrito`
        : "") +
      `.`,
  );
  process.exit(0);
}

console.error(
  `\nEl nombre de un comando es una cadena suelta en las tres capas: \`tsc\` no lo\n` +
    `mira, \`cargo\` tampoco, e \`invoke<T>\` es una aserción y no una validación.\n` +
    `Invocar lo que nadie registra revienta al abrir esa pantalla; registrar lo\n` +
    `que nadie invoca deja vivo —y compilando— todo lo que cuelga de ahí.`,
);
process.exit(1);
