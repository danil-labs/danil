/**
 * El cableado de los ocultos que viajan con la cuenta: una sola sincronización por
 * ventana (`createHiddenSync`) con el transporte de Desk o el de la web, el alcance
 * (persona, organización activa, ids que sirve su máquina) y el registro en `lib/prefs`.
 *
 * - Desk: `edgeFetch` y la persona de `GET /v1/identity/me`, una llamada por intento.
 * - La web: la cookie y CSRF (`setHiddenSyncWeb`, desde `web/window-session.tsx`) y la persona de la página.
 * - Sin alcance, sin transporte o con la ruta ausente, todo sigue local y sin nada visible.
 */
import type { OrganizationSelection } from "@terminus/computers";
import { createEffect, createMemo, createRoot, createSignal, on } from "solid-js";
import { edgeFetch } from "../../lib/edge.ts";
import { capabilities } from "../../lib/platform.ts";
import { escribirPref, leerPref } from "../../lib/prefs.ts";
import { listen } from "../../lib/serviceEvents.ts";
import { fleetRows } from "../machines/index.ts";
import { createHiddenSync, type PreferencesTransport, type SyncScope } from "./workspace-hidden-sync.ts";
import { edgePreferencesTransport, prefsSyncStore, SYNC_KEY, syncScope, type WebSend, webPreferencesTransport } from "./workspace-hidden-transport.ts";

/** `ORGANIZATION_CHANGED` de `organization-desktop.ts`; el literal evita cargar el selector antes de tiempo. */
const ORGANIZATION_CHANGED = "danil:organization-changed";

let web: PreferencesTransport | null = null;

/** La web da su transporte de cookie antes de montar la ventana: el crudo, sin `authorized`, para que un 403 de organización no abra el selector. */
export function setHiddenSyncWeb(send: WebSend) {
  web = webPreferencesTransport(send);
}

export type HiddenSync = ReturnType<typeof createHiddenSync> & { revision: () => number; scope: () => SyncScope | null };

let instance: HiddenSync | null = null;

/** La sincronización de esta ventana; `local` son los ocultos de este equipo, para la migración. */
export function hiddenSync(local: () => ReadonlySet<string>): HiddenSync {
  return (instance ??= createRoot(() => wire(local)));
}

function wire(local: () => ReadonlySet<string>): HiddenSync {
  const native = capabilities().nativeWindow;
  const [revision, bump] = createSignal(0);
  const [person, setPerson] = createSignal<string | null>(native ? null : (capabilities().webAccounts?.current.user_id ?? null), { equals: false });
  const [organizationRead, organizationChanged] = createSignal(0, { equals: false });
  let selection: OrganizationSelection | null = null;

  const organization = () => {
    organizationRead();
    const state = selection?.state();
    return state?.kind === "ready" ? state.active : null;
  };
  const scope = () => syncScope(person(), organization(), fleetRows());

  // Desk: la persona de la sesión del borde, sin reintentos propios (se vuelve a pedir con cada señal).
  let asking = false;
  const askPerson = () => {
    if (!native || asking || person()) return;
    asking = true;
    edgeFetch<{ id?: unknown }>("GET", "/v1/identity/me")
      .then((r) => {
        const id = r.status === 200 ? r.body?.id : null;
        if (typeof id === "string" && id) setPerson(id);
      })
      .catch(() => {})
      .finally(() => (asking = false));
  };

  const transport: PreferencesTransport | null = native ? edgePreferencesTransport(edgeFetch) : null;
  const sync = createHiddenSync({
    // La web lo da al iniciar la sesión; sin él, ninguna llamada sale.
    transport: {
      get: () => (transport ?? web ?? unavailable).get(),
      put: (id) => (transport ?? web ?? unavailable).put(id),
      remove: (id) => (transport ?? web ?? unavailable).remove(id),
    },
    store: prefsSyncStore(() => leerPref<unknown>(SYNC_KEY, {}), (all) => escribirPref(SYNC_KEY, all)),
    scope,
    local,
    onChange: () => bump((n) => n + 1),
  });

  void capabilities()
    .organizations?.()
    .then((found) => {
      selection = found;
      found.subscribe(() => organizationChanged(0));
      organizationChanged(0);
    })
    .catch(() => {});
  if (typeof window !== "undefined") window.addEventListener(ORGANIZATION_CHANGED, () => organizationChanged(0));
  // Al entrar o salir de la sesión se vuelve a preguntar quién es (el efecto de abajo).
  if (native) void listen("danil-connect", () => setPerson(null)).catch(() => {});

  // Al montar y con cada cambio de persona, organización o lo que sirve, una vuelta;
  // un inventario igual no vuelve a leer la cuenta.
  const key = createMemo(() => {
    const current = scope();
    return current ? `${current.person}:${current.organization}:${[...current.served].sort().join(",")}` : "";
  });
  createEffect(on(key, () => void sync.sync()));
  createEffect(on([person, fleetRows], () => askPerson()));
  return { ...sync, revision, scope };
}

/** Sin transporte todavía: como una ruta ausente, solo local. */
const unavailable: PreferencesTransport = {
  get: async () => ({ status: 501 }),
  put: async () => ({ status: 501 }),
  remove: async () => ({ status: 501 }),
};
