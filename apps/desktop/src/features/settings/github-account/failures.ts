/**
 * Los fallos de GitHub de la cuenta con una sola forma en la ventana y en la web:
 * `detail` es `credentials.error.<código>`, como los manda el motor, y `what` la
 * frase del catálogo de ese código.
 */
import { t } from "../../../lib/i18n.ts";

/** La forma de `Failure` (`ui/Failure.tsx`), sin importar su JSX: la web y sus pruebas cargan esto en Node. */
type Failure = { what: unknown; detail: string };

/** Los códigos del Worker (y `offline` del motor) que la pantalla sabe decir. */
const KNOWN = new Set([
  "github_not_connected", "workspace_not_linked", "not_linked", "github_machine_removed", "github_reauthorize", "github_unavailable", "github_disabled", "license_required", "invalid_return_to", "not_found", "offline",
]);

/** Sin estos no hay GitHub de la cuenta aquí: un motor que aún no tiene los comandos, sin sesión, sin licencia o un Worker sin la App. */
const NOT_HERE = new Set(["command", "unsupported", "command_failed", "command_not_allowed", "not_found", "http_404", "not_linked", "workspace_not_linked", "github_disabled", "license_required"]);

/** Estos no se le dicen a la persona: el motor o el Worker aún no tienen GitHub de la cuenta (o no contesta: `command_failed` por el relay). */
const SILENT = new Set(["command", "unsupported", "command_failed", "command_not_allowed", "http_404", "github_disabled"]);

export function githubAccountFailure(code: string | null): Failure {
  const c = code ?? "offline";
  const key = KNOWN.has(c) ? (c === "not_linked" ? "workspace_not_linked" : c) : "generic";
  return { what: t(`providers.github.account.error.${key}`), detail: `credentials.error.${c}` };
}

/** El código de un fallo del motor o de la web: `credentials.error.x` → `x`; los del puente (`command`) tal cual. */
export function githubAccountCode(e: unknown): string | null {
  let detail = e && typeof e === "object" && "detail" in e ? (e as { detail: unknown }).detail : null;
  // Por el relay, el `Failure` del motor de allá llega dentro de `detail`.
  if (detail && typeof detail === "object" && "detail" in detail) detail = (detail as { detail: unknown }).detail;
  if (typeof detail !== "string" || !detail) return null;
  return detail.startsWith("credentials.error.") ? detail.slice("credentials.error.".length) : detail;
}

/** Lo que se le enseña a la persona: la frase del código conocido o la de la operación (`what`), nunca el código a secas. */
export function githubAccountFailureOf(e: unknown, what?: unknown): unknown {
  const code = githubAccountCode(e);
  if (!code || KNOWN.has(code)) return code ? githubAccountFailure(code) : e;
  return { what: what ?? t("providers.github.account.error.generic"), detail: `credentials.error.${code}` };
}

export const notHere = (e: unknown): boolean => NOT_HERE.has(githubAccountCode(e) ?? "");
/** Si el fallo se calla en vez de mostrarse. */
export const silent = (e: unknown): boolean => SILENT.has(githubAccountCode(e) ?? "");
/** El camino de la cuenta no llega (máquina de organización por el relay): si queda la conexión local, no es un error del panel. */
export const accountPathDown = (e: unknown): boolean =>
  silent(e) || ["command_failed", "unavailable", "not_linked", "workspace_not_linked"].includes(githubAccountCode(e) ?? "");
