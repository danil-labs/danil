import { t } from "../../lib/i18n";
import { isMac, isWindows } from "../../lib/window";
import type { EnvReport } from "../settings/environment-store";

/**
 * Lo que trae Terminus ya preparado. No se instala ni se ofrece por separado:
 * si algo falla se dice qué función queda afectada y se repara entero.
 */
export const INCLUIDAS = ["git", "python", "agent-browser", "ripgrep", "uv", "computer-use"] as const;

/** Los motivos de `check.json`; `damaged` solo sale de la verificación completa. */
export type Motivo = "missing" | "version_mismatch" | "import_failed" | "timed_out" | "damaged";
const MOTIVOS = new Set<string>(["missing", "version_mismatch", "import_failed", "timed_out", "damaged"]);

/** `id` es `null` cuando el motor no dijo cuál: el fallo es del entorno entero. */
export type Falla = { id: string | null; reason: Motivo };

export const esIncluida = (id: string) => (INCLUIDAS as readonly string[]).includes(id);

/** La función que deja de servir, no el nombre del programa. */
export function funcion(id: string | null): string {
  switch (id) {
    case "git":
      return t("setup.functions.git");
    case "python":
      return t("setup.functions.python");
    case "agent-browser":
      return t("setup.functions.agent_browser");
    case "ripgrep":
      return t("setup.functions.ripgrep");
    case "uv":
      return t("setup.functions.uv");
    case "computer-use":
      return t("setup.functions.computer_use");
    default:
      return t("setup.functions.environment");
  }
}

/** Un motivo que no se conoce cuenta como faltante. */
export const motivoConocido = (valor?: string): Motivo => (valor && MOTIVOS.has(valor) ? (valor as Motivo) : "missing");

export function motivo(reason: Motivo): string {
  switch (reason) {
    case "version_mismatch":
      return t("setup.functions.reason.version_mismatch");
    case "import_failed":
      return t("setup.functions.reason.import_failed");
    case "timed_out":
      return t("setup.functions.reason.timed_out");
    case "damaged":
      return t("setup.functions.reason.damaged");
    default:
      return t("setup.functions.reason.missing");
  }
}

const motivoDe = (valor: unknown, timedOut?: boolean): Motivo | null => {
  if (typeof valor === "string" && MOTIVOS.has(valor)) return valor as Motivo;
  return timedOut ? "timed_out" : null;
};

/**
 * Lo incluido que no pasó la comprobación, según el reporte y las etapas.
 * Un motor anterior aún manda etapas `git`, `python`… sin motivo: cuentan como faltantes.
 */
export function fallasIncluidas(reporte: EnvReport | null, fallidas: string[] = []): Falla[] {
  const fallas = new Map<string | null, Falla>();
  for (const r of reporte?.items ?? []) {
    if (!esIncluida(r.id)) continue;
    const reason = motivoDe(r.reason, r.timed_out) ?? (!r.ok && r.required ? "missing" : null);
    if (reason) fallas.set(r.id, { id: r.id, reason });
  }
  for (const stage of fallidas) {
    if (esIncluida(stage) && !fallas.has(stage)) fallas.set(stage, { id: stage, reason: "missing" });
  }
  if (!fallas.size && fallidas.some((s) => s !== "platform")) fallas.set(null, { id: null, reason: "missing" });
  return [...fallas.values()];
}

/**
 * Qué arregla cada caso. Los recursos van firmados y son de solo lectura: dañados,
 * en Mac y Windows solo los repone reinstalar; en Linux, reiniciar vuelve a copiarlos.
 */
export type Remedio = "repair" | "restart" | "reinstall";
export function remedio(fallas: Falla[]): Remedio {
  if (!fallas.some((f) => f.reason === "damaged")) return "repair";
  return isMac() || isWindows() ? "reinstall" : "restart";
}
