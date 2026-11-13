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

/** Los proveedores de la máquina de la cuenta: los ya sabidos, o leídos ahora (apagada la lista no llega). */
export async function providersFor(call: Call, known: AgentOpt[] | null, options?: { headers: Record<string, string> }): Promise<AgentOpt[]> {
  return known ?? ((await call("list_providers", {}, options)) as AgentOpt[]);
}

/** Lo que deja el «+»: la cuenta creada siempre; sus proveedores, o por qué no llegaron. */
export type Added = { account: Account; providers: AgentOpt[] } | { account: Account; providers: null; failure: unknown };

/**
 * El «+», hasta antes del login. `add_account` es un intent: apagada, la flota
 * enciende la máquina primero. Ya creada, la cuenta no se pierde aunque sus
 * proveedores no lleguen: «Conectar» la retoma con `providersFor`, sin otra alta.
 */
export async function addAccount(call: Call, provider: string, known: AgentOpt[] | null, options?: { headers: Record<string, string> }): Promise<Added> {
  const account = (await call("add_account", { provider, label: "" }, options)) as Account;
  try {
    return { account, providers: await providersFor(call, known, options) };
  } catch (failure) {
    return { account, providers: null, failure };
  }
}
