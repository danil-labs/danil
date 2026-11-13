import { canonicalAgentId, OPENCODE } from "../../../../../packages/tasks/src/agents.ts";
import type { AgentOpt } from "./accounts-store";

/** OpenCode 2 inicia sesión en el navegador; su clave de Go se agrega después. */
export function accountKeyUrl(provider: Pick<AgentOpt, "id" | "api_key"> | undefined): string | null {
  if (provider && canonicalAgentId(provider.id) === OPENCODE) return null;
  return provider?.api_key ?? null;
}
