/**
 * El primer arranque con sesión (plan de cuentas F1.2): la ventana entra al
 * workspace de la organización personal Free, el mismo que sella «+» con
 * `createFree`. La app no crea workspaces locales; solo la CLI crea.
 *
 * El alta tapa el riel, así que no usa `sessionRail` (un singleton con las
 * funciones del riel): lee los contextos y el catálogo por su cuenta.
 */
import { adoptionTarget } from "./account-adoption.ts";
import { createAccountWorkspaces } from "./session-account-workspaces.ts";
import type { ContextInvoke } from "./session-context-types.ts";
import { createSessionContexts } from "./session-contexts.ts";

export type FirstFreeOptions = { attempts?: number; wait?: (ms: number) => Promise<void> };

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Sella aquí el workspace de la organización personal Free y devuelve su id.
 * Una cuenta nueva puede tardar en tenerlo en el catálogo: se reintenta un
 * rato acotado antes de rendirse con `not_available_yet`. Sin sesión falla en seguida con
 * `no_session`.
 */
export async function sealFirstFreeWorkspace(invoke: ContextInvoke, { attempts = 10, wait = pause }: FirstFreeOptions = {}): Promise<{ id: string; name: string }> {
  const noop = () => {};
  const sessions = createSessionContexts(invoke, noop);
  const accounts = createAccountWorkspaces(invoke, true, noop);
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt) await wait(1500);
    await sessions.refresh();
    const groups = sessions.groups() ?? [];
    if (!groups.length) throw { detail: "no_session", message_key: "onboarding.workspace.no_session" };
    const personal = adoptionTarget(groups);
    if (!personal) continue;
    const refresh = () => accounts.refresh(groups, sessions.send);
    await refresh();
    const row = accounts.free(personal.context_id);
    if (!row) continue;
    // Ya sellado en esta computadora (un alta que se cortó después de sellar): solo se activa.
    if (accounts.known().includes(row.id)) return { id: row.id, name: row.name };
    return { id: await accounts.create(personal, refresh), name: row.name };
  }
  throw { detail: "not_available_yet", message_key: "onboarding.workspace.not_available_yet" };
}
