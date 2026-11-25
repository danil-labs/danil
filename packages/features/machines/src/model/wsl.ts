/**
 * Lo que la ventana sabe de WSL: cómo se leen los estados de `wsl_detect`, que
 * `wsl.exe` escribe en el idioma de Windows.
 */

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

/** Extensión del motor que expone huéspedes locales (`guest_children`, `guest_call`, `guest_events`, `guest_start`) sobre el relay. */
export const GUEST_MACHINES_FEATURE = "guest_machines_v1";

const REMOTE_WSL_MARKER = `:${WSL_MACHINE_PREFIX}`;

/** Una distro con motor de Danil, como la devuelve `guest_children`. */
export type WslChild = {
  id: string;
  /** El canal: `wsl`. */
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

/** Id de ruta virtual de una distro WSL que viaja por el relay de su máquina Windows anfitriona. */
export function remoteGuestMachineId(hostId: string, guestId: string): string {
  return `${hostId}:${guestId}`;
}

/** Descompone `<hostId>:wsl:<distro>` en anfitrión, id local del huésped y distro; `null` si no es ruta virtual WSL. */
export function parseRemoteGuestMachineId(id: string | null | undefined): { host: string; guest: string; distro: string } | null {
  if (!id) return null;
  const idx = id.indexOf(REMOTE_WSL_MARKER);
  if (idx <= 0) return null;
  const host = id.slice(0, idx);
  const guest = id.slice(idx + 1);
  const distro = guest.slice(WSL_MACHINE_PREFIX.length);
  if (!host || !distro || host.includes("~") || distro.includes("~")) return null;
  return { host, guest, distro };
}

export const isLocalGuestMachine = (id: string | null | undefined): id is string =>
  !!id && id.startsWith(WSL_MACHINE_PREFIX) && id.length > WSL_MACHINE_PREFIX.length && !id.includes("~");

export const isRemoteGuestMachine = (id: string | null | undefined): id is string =>
  parseRemoteGuestMachineId(id) !== null;

export const isAnyGuestMachine = (id: string | null | undefined): id is string =>
  isLocalGuestMachine(id) || isRemoteGuestMachine(id);

/**
 * Nombre legible de una máquina WSL en la flota: `<Anfitrión> - WSL`, o
 * `<Anfitrión> - WSL (<distro>)` cuando ese anfitrión tiene más de una distro.
 */
export function formatWslMachineName(hostName: string | null | undefined, child: Pick<WslChild, "name" | "distro">, siblingCount = 1): string {
  const host = hostName?.trim() ?? "";
  const label = (child.name || child.distro || "WSL").trim();
  if (!host) return siblingCount > 1 ? `WSL (${label})` : label || "WSL";
  const base = `${host} - WSL`;
  if (label === base || label.startsWith(`${base} (`)) return label;
  return siblingCount > 1 ? `${base} (${label})` : base;
}

/** Normaliza la respuesta de `guest_children`, descartando entradas inválidas o que no sean huéspedes WSL. */
export function normalizeWslChildren(raw: unknown): WslChild[] {
  if (!Array.isArray(raw)) return [];
  const out: WslChild[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!isLocalGuestMachine(id) || seen.has(id)) continue;
    const distro = (typeof row.distro === "string" && row.distro.trim()) || id.slice(WSL_MACHINE_PREFIX.length);
    if (!distro) continue;
    seen.add(id);
    const name = (typeof row.name === "string" && row.name.trim()) || distro;
    out.push({
      id,
      channel: typeof row.channel === "string" && row.channel ? row.channel : "wsl",
      distro,
      name,
      user: typeof row.user === "string" ? row.user : "",
      home: typeof row.home === "string" ? row.home : "",
      online: row.online === true,
      features: Array.isArray(row.features) ? row.features.filter((f): f is string => typeof f === "string") : [],
      contract: typeof row.contract === "string" ? row.contract : null,
      version: typeof row.version === "string" ? row.version : null,
    });
  }
  return out;
}

/** Una distribución del catálogo de Microsoft, con su tamaño y si Danil sabe prepararla. */
export type WslCatalogItem = { name: string; label: string; url: string; sha256: string; default: boolean; size: number | null; supported: boolean };

export type WslDistroUser = { uid: number; user: string; home: string };

type WslJobError = { code: string; detail: string };

/** Lo que se está haciendo (`guest-job`): lo guarda la ventana, no la pantalla. */
export type WslJob = {
  id: string;
  channel: string;
  kind: "enable" | "install" | "connect";
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
};

export type WslDistroRow = { name: string; state: string; version: number | null; default: boolean; system: boolean; child: WslChild | null };

type WslResume = { name: string; label: string; url: string; sha256: string; user: string };

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
