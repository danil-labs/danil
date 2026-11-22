/**
 * GitHub en la cuenta de Danil: la conexión es de la persona y Danil refleja
 * dónde está instalada la App. La ventana habla con su motor (`github_account_*`);
 * la web, con el Worker (`web/github-account.ts`).
 */

/** `account`: esta tarjeta reemplaza la local. `local`: se ve la de esta máquina (sin sesión, motor viejo, o la local sigue mandando). */
export type GithubAccountMode = "unknown" | "account" | "local";

/** `session`: esta máquina tiene sesión de Danil para el workspace (`null` mientras se pregunta). */
/** `connect`: el «Conectar» de la cabecera de la sección (Control de código), cuando se puede conectar. */
export type GithubAccountState = {
  mode: GithubAccountMode;
  connected: boolean;
  reauthorize: boolean;
  session: boolean | null;
  connect?: () => void;
};

/** Cada cuánto se pregunta tras abrir GitHub, y hasta cuándo. */
export const POLL_MS = 3_000;

export const POLL_FOR_MS = 10 * 60_000;

export const PLANS_URL = "https://danil.ai/planes";

export type WorkspaceAccountOf = { signed_in?: boolean };
