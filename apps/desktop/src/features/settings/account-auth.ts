import { canonicalAgentId, OPENCODE } from "../../../../../packages/tasks/src/agents.ts";
import type { Account, AgentOpt } from "./accounts-store";

/** OpenCode 2 inicia sesión en el navegador; su clave de Go se agrega después. */
export function accountKeyUrl(provider: Pick<AgentOpt, "id" | "api_key"> | undefined): string | null {
  if (provider && canonicalAgentId(provider.id) === OPENCODE) return null;
  return provider?.api_key ?? null;
}

/** Proveedor desconocido (máquina apagada) no bloquea: `add_account` la enciende. */
export function addBlockedByExternal(provider: Pick<AgentOpt, "available" | "external_install_url"> | undefined): boolean {
  return !!provider && !!provider.external_install_url && !provider.available;
}

type Call = (command: string, args?: Record<string, unknown>, options?: { headers: Record<string, string> }) => Promise<unknown>;

/**
 * El «+» de una cuenta, hasta antes del login. `add_account` es un intent: apagada,
 * la flota enciende la máquina primero. Ya encendida se leen sus proveedores si no se
 * sabían: sin ellos no se sabe si instalar el CLI ni cómo conectarlo. Que no lleguen
 * es un error para la persona, no un login a ciegas.
 */
export async function addAccount(call: Call, provider: string, known: AgentOpt[] | null, options?: { headers: Record<string, string> }): Promise<{ account: Account; providers: AgentOpt[] }> {
  const account = (await call("add_account", { provider, label: "" }, options)) as Account;
  const providers = known ?? ((await call("list_providers", {}, options)) as AgentOpt[]);
  return { account, providers };
}
