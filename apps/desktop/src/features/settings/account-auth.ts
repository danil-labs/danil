import { canonicalAgentId, OPENCODE } from "../../../../../packages/tasks/src/agents.ts";
import type { AgentOpt } from "./accounts-store";

/** OpenCode 2 inicia sesión en el navegador; su clave de Go se agrega después. */
export function accountKeyUrl(provider: Pick<AgentOpt, "id" | "api_key"> | undefined): string | null {
  if (provider && canonicalAgentId(provider.id) === OPENCODE) return null;
  return provider?.api_key ?? null;
}

/**
 * Si el «+» de un agente queda bloqueado porque su CLI se instala por fuera.
 *
 * Sin la lista de proveedores no se sabe: la máquina está apagada y
 * `list_providers`, una lectura, no la enciende. Bloquear ahí dejaba el «+»
 * muerto con la VM apagada. Se deja agregar: `add_account` es un intent del
 * relay que enciende la máquina, igual que mandar un mensaje, y el resto del
 * flujo corre cuando ya contesta.
 */
export function addBlockedByExternal(provider: Pick<AgentOpt, "available" | "external_install_url"> | undefined): boolean {
  return !!provider && !!provider.external_install_url && !provider.available;
}
