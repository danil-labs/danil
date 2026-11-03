/**
 * Una sesión de Danil por cuenta en esta computadora, y la cuenta de cada
 * workspace (`danil_sessions`, `danil_workspace_*`). Un motor anterior no trae
 * `danil_sessions`: las lecturas devuelven `null` y la ventana vuelve a la
 * cuenta única de `danil-account.ts`. Sin dependencias de Solid: las pruebas de
 * Node lo importan.
 */
import { invoke } from "../../lib/invoke.ts";
import { type DanilConnectStatus, failureCode } from "./danil-account.ts";

export type DanilSessionInfo = {
  /** El id de la persona en Danil; `null` mientras no se sabe. */
  account: string | null;
  email: string | null;
  /** Nombre de la persona en su cuenta. */
  name: string | null;
  /** Ruta de la foto de la cuenta guardada en esta computadora. */
  photo: string | null;
  computer_id: string | null;
  /** Nombre de esta computadora en esa cuenta. */
  computer_name?: string | null;
  default: boolean;
  /** Los workspaces de aquí que son de esta cuenta. */
  workspaces: string[];
  status: "connected" | "pending" | "error";
  online: boolean;
  user_code?: string | null;
  verification_uri_complete?: string | null;
  expires_at?: number | null;
  error?: string | null;
};

export type WorkspaceAccount = {
  /** La cuenta del workspace; `null` si no es de ninguna (nadie la eligió). */
  account: string | null;
  email: string | null;
  /** Si esa cuenta tiene sesión aquí; sin ella no se sincroniza. */
  signed_in: boolean;
  linked: boolean;
  /** Al cambiarla: por qué no se unió a la nueva (`workspace_id_taken`…). */
  error?: string | null;
};

/** `null`: el motor no conoce el comando; cualquier otro fallo se conserva. */
export async function readSessions(): Promise<DanilSessionInfo[] | null> {
  try {
    const list = await invoke<DanilSessionInfo[]>("danil_sessions");
    if (!Array.isArray(list)) throw { detail: "invalid_response" };
    return list;
  } catch (e) {
    if (failureCode(e) === "command") return null;
    throw e;
  }
}

/** `null` con un motor anterior; la cuenta de `workspace` (sin él, el abierto). */
export async function readWorkspaceAccount(workspace?: string | null): Promise<WorkspaceAccount | null> {
  try {
    const result = await invoke<WorkspaceAccount>("danil_workspace_account", workspace ? { workspace } : {});
    if (!result || !(result.account === null || typeof result.account === "string") || typeof result.signed_in !== "boolean" || typeof result.linked !== "boolean") throw { detail: "invalid_response" };
    return result;
  } catch (e) {
    if (failureCode(e) === "command") return null;
    throw e;
  }
}

export const connectedSessions = (list: DanilSessionInfo[] | null | undefined) =>
  (list ?? []).filter((s) => s.status === "connected");

/** El inicio de sesión en curso o fallido, si hay uno. */
export const pendingSession = (list: DanilSessionInfo[] | null | undefined) =>
  (list ?? []).find((s) => s.status !== "connected") ?? null;

/** Una sesión por el id de la persona o por su `computer_id`, como la nombra el motor. */
export function sessionOf(list: DanilSessionInfo[] | null | undefined, account: string | null | undefined) {
  if (!account) return null;
  return connectedSessions(list).find((s) => s.account === account || s.computer_id === account) ?? null;
}

export const defaultSession = (list: DanilSessionInfo[] | null | undefined) => {
  const connected = connectedSessions(list);
  return connected.find((s) => s.default) ?? connected[0] ?? null;
};

/** Cómo se nombra una cuenta en un selector o una lista: su correo antes que nada. */
export const accountLabel = (s: Pick<DanilSessionInfo, "email" | "name" | "account" | "computer_id">) =>
  s.email?.trim() || s.name?.trim() || s.account || s.computer_id || "";

/** Lo que nombra la sesión ante el motor: el id de la persona o, sin él, su computadora. */
export const sessionKey = (s: Pick<DanilSessionInfo, "account" | "computer_id">) => s.account ?? s.computer_id ?? null;

export type AccountChoice = { value: string; label: string; signedIn: boolean };

/**
 * Las cuentas que se pueden elegir para un workspace: las que tienen sesión, la
 * principal primero. La actual sin sesión también sale, para que el selector
 * diga de quién es aunque no se pueda volver a ella sin iniciar sesión.
 */
export function accountChoices(list: DanilSessionInfo[] | null | undefined, current: WorkspaceAccount | null): AccountChoice[] {
  const choices = connectedSessions(list)
    .filter((s) => sessionKey(s))
    .sort((a, b) => Number(b.default) - Number(a.default) || accountLabel(a).localeCompare(accountLabel(b)))
    .map((s) => ({ value: sessionKey(s) as string, label: accountLabel(s), signedIn: true }));
  if (current?.account && !sessionOf(list, current.account)) {
    choices.push({ value: current.account, label: current.email?.trim() || current.account, signedIn: false });
  }
  return choices;
}

/** La cuenta que acaba de entrar: la primera con sesión que no estaba en `known`. */
export function newSessionKey(known: string[], list: DanilSessionInfo[] | null | undefined): string | null {
  for (const s of connectedSessions(list)) {
    const key = sessionKey(s);
    if (key && !known.includes(key)) return key;
  }
  return null;
}

/** La sesión con la que habla un workspace; `null` si su cuenta no tiene sesión aquí. */
export function sessionForWorkspace(list: DanilSessionInfo[] | null | undefined, of: WorkspaceAccount | null) {
  if (!of) return defaultSession(list);
  const byAccount = sessionOf(list, of.account);
  if (byAccount) return byAccount;
  // El enlace 1 a 1 puede nombrar el workspace de Danil y no la persona.
  const email = of.email?.trim().toLocaleLowerCase();
  if (!email) return null;
  return connectedSessions(list).find((s) => s.email?.trim().toLocaleLowerCase() === email) ?? null;
}

/**
 * La línea de solo lectura del workspace: con quién se sincroniza; `unlinked`
 * si su cuenta tiene sesión pero el plano de control todavía no lo unió (o no
 * lo deja, `workspace_id_taken`); `unsynced` si su cuenta no tiene sesión aquí;
 * `none` si no es de ninguna cuenta.
 */
export type SyncLine =
  | { kind: "synced"; email: string }
  | { kind: "unlinked"; email: string }
  | { kind: "unsynced"; email: string | null }
  | { kind: "none" };

export function syncLine(of: WorkspaceAccount | null, list: DanilSessionInfo[] | null | undefined): SyncLine {
  if (of && !of.account) return { kind: "none" };
  const session = of?.signed_in ? sessionOf(list, of.account) : null;
  const email = of?.email?.trim() || (session ? accountLabel(session) : "");
  if (of?.signed_in && email) return { kind: of.linked ? "synced" : "unlinked", email };
  return { kind: "unsynced", email: email || null };
}

/** El `Status` de una sesión de la lista, para pintarla como la cuenta única. */
export function statusOf(s: DanilSessionInfo): DanilConnectStatus {
  return {
    state: "connected",
    account: s.account,
    computer_id: s.computer_id,
    name: s.computer_name ?? null,
    email: s.email,
    account_name: s.name,
    avatar: s.photo,
    online: s.online,
  };
}

/** Otra cuenta más: el motor deja el código pendiente y la ventana abre la página de aprobación. */
export async function addAccount(name?: string): Promise<DanilConnectStatus> {
  const trimmed = name?.trim();
  const started = await invoke<DanilConnectStatus>("danil_connect_start", trimmed ? { name: trimmed, add: true } : { add: true });
  const url = started.verification_uri_complete ?? started.verification_uri;
  if (url) await invoke("open_external", { target: url }).catch(() => {});
  return started;
}

export const setDefaultAccount = (account: string) => invoke<DanilSessionInfo[]>("danil_set_default_account", { account });

export const signOutAccount = (account: string) => invoke<DanilConnectStatus>("danil_disconnect", { account });

/**
 * `account: null` lo deja sin cuenta: sale de la anterior (de su web y su
 * teléfono) sin cerrar su sesión. La respuesta trae `error` si no se pudo unir en la nueva.
 */
export function setWorkspaceAccount(workspace: string, account: string | null): Promise<WorkspaceAccount> {
  return invoke<WorkspaceAccount>("danil_workspace_set_account", { workspace, account });
}

/** El código de un fallo al cambiar la cuenta de un workspace, venga en la respuesta o como rechazo. */
export function changeProblem(result: WorkspaceAccount | null, failure?: unknown): string | null {
  if (failure !== undefined) return failureCode(failure) ?? "failed";
  return result?.error?.trim() || null;
}
