// Tipos del puente con Rust: cambiar campos requiere conservar la compatibilidad serializada.
// Este módulo no importa componentes para evitar arrastrar JSX a consumidores de tipos.

import type { Frase, Prosa } from "./prose";

export type Project = {
  id: string;
  name: string;
  // null hereda el nodo de gobierno del workspace.
  node: string | null;
  sources: string[];
  // Se conserva para leer proyectos guardados por versiones anteriores.
  portfolio?: string | null;
  // Puede faltar en proyectos pendientes de la migración v13; no implica una carpeta vacía.
  working_directory?: string | null;
  // Se usa como respaldo cuando working_directory todavía no está disponible.
  work_tree?: string | null;
  created_at: number;
  updated_at: number;
  // El conteo se calcula al leer y no forma parte de los datos guardados.
  sessions: number;
  // Se calcula al leer; crear o quitar .git puede cambiarlo sin modificar el proyecto guardado.
  kind: "git" | "folder";
  cloud?: "google_drive" | "one_drive" | "icloud" | "dropbox" | "box" | "other" | null;
  // Las máquinas con su carpeta, cuando el panel junta varias (`@terminus/fleet`).
  machines?: string[];
  // El remoto del que otra máquina lo clona; un motor anterior no lo dice.
  remote_url?: string | null;
};

export function carpetaDeTrabajo(p: Pick<Project, "working_directory" | "work_tree">) {
  return p.working_directory ?? p.work_tree ?? null;
}

export type Source = {
  id: string;
  kind: string;
  identity: string;
  name: string;
  location: string;
  branch: string | null;
  // etiqueta ya incluye la rama; usar name si la interfaz la muestra por separado.
  etiqueta: string;
  parent: string | null;
  // Adjuntar material no autoriza a instalar sus skills; la proyección requiere habilitarlas.
  skills: boolean;
  added_at: number;
  path: string;
  missing: boolean;
  root: boolean;
  project_attachable: boolean;
  projects: string[];
  sessions: number;
  // Epoch en segundos, expresado como cadena; ausente en fuentes locales.
  traido_en?: string;
};

// El alcance agent queda bajo el proyecto, no bajo una cuenta del proveedor.
export type MemoriaScope =
  | { kind: "workspace" }
  | { kind: "project" }
  | { kind: "agent"; name: string };

// Sin agente, la entrada es de la persona y task también es null.
export type MemoriaOrigen = {
  workspace: string;
  project: string;
  task: string | null;
  provider: string | null;
  handler: string | null;
  branch: string | null;
  commit: string | null;
};

// file es la identidad: escribir el mismo nombre reemplaza la idea en su archivo.
export type MemoriaEntrada = {
  file: string;
  // La etiqueta es libre; no debe validarse contra una taxonomía cerrada.
  type: string | null;
  modified: string;
  origin: MemoriaOrigen;
  text: string;
  in_index: boolean;
};

export type MemoriaIndice = {
  lines: number;
  bytes: number;
  line_limit: number;
  byte_limit: number;
};

export type MemoriaListado = {
  entries: MemoriaEntrada[];
  total: number;
  index: MemoriaIndice;
};

export type ArbolEnTarea = {
  // La clave se comparte con Msg.code; no equivale al nombre visible del árbol.
  key: string;
  name: string;
  path: string;
  origin: "declarada" | "clon" | "externa";
  kind: "git" | "folder" | "kn";
  cloud?: "google_drive" | "one_drive" | "icloud" | "dropbox" | "box" | "other" | null;
  source: string | null;
  // null significa que no hay remoto; no representa un fallo de lectura.
  remote: string | null;
  // Vacía en carpetas sin git y cuando HEAD está despegado.
  branch: string;
  // Puede faltar si la tarea no tiene un árbol propio.
  alias?: string | null;
  missing: boolean;
  // null significa que no se pudo medir; no equivale a cero.
  dirty_before: number | null;
  // Mide cambios de la tarea contra su base; no incluye ni se suma a dirty_before.
  // null significa que no se pudo medir.
  changed: number | null;
  // Los commits incorporados a la base no se suman a changed.
  base_drift: Deriva;
};

// base_changed cuenta commits incorporados; drift cuenta commits pendientes.
// unknown no garantiza que la base esté intacta y no debe tratarse como current.
export type Deriva = {
  status: "current" | "drift" | "base_changed" | "unknown";
  behind: number | null;
  // Los asuntos vienen del repositorio y no se traducen.
  recent_subjects: string[];
};

export type CodeRange = {
  tree: string;
  before: string;
  after: string;
};

export type Agent = {
  id: string;
  label: string;
  available: boolean;
  path: string | null;
  version: string | null;
  // Instalar un agente no garantiza que la app pueda conducirlo; driver=false impide ofrecerlo en el chat.
  driver: boolean;
  limits: boolean;
};

export type ModelOption = {
  // Se envía sin transformar al agente; en OpenCode puede incluir el proveedor.
  id: string;
  label: string;
  // La nota de la app se traduce; el texto recibido del CLI se conserva.
  note: Prosa | null;
  efforts: string[];
  default_effort: string | null;
  // null significa que no aplica la distinción de saldo por modelo.
  gratis: boolean | null;
};

export type AgentModels = {
  provider: string;
  models: ModelOption[];
  // El catálogo de respaldo no es una respuesta reciente del agente.
  fallback: boolean;
};

// El backend entrega todos los modos en orden, incluidos los no disponibles.
// Filtrarlos antes de armar el menú puede desalinearlo del ciclo del atajo.
export type ModoDePermiso = {
  // Identificadores guardados en la tarea: manual, ediciones y auto.
  id: string;
  // Es una frase del catálogo; resolverla en Rust fijaría la lengua antes de conocer la ventana.
  label: Frase;
  // null permite elegir el modo; una frase comunica por qué no está disponible.
  falta: Frase | null;
  // Lo decide el backend; inferirlo desde el primer modo disponible puede elegir otro.
  por_omision: boolean;
};

export type HandlerDefinition = {
  name: string;
  description: string;
  instructions: string;
  tools: string[];
  model: string | null;
  origin: string;
  // null representa una declaración suelta, sin carpeta propia.
  folder: string | null;
  providers: string[];
  own: boolean;
  // null para declaraciones del repositorio; no implica alcance del workspace.
  own_scope: HandlerScope | null;
  // Las declaraciones gestionadas por Radiant son de solo lectura.
  managed?: boolean;
  package?: string;
};

// La apariencia vive en app data; cambiarla no modifica las instrucciones del repositorio.
export type AgentProfile = {
  // Vacío conserva el nombre declarado que guardan las tareas.
  display_name: string | null;
  // Vacío deriva la figura del nombre.
  body: string | null;
  background: string | null;
  // Vacío conserva la figura derivada.
  avatar: string | null;
  // Fracción de opacidad de 0 a 1, no porcentaje.
  veil: number;
  // null conserva la selección del chat; modificar el perfil no reinicia la conversación.
  provider: string | null;
  model: string | null;
  effort: string | null;
  hidden: boolean;
};

export type HandlerScope =
  | { kind: "workspace" }
  | { kind: "project"; id: string };

// eclipsado_por significa que otra declaración gana el nombre; la nueva no será la que se lea.
export type CreatedHandler = {
  agent: HandlerDefinition;
  eclipsado_por: { origin: string; reason: string } | null;
};

// Los archivos rechazados deben seguir visibles para no confundir un error de lectura con ausencia.
export type HandlerList = {
  agents: HandlerDefinition[];
  rechazados: { origin: string; reason: string }[];
};

export type HandlerMemory = {
  name: string;
  source: string;
  key: string;
  identity: string;
  scope_source: string;
  reach: string;
  store: string | { slot: string };
  dir: string | null;
  identity_dir?: string;
  synced: boolean;
  across_projects: boolean;
  status: "ok" | "external" | "synced-by-name" | "legacy-by-name" | "in-doubt" | "unavailable";
  reason?: string;
  entries: number;
  legacy?: string;
  legacy_entries?: number;
  server?: string;
};

export type HandlerRequest = {
  kind: "mcp" | "memory" | "tools" | "network";
  slot?: string;
  access?: string;
  why?: string | null;
  name?: string;
  host?: string;
  state: "approved" | "requested_not_granted" | "requested_not_managed";
  server?: string;
  granted_access?: string;
  allowed_tools?: string[];
  reason?: string;
};

export type HandlerRequests = {
  handler: string;
  source: string;
  key: string;
  digest: string | null;
  dirty: boolean;
  approval: { digest: string; at: number; by: string; revoked_at: number | null } | null;
  stale: string | null;
  requests: HandlerRequest[];
};

export type HandlerApproval = { mcp?: string; tool?: string; "accept-hints"?: string };
export type HandlerRelease = {
  handler: string | null;
  identity: string;
  released: boolean;
  quarantine: Record<string, unknown> | null;
  digest: string | null;
};

// Estos estados no distinguen pensar de ejecutar herramientas.
export type HandlerStatus = "working" | "awake" | "asleep";

// live_tasks puede superar uno; el backend no impone exclusividad.
export type HandlerStatusRow = {
  name: string;
  status: HandlerStatus;
  // Minutos desde la última tarea actualizada; null si nunca lanzó una.
  minutes_since_last_turn: number | null;
  live_tasks: number;
};

export type BloqueoDeCarpeta = { folder: string; origin: string; repository: boolean };

export type AgenteDeMaquina = {
  agent: HandlerDefinition;
  profile: AgentProfile;
  folders: string[];
  // Sin lista cubre todas las carpetas, incluidas las que se creen después.
  all_folders: boolean;
  blocked: BloqueoDeCarpeta[];
  // Un nombre ocupado en el catálogo impide extender este agente de proyecto a otras carpetas.
  catalog_taken: string | null;
};

export type AgenteDelRepositorio = {
  agent: HandlerDefinition;
  profile: AgentProfile;
  folders: string[];
};

export type CatalogoDeAgentes = {
  own: AgenteDeMaquina[];
  repository: AgenteDelRepositorio[];
};

// restore solo repone folders si la lista actual coincide con expected; de lo contrario devuelve conflict.
// null significa todas las carpetas.
export type CambioDeCarpetas =
  | { kind: "add"; folder: string }
  | { kind: "remove"; folder: string }
  | { kind: "restore"; expected: string[] | null; folders: string[] | null };
