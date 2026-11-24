import { t } from "./i18n";
import { df } from "./format";

// La forma del alias la escribe `workspace/alias.rs`; cambiar una sin la otra
// deja el alias pintado en crudo.
const ALIAS = /^([a-z]+)-(\d{2})(\d{2})(\d{2})(?:-([2-9]\d*))?$/;

/**
 * Cómo se lee el trabajo de una tarea: la rama que el agente creó, y mientras
 * no haya ninguna, el alias espacial con que nació («Algedi · 10 sep»).
 */
export function workLabel(branch?: string | null, alias?: string | null): string {
  const rama = branch?.trim();
  if (rama) return rama;
  const partes = ALIAS.exec(alias?.trim() ?? "");
  if (!partes) return "";
  const [, astro, yy, mm, dd, sufijo] = partes;
  const fecha = new Date(2000 + Number(yy), Number(mm) - 1, Number(dd));
  if (Number.isNaN(fecha.getTime())) return "";
  const nombre = astro.charAt(0).toUpperCase() + astro.slice(1);
  return t("worktrees.alias.label", {
    name: sufijo ? `${nombre} ${sufijo}` : nombre,
    date: df({ day: "numeric", month: "short" }).format(fecha),
  });
}
