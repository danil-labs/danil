/**
 * Lo que contestan los comandos `work_*` del motor (seldon-host,
 * `carry-contract-spec.md`). Los campos van en camelCase, como sus parámetros.
 */

/** Un archivo nuevo o ignorado con su tamaño en bytes. */
export type SizedPath = { path: string; bytes: number };

/** `work_status {project, task?}`: lo que hay sin subir en la máquina de origen. */
export type WorkStatus = {
  branch: string | null;
  head: string;
  upstream: string | null;
  /** El último commit que ya está en el remoto; `null` sin remoto. */
  remoteBase: string | null;
  remoteUrl: string | null;
  ahead: number;
  changed: number;
  untracked: number;
  /** Archivos nuevos, no ignorados, de más de 10 MiB (D2). */
  largeUntracked: SizedPath[];
  /** `suggested`: `.env*`, `.envrc`, `.dev.vars`; nunca uno de más de 1 MiB. */
  ignored: (SizedPath & { suggested: boolean })[];
  /** Carpetas ignoradas enteras, que no se recorren ni se copian. */
  ignoredSkipped: string[];
  lfs: boolean;
  submodules: boolean;
  /** Cuándo se tomó la foto, en milisegundos. */
  takenAt: number;
};

/** `work_export`: un archivo de transferencia en la máquina de origen. */
export type Exported = {
  transfer: string;
  bytes: number;
  sha256: string;
  head: string;
  wip: string | null;
  base: string | null;
};

/** `work_read_part`. */
export type Part = { data: string; eof: boolean };

/** `work_import`: con qué base nace la tarea en el destino. */
export type Imported = {
  head: string;
  /** El OID que la tarea usa como `baseRef`. */
  base: string;
  branch: string | null;
  files: string[];
  /** La base es la foto `wip`: la tarea la deshace en cambios sin commit (`unwrapSnapshot`). */
  snapshot: boolean;
};

export type ExportArgs = {
  project: string;
  task: string | null;
  operation: string;
  includeWork: boolean;
  exclude: string[];
  files: string[];
  full: boolean;
  /** La llave pública (X25519, base64) del motor de destino: el archivo sale sellado para él. */
  recipientKey?: string | null;
};

export type ImportArgs = {
  transfer: string;
  project: string;
  sha256: string;
  bytes: number;
  probe?: boolean;
  /** Al traer: crea o adelanta esa rama; si divergió, `<rama>-<máquina>`. Nunca cambia de rama. */
  branchAs?: string | null;
  /** Un proyecto sin remoto que el destino no tiene: se crea desde el bundle completo, con ese id. */
  create?: { name: string; id: string } | null;
};

/**
 * El motor de cada máquina, visto por el cliente que hace de puente: los
 * motores nunca hablan entre sí. Cada cliente lo implementa con su transporte
 * (el proxy de la ventana, el relay de la web, el del teléfono).
 */
export type CarryEngine = {
  status(machine: string, args: { project: string; task: string | null }): Promise<WorkStatus>;
  exportWork(machine: string, args: ExportArgs): Promise<Exported>;
  readPart(machine: string, args: { transfer: string; offset: number; size: number }): Promise<Part>;
  writePart(machine: string, args: { transfer: string; offset: number; data: string }): Promise<unknown>;
  importWork(machine: string, args: ImportArgs): Promise<Imported>;
  cancel(machine: string, args: { transfer: string }): Promise<unknown>;
  /** `work_key`: la llave pública de la máquina, para sellar lo que se le manda. */
  key(machine: string): Promise<{ publicKey: string }>;
};
