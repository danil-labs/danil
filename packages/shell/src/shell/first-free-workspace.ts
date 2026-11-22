/**
 * El primer arranque con sesión (plan de cuentas F1.2): la ventana entra al
 * workspace personal Free que el catálogo ya asignó.
 *
 * El alta tapa el riel, así que no usa `sessionRail` (un singleton con las
 * funciones del riel): lee los contextos y el catálogo por su cuenta.
 */
import { escribirPref, leerPref } from "../../../../apps/desktop/src/lib/prefs.ts";
import { adoptionTarget } from "./account-adoption.ts";
import { createAccountWorkspaces } from "./session-account-workspaces.ts";
import type { ContextGroup, ContextInvoke } from "./session-context-types.ts";
import { createSessionContexts } from "./session-contexts.ts";
import { createAddedSync } from "./workspace-added-sync.ts";
import { ADDED_KEY, edgeAddedTransport, prefsAddedStore } from "./workspace-added-transport.ts";
import { sendIdentityMe } from "../../../platform-client/src/identity.ts";

export type FirstFreeOptions = { delays?: readonly number[]; wait?: (ms: number) => Promise<void> };
type FirstFreeRefusal = "no_session" | "engine_unsupported" | "refresh_failed" | "not_available_yet";

/**
 * Las esperas entre lecturas, con retroceso: ~30 s en total. Una cuenta nueva
 * recibe su organización personal Free y su workspace al iniciar sesión, pero
 * la fila llega al catálogo de forma asíncrona (la web espera lo mismo con
 * «Preparando tu workspace…», #1001). Pasado el tope, «Volver a intentar».
 */
export const FIRST_FREE_DELAYS: readonly number[] = [1000, 2000, 4000, 8000, 8000, 8000];

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const refuse = (detail: FirstFreeRefusal) => ({ detail, message_key: `onboarding.workspace.${detail}` });

/**
 * Sella el workspace cuando hay una sola organización Free. Con una sesión
 * válida y sin destino inequívoco, la ventana puede abrir el riel directamente.
 */
export async function sealFirstFreeWorkspace(invoke: ContextInvoke, { delays = FIRST_FREE_DELAYS, wait = pause }: FirstFreeOptions = {}): Promise<{ id: string; name: string } | null> {
  const noop = () => {};
  // El `state` de la última lectura: sin `sessions`, `connected` es «todavía cargando» y lo demás, «sin sesión».
  let state: string | null = null;
  const sessions = createSessionContexts(invoke, noop, (status) => {
    state = typeof status?.state === "string" ? status.state : null;
  });
  const accounts = createAccountWorkspaces(invoke, true, noop);
  for (let attempt = 0; ; attempt++) {
    if (attempt) await wait(delays[attempt - 1]);
    const last = attempt >= delays.length;
    await sessions.refresh();
    const groups = sessions.groups();
    // `null` sin respuesta, o conectada con las familias aún sin leer: se reintenta. `[]` o desconectada: no hay sesión.
    if (!groups?.length && state !== null && state !== "connected") throw refuse("no_session");
    if (groups === null) { if (last) throw refuse("not_available_yet"); continue; }
    if (!groups.length) throw refuse("no_session");
    const personal = adoptionTarget(groups);
    if (!personal) return null;
    const refresh = () => accounts.refresh(groups, sessions.send);
    await refresh();
    const status = accounts.status();
    if (!status.machine || !status.extension) throw refuse("engine_unsupported");
    if (status.failed) throw refuse("refresh_failed");
    const row = accounts.free(personal.context_id);
    if (!row) { if (last) throw refuse("not_available_yet"); continue; }
    // Ya sellado en esta computadora (un alta que se cortó después de sellar): solo se activa.
    const id = accounts.known().includes(row.id) ? row.id : await accounts.create(personal, refresh);
    await markAdded(personal, id, sessions.send, accounts.available);
    return { id, name: row.name };
  }
}

type Send = ReturnType<typeof createSessionContexts>["send"];

/**
 * Después de sellar, se agrega a la
 * lista de la persona, para que el riel lo muestre aunque ya tenga una lista
 * `added`. Lo pendiente queda en las preferencias y el riel lo termina de mandar.
 */
async function markAdded(group: ContextGroup, id: string, send: Send, available: (org: string) => readonly { id: string }[]) {
  try {
    const me = await sendIdentityMe(send, group.context_id);
    const person = (me.body as { id?: unknown } | null)?.id;
    if (me.status !== 200 || typeof person !== "string") return;
    const sync = createAddedSync({
      seed: group.workspaces === "later" ? "explicit" : "rail",
      transport: edgeAddedTransport((method, path, body) => send(group.context_id, method, path, body)),
      store: prefsAddedStore(() => leerPref<unknown>(ADDED_KEY, {}), (all) => escribirPref(ADDED_KEY, all)),
      scope: () => ({ person, organization: group.org }),
      available: () => available(group.org),
      shown: () => new Set([id]),
      hidden: () => new Set(),
      onChange: () => {},
      // Sin reintentos propios: lo que no subió queda pendiente y lo sube la instancia del riel.
      schedule: () => {},
    });
    sync.add(id);
    await sync.sync();
  } catch {
    // Sin la lista de la cuenta el riel siembra lo que hay; el alta no se bloquea por esto.
  }
}
