import { lazy } from "solid-js";
import type { AccountList } from "../queries/accounts-store";

// Las claves en la cuenta de Danil: un trozo aparte, solo para agentes con API key.
export const CredentialsInUse = lazy(() => import("./AccountCredentials").then((m) => ({ default: m.CredentialsInUse })));

export const LocalKeysBanner = lazy(() => import("./AccountCredentials").then((m) => ({ default: m.LocalKeysBanner })));

/** Cuánto se espera a que el CLI diga algo antes de ofrecer la Terminal. */
export const ESPERA_ANTES_DE_LA_TERMINAL_MS = 15_000;

export function normalizarListaDeCuentas(res: AccountList | null | undefined, provider: string): AccountList {
  return res && Array.isArray(res.accounts)
    ? res
    : { provider, env_var: "", shared_credential: null, secret_note: null, active: null, accounts: [] };
}

/** Por qué no se puede agregar otra cuenta (en la máquina elegida, o en la lista), o `null` si sí. */
export function segundaCuentaBloqueada(l: AccountList | null, targetMachine?: string): string | null {
  if (!l) return null;
  if (targetMachine) {
    if (l.shared_credential_by_machine) return l.shared_credential_by_machine[targetMachine] ?? null;
    if (!l.shared_credential) return null;
    return l.accounts.some((a) => a.machines?.some((m) => m.machine === targetMachine)) ? l.shared_credential : null;
  }
  return !l.shared_credential || l.accounts.length === 0 ? null : l.shared_credential;
}
