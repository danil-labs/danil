import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { isMac, isWindows } from "../../../../host/src/window";
import {
  INCLUIDAS,
  type Motivo,
  type Falla,
  esIncluida,
  fallasIncluidas,
} from "../../../../ui/src/lib/bundled";

export {
  INCLUIDAS,
  type Motivo,
  type Falla,
  esIncluida,
  fallasIncluidas,
};

const MOTIVOS = new Set<string>(["missing", "version_mismatch", "import_failed", "timed_out", "damaged"]);

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

/**
 * Qué arregla cada caso. Los recursos van firmados y son de solo lectura: dañados,
 * en Mac y Windows solo los repone reinstalar; en Linux, reiniciar vuelve a copiarlos.
 */
export type Remedio = "repair" | "restart" | "reinstall";
export function remedio(fallas: Falla[]): Remedio {
  if (!fallas.some((f) => f.reason === "damaged")) return "repair";
  return isMac() || isWindows() ? "reinstall" : "restart";
}
