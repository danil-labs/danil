import type { Frase } from "../../../../apps/desktop/src/lib/prose";


export type Workspace = {
  id: string;
  name: string;
  /**
   * Su raíz de gobierno: el id de la única fuente de contexto propia del
   * workspace. `null` es uno recién creado; su estado vacío es el que la pide.
   */
  context_root: string | null;
  /** En qué lengua se pinta la app aquí. `null` hereda la de la máquina. */
  lengua: string | null;
  /** Perfil opcional que decide el idioma de salida del agente. */
  lengua_de_salida: string | null;
  /** Qué tema pinta terminal, código y diff. `null` es el de por omisión. */
  terminal_theme: string | null;
  /**
   * Dónde nacen los árboles de las tareas nuevas. `null` es la carpeta de
   * datos de la app; los árboles ya creados no se mueven al cambiarlo.
   */
  worktrees_root: string | null;
  /** Con qué modo de permisos arranca lo nuevo. `null` es el último elegido a mano. */
  default_permission_mode: string | null;
  /** «Usar el GitHub de esta computadora». Un motor anterior no lo manda. */
  host_github?: boolean;
  git_host: string | null;
  remote: string | null;
  /** Dónde vive la memoria de este workspace — espejo de `memoria::Proveedor`. */
  memoria: MemoriaProveedor;
  created_at: number;
  /** Cuántas tareas hay dentro. Se cuenta en disco al leer, no se guarda. */
  sessions: number;
  /** Ruta de la copia dentro del workspace. `null` pinta las iniciales. */
  logo: string | null;
  /** La cuenta de Danil con que se ve desde la web y el teléfono; un motor anterior no la manda. */
  danil?: { user_id: string; email?: string | null; name?: string | null } | null;
};

/**
 * El proveedor de memoria del workspace. `origen` es solo de dónde sale
 * (esquema y host, o el programa), nunca el bloque: ningún cliente lo
 * reconstruye ni lo reenvía.
 */
export type MemoriaProveedor =
  | { tipo: "local" }
  | { tipo: "mcp_externo"; origen: { url: string } | { command: string }; lectura_escritura: boolean };

/**
 * Una migración de los datos en disco que hace el motor.
 * `moved` es lo que se movió y `problems` lo que quedó fuera; nada de esto se
 * pinta, vive en `migrations.json`. El tipo se queda porque el contrato con
 * Rust lo trae: describirlo mal rompe el puente sin aviso.
 */
export type Run = {
  version: number;
  at: number;
  moved: { what: string; count: number }[];
  problems: string[];
};

/**
 * Lo que devuelven `workspaces_startup` y `list_workspaces`. Se declara una
 * sola vez: una segunda copia compila igual con el campo renombrado y falla al
 * primer clic, en el sitio que nadie miró.
 */
export type Startup = {
  workspaces: Workspace[];
  /** `null` en el primer arranque: todavía no hay ninguno. */
  active: string | null;
  /** Todas las que corrieron, en orden. Los datos pasaron por más de una. */
  migrations: Run[];
  /**
   * Por qué esta ventana no puede abrir estos datos. Con esto puesto,
   * `workspaces` y `active` vienen vacíos y NO significan «primer arranque»:
   * no hay que abrir el alta, hay que tapar la app.
   */
  bloqueo?: Frase;
};
