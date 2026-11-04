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

/** El id de máquina de una distro conectada: `wsl:Ubuntu`. Sólo existe en esta PC. */
export const WSL_MACHINE_PREFIX = "wsl:";

/** Una distro con motor de Danil, como la devuelve `wsl_children`. */
export type WslChild = {
  id: string;
  distro: string;
  name: string;
  user: string;
  home: string;
  online: boolean;
  features: string[];
  contract: string | null;
  version: string | null;
};

/** Una distro que se puede instalar (catálogo de Microsoft). */
export type WslCatalogItem = { name: string; label: string; url: string; sha256: string; default: boolean };

export type WslDistroUser = { uid: number; user: string; home: string };

/** El avance de una instalación (`wsl-progress`). */
export type WslProgress = { target: string; step: string; done: number | null; total: number | null; line: string | null };

/** Los pasos en el orden en que se muestran. */
export const WSL_DISTRO_STEPS = ["download", "verify", "register", "user"] as const;
export const WSL_ENGINE_STEPS = ["check", "deps", "download", "verify", "engine", "service", "connect"] as const;

const RESERVED = new Set(["root", "daemon", "bin", "sys", "sync", "games", "man", "nobody", "admin", "ubuntu", "messagebus", "systemd-network"]);

/** Las reglas de Ubuntu para un usuario nuevo; la ventana las vuelve a revisar. */
export function wslUserProblem(user: string): "empty" | "reserved" | "format" | null {
  if (!user) return "empty";
  if (RESERVED.has(user)) return "reserved";
  return /^[a-z][a-z0-9_-]{0,31}$/.test(user) ? null : "format";
}

/** Los distros del sistema (Docker, Rancher) se listan pero no se ofrecen. */
export const isSystemDistro = (name: string) => /^(docker-desktop|docker-desktop-data|rancher-desktop|rancher-desktop-data|podman-machine)/i.test(name);

/** El código de un fallo de los comandos `wsl_*` de la ventana. */
export function wslErrorCode(error: unknown): string {
  if (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string") return (error as { code: string }).code;
  if (typeof error === "string") return error;
  return "wsl_failed";
}

export function wslErrorDetail(error: unknown): string {
  if (error && typeof error === "object") {
    const d = (error as { detail?: unknown }).detail;
    if (typeof d === "string") return d;
  }
  return "";
}
