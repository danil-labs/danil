/**
 * Lo que la ventana sabe de WSL: los tipos que devuelve `wsl_detect` y cómo se
 * leen sus estados, que `wsl.exe` escribe en el idioma de Windows.
 */

export type WslDistro = {
  name: string;
  state: string;
  version: number | null;
  default: boolean;
};

export type WslStatus = {
  default_distro: string | null;
  default_version: number | null;
  kernel: string | null;
};

export type WslDetection = {
  distros: WslDistro[];
  default_distro: string | null;
  default_version: number | null;
  status: WslStatus | null;
};

export type WslTone = "success" | "error" | "warning" | "neutral" | "off" | "working";
export type WslState = "running" | "stopped" | "installing" | "other" | "unknown";

const RUNNING = ["running", "en ejecución", "en ejecucion"];
const STOPPED = ["stopped", "detenido", "detenida"];
const INSTALLING = ["installing", "instalando"];

/** El estado y el tono de un texto que `wsl.exe` puede escribir localizado. */
export function wslState(state: string): { state: WslState; tone: WslTone } {
  const clean = state.trim().toLowerCase();
  if (RUNNING.includes(clean)) return { state: "running", tone: "success" };
  if (STOPPED.includes(clean)) return { state: "stopped", tone: "off" };
  if (INSTALLING.includes(clean)) return { state: "installing", tone: "working" };
  if (clean) return { state: "other", tone: "neutral" };
  return { state: "unknown", tone: "neutral" };
}

const FAILURES = new Set(["wsl_missing", "wsl_timeout", "wsl_failed", "unsupported", "io"]);

/** El código de `wsl_detect`; un fallo desconocido cae en `wsl_failed`. */
export function wslFailureCode(error: unknown): string {
  let raw = "";
  if (typeof error === "string") {
    raw = error;
  } else if (error && typeof error === "object") {
    const { code, detail } = error as { code?: unknown; detail?: unknown };
    if (typeof code === "string") raw = code;
    else if (typeof detail === "string") raw = detail;
    else if (detail && typeof detail === "object" && typeof (detail as { code?: unknown }).code === "string") {
      raw = (detail as { code: string }).code;
    }
  }
  const code = raw.trim();
  return FAILURES.has(code) ? code : "wsl_failed";
}

/** Comandos que se muestran tal cual: no se traducen. */
export const WSL_INSTALL = "wsl --install";
export const WSL_INSTALL_UBUNTU = "wsl --install -d Ubuntu";
/** Lo que la persona copia si falta Lima en la Mac. */
export const LIMA_INSTALL = "brew install lima";

/** El id de máquina de una distro conectada: `wsl:Ubuntu`. Sólo existe en esta PC. */
export const WSL_MACHINE_PREFIX = "wsl:";

/** Una distro con motor de Danil, como la devuelve `guest_children`. */
export type WslChild = {
  id: string;
  /** `wsl` o `lima`. */
  channel: string;
  distro: string;
  name: string;
  user: string;
  home: string;
  online: boolean;
  features: string[];
  contract: string | null;
  version: string | null;
};

/** Una distribución del catálogo de Microsoft, con su tamaño y si Danil sabe prepararla. */
export type WslCatalogItem = { name: string; label: string; url: string; sha256: string; default: boolean; size: number | null; supported: boolean };

export type WslDistroUser = { uid: number; user: string; home: string };

export type WslJobError = { code: string; detail: string };

/** Lo que se está haciendo (`guest-job`): lo guarda la ventana, no la pantalla. */
export type WslJob = {
  id: string;
  channel: string;
  kind: "enable" | "install" | "connect" | "create";
  target: string;
  label: string;
  user: string | null;
  step: string;
  done: number | null;
  total: number | null;
  speed: number | null;
  paused: boolean;
  lines: string[];
  error: WslJobError | null;
  finished: boolean;
  started_at: number;
  /** Lima: cuántas carpetas de esta Mac ve la VM, según el sondeo. */
  mounts?: number | null;
};

export type WslDistroRow = { name: string; state: string; version: number | null; default: boolean; system: boolean; child: WslChild | null };

export type WslResume = { name: string; label: string; url: string; sha256: string; user: string };

/** Todo lo que muestra «Linux en esta PC» (`wsl_state`). */
export type WslLinuxState = {
  wsl: "ready" | "missing" | "reboot" | "virtualization" | "unsupported" | "unknown";
  distros: WslDistroRow[];
  job: WslJob | null;
  resume: WslResume | null;
  detail: string | null;
};

const RESERVED = new Set(["root", "daemon", "bin", "sys", "sync", "games", "man", "nobody", "admin", "ubuntu", "messagebus", "systemd-network"]);

/** Las reglas de Ubuntu para un usuario nuevo; la ventana las vuelve a revisar. */
export function wslUserProblem(user: string): "empty" | "reserved" | "format" | null {
  if (!user) return "empty";
  if (RESERVED.has(user)) return "reserved";
  return /^[a-z][a-z0-9_-]{0,31}$/.test(user) ? null : "format";
}

/** Lo que escribe la persona, ajustado a un usuario de Linux: «Tu Nombre» → «tu-nombre». */
export function linuxUserSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s.]+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 32);
}
