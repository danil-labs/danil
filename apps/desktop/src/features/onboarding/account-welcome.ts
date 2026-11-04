/**
 * «Conecta tu cuenta de Danil» en el primer arranque: si ya se respondió en
 * esta computadora. Va en la carga inicial; lo demás, en `welcome-workspace.ts`.
 */

/** Clave nueva, no heredada: guarda `connected` o `local`. */
export const ACCOUNT_WELCOME_KEY = "danil.onboarding.account_choice";

export type AccountWelcomeChoice = "connected" | "local";

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Ya se eligió una vez en esta computadora: la pantalla no vuelve. */
export function accountWelcomeAnswered(store: Pick<Storage, "getItem"> | null = storage()): boolean {
  const value = store?.getItem(ACCOUNT_WELCOME_KEY);
  return value === "connected" || value === "local";
}

export function rememberAccountWelcome(choice: AccountWelcomeChoice, store: Pick<Storage, "setItem"> | null = storage()) {
  try {
    store?.setItem(ACCOUNT_WELCOME_KEY, choice);
  } catch {
    // Sin almacenamiento la pantalla vuelve a salir; no bloquea el alta.
  }
}

/** Solo en el alta de una computadora sin workspaces y sin respuesta guardada. */
export const offerAccountWelcome = (firstRun: boolean, answered: boolean) => firstRun && !answered;
