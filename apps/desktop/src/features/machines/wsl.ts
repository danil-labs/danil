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
