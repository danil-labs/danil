/**
 * Los ids de agente de OpenCode y sus alias, en un solo sitio para la ventana
 * y el teléfono. Espeja `agents::canonical_agent_id` del motor: datos y
 * motores anteriores siguen mandando `opencode-zen` y `opencode-local`.
 */

export const OPENCODE = "opencode";
export const FREE_ROUTER_PREFIX = "free-router-";
export const FREE_ROUTER_OPENCODE = `${FREE_ROUTER_PREFIX}opencode`;
export const FREE_ROUTER_MODEL = "danil-free/reflection/beam-free";

/** Ids retirados: la tarea conserva su historia, pero no se puede continuar con ellos. */
export const RETIRED_AGENTS: readonly string[] = ["opencode-local"];

/** Un modelo que corre por el Free Router (o uno gratuito de OpenCode de antes). */
export function isFreeRouterModel(model: string | null | undefined): boolean {
  if (!model) return false;
  return model.startsWith("danil-free/") || (model.startsWith("opencode/") && model.endsWith("-free"));
}

/** Si la fila es del Free Router: no tiene cuenta y no sale entre las conexiones. */
export function isFreeRouterAgent(id: string | null | undefined): boolean {
  return !!id && id.startsWith(FREE_ROUTER_PREFIX);
}

export function isRetiredAgent(id: string | null | undefined): boolean {
  return !!id && RETIRED_AGENTS.includes(id);
}

/**
 * El id actual de un agente guardado o recibido. `opencode-zen` con un modelo
 * del Free Router pasa a `free-router-opencode`; sin él, a `opencode`. Un id
 * retirado se devuelve tal cual para que la pantalla lo diga no disponible.
 */
export function canonicalAgentId(id: string, model?: string | null): string;
export function canonicalAgentId(id: string | null | undefined, model?: string | null): string | null | undefined;
export function canonicalAgentId(id: string | null | undefined, model?: string | null): string | null | undefined {
  if (id === "opencode-zen") return isFreeRouterModel(model) ? FREE_ROUTER_OPENCODE : OPENCODE;
  if (id === "opencode-local" && isFreeRouterModel(model)) return FREE_ROUTER_OPENCODE;
  return id;
}
