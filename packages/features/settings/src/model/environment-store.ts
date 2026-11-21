/**
 * Qué hay instalado, según Rust. Espeja `src-tauri/src/environment/env.rs`; el tipo lo
 * consumen `Setup.tsx` y `Environment.tsx`.
 */

export type Requirement = {
  id: string;
  label: string;
  ok: boolean;
  /** Si es `false`, que falte no impide trabajar. */
  required: boolean;
  detail: string;
  remedy: string | null;
  /** `ORIGEN_SISTEMA` | `ORIGEN_APP` | `ORIGEN_BUNDLE` | null si no hay ninguno. */
  source: string | null;
  /** Cuánto ocupa NUESTRA copia, exista o no la del sistema. */
  bytes: number | null;
  /** Si la app puede y debe traerlo: cuando no está en el sistema, o cuando la copia de la app no es la de esta build. */
  installable: boolean;
  /** Nuestra copia sobra porque la del sistema la tapa. */
  redundant: boolean;
  /** Qué instalador administra la fila; Git no lleva ninguno. */
  manager: "agent" | "github" | "tool" | null;
  /** Está puesto y su `--version` no contestó a tiempo. Un servicio anterior no lo manda. */
  timed_out?: boolean;
  /** Lo incluido que no pasó la comprobación: `missing`, `version_mismatch`, `import_failed`, `timed_out` o `damaged`. */
  reason?: string | null;
};

/**
 * Lo que Rust pone en `Requirement.source` (`environment/env.rs`, `runtime/agents/`,
 * `delivery/github.rs`). Son valores del backend, no frases de interfaz: NO se traducen.
 * La etiqueta pintada sale del catálogo comparando contra estos; traducirlos
 * deja la comparación sin encontrar nada y la fila sin etiqueta, sin error.
 */
export const ORIGEN_SISTEMA = "del sistema";
export const ORIGEN_APP = "instalado por la app";
export const ORIGEN_BUNDLE = "empaquetado con la app";

export type Dependency = {
  id: string;
  label: string;
  version: string;
  location: string;
  bytes: number | null;
};

export type EnvReport = {
  items: Requirement[];
  ready: boolean;
  blocked: boolean;
  reason: string | null;
  /** De qué commit salió este binario. Lo sella `build.rs`. */
  build: string;
  engineBuild?: string;
  /** Dependencias administradas que esta versión debe preparar. */
  bootstrap: string[];
  /** El runtime nunca se preparó en esta máquina: se enseña la preparación. */
  firstRun: boolean;
  /** Las dependencias sin las que la preparación no deja seguir. */
  essential: string[];
  /** Versiones fijadas por la release para el runtime que administra Terminus. */
  runtimeVersions: Record<string, string>;
};

/**
 * Por dónde va la preparación de una herramienta del toolchain. Espeja
 * `toolchain::Progress` y llega por el evento `"toolchain"`; los campos van en
 * inglés porque lo que viaja en un evento cruza dos procesos.
 */
export type Preparacion = {
  id: string;
  /** `sizing` · `downloading` · `installing` · `done` · `error`. */
  kind: "sizing" | "downloading" | "installing" | "done" | "error";
  done: number;
  /** `0` mientras no se sepa cuánto hay que bajar. */
  bytes: number;
  failure: string | null;
};
