/**
 * El cableado de los workspaces de Danil agregados (`workspace-added-sync.ts`): una sola
 * sincronización por ventana con el transporte de Desk o el de la web, la persona, la
 * organización activa y la fuente (`danilAvailable`, las máquinas `kind=organization`).
 *
 * - Sin persona u organización no se llama al borde y nada es de Danil.
 * - Desk: `edgeFetch` y la persona de `GET /v1/identity/me`. La web: la cookie y CSRF.
 */
import type { OrganizationSelection } from "@terminus/computers";
import type { Listed } from "../../../features/machines/src/model/fleet/index.ts";
import { createEffect, createMemo, createRoot, createSignal, on } from "solid-js";
import { edgeFetch, ORGANIZATION_CHANGED, platformFetch } from "../../../platform-client/src/client.ts";
import { capabilities } from "../../../host/src/platform.ts";
import { escribirPref, leerPref } from "../../../../apps/desktop/src/lib/prefs.ts";
import { listen } from "../../../../apps/desktop/src/lib/serviceEvents.ts";
import { platformTransport } from "../../../session/src/platform-session.ts";
import { danilAvailable, danilMachines } from "../../../features/machines/src/index.ts";
import { sessionRail } from "./session-groups.ts";
import { type AddedTransport, createAddedSync } from "./workspace-added-sync.ts";
import { ADDED_KEY, edgeAddedTransport, prefsAddedStore, type WebSend, webAddedTransport } from "./workspace-added-transport.ts";
import { fetchIdentityMe } from "../../../platform-client/src/identity.ts";

declare const __DANIL_WEB_API__: import("../../../session/src/session-config").WebSessionDeployment | undefined;

let web: AddedTransport | null = null;
/** Lo que el riel lista (Desk y web), como evidencia de la siembra: en la web no hay índice del motor. */
let railIds: () => readonly string[] = () => [];
export function setRailShown(read: () => readonly string[]) {
  railIds = read;
}

/** La web da su transporte de cookie antes de montar la ventana: el crudo, para que un 403 de organización no abra el selector. */
export function setAddedSyncWeb(send: WebSend) {
  web = webAddedTransport(send);
}

export type DanilRail = ReturnType<typeof wire>;
let instance: DanilRail | null = null;

/**
 * Los de Danil de la ventana. `hidden` son los ocultos locales; `onSeeded` recibe los ids
 * que la siembra subió, para quitarlos de los ocultos locales solo después de un 204.
 */
export function danilRail(hidden: () => ReadonlySet<string>, onSeeded: (ids: readonly string[]) => void): DanilRail {
  return (instance ??= createRoot(() => wire(hidden, onSeeded)));
}

function wire(hidden: () => ReadonlySet<string>, onSeeded: (ids: readonly string[]) => void) {
  const native = capabilities().nativeWindow;
  const sessions = sessionRail(hidden, onSeeded, () => railIds());
  const [revision, bump] = createSignal(0);
  const [person, setPerson] = createSignal<string | null>(native ? null : (capabilities().webAccounts?.current.user_id ?? null));
  const [organizationRead, organizationChanged] = createSignal(0, { equals: false });
  const [selection, setSelection] = createSignal<OrganizationSelection | null>(null);

  const state = () => {
    organizationRead();
    return selection()?.state() ?? null;
  };
  const organization = () => {
    const current = state();
    return current?.kind === "ready" ? current.active : null;
  };
  const scope = () => {
    if (native && (!sessions.ready() || sessions.groups() !== null)) return null;
    const who = person();
    const org = organization();
    // Sin máquina de la organización no hay nada de Danil que sincronizar: ninguna llamada.
    return who && org && danilMachines(org).length > 0 ? { person: who, organization: org } : null;
  };
  const available = (): Listed[] | null => (scope() ? danilAvailable(organization()) : null);

  let asking = false;
  const askPerson = () => {
    if (!native || asking || person() || !sessions.ready() || !sessions.connected() || sessions.groups() !== null) return;
    asking = true;
    fetchIdentityMe(edgeFetch)
      .then((r) => {
        const id = r.status === 200 ? r.body?.id : null;
        if (typeof id === "string" && id) setPerson(id);
      })
      .catch(() => {})
      .finally(() => (asking = false));
  };

  const desk: AddedTransport | null = native ? edgeAddedTransport(edgeFetch) : null;
  // La web arma su transporte de cookie con el borde de su build.
  if (!native && !web && typeof __DANIL_WEB_API__ !== "undefined") web = webAddedTransport(platformTransport(__DANIL_WEB_API__, (input, init) => platformFetch(input, init)));
  const pick = () => desk ?? web ?? unavailable;
  const sync = createAddedSync({
    transport: { get: () => pick().get(), put: (id) => pick().put(id), remove: (id) => pick().remove(id), seed: (ids) => pick().seed(ids) },
    store: prefsAddedStore(() => leerPref<unknown>(ADDED_KEY, {}), (all) => escribirPref(ADDED_KEY, all)),
    scope,
    available,
    // Lo que el riel pintaba en este equipo: su orden guardado y sus cuadros.
    shown: () => new Set([...leerPref<string[]>("workspaces.order", []), ...railIds()]),
    hidden,
    onSeeded,
    onChange: () => bump((n) => n + 1),
  });

  void capabilities()
    .organizations?.()
    .then((found) => {
      setSelection(found);
      found.subscribe(() => organizationChanged(0));
    })
    .catch(() => {});
  if (typeof window !== "undefined") window.addEventListener(ORGANIZATION_CHANGED, () => organizationChanged(0));
  if (native) void listen("danil-connect", () => setPerson(null)).catch(() => {});

  const key = createMemo(() => {
    const current = scope();
    return current ? `${current.person}:${current.organization}:${available() ? "settled" : "waiting"}` : "";
  });
  createEffect(on(key, () => void sync.sync()));
  // El riel ya no se arma aquí (session-groups); este cableado solo queda para el aviso de la
  // cuenta agregada en la web, que lee la lista que la flota atribuyó desde `webListing`.
  createEffect(on([person, organization, sessions.ready, sessions.connected, () => sessions.groups() === null], () => askPerson()));

  createEffect(on(() => native && sessions.ready() && sessions.groups() === null && !!person() && !!selection(), (legacy) => {
    if (legacy) void selection()?.load();
  }));
  const ids = createMemo(() => new Set((available() ?? []).map((w) => w.id)));
  return {
    revision,
    signedIn: () => !!sessions.groups()?.length || !!person(),
    /** La organización activa si tiene máquina: sin ella no hay workspaces de Danil que ofrecer. */
    organization: () => scope()?.organization ?? null,
    /** Las otras organizaciones del JWT, para «Cambiar a…». */
    others: () => {
      const current = state();
      return current?.kind === "ready" ? current.items.filter((o) => o.id !== current.active) : [];
    },
    switchTo: (id: string) => void selection()?.choose(id),
    available,
    added: () => {
      revision();
      return sync.added();
    },
    /** De Danil = lo lista la máquina `kind=organization` de la organización activa. */
    isDanil: (id: string) => sessions.groups() !== null ? sessions.known.has(id) : ids().has(id),
    add: sync.add,
    remove: (id: string) => {
      const group = sessions.groups()?.find((g) => g.available?.some((w) => w.id === id));
      return group ? sessions.remove(group.context_id, id) : sync.remove(id);
    },
  };
}

/** Sin transporte todavía: como una ruta ausente. */
const unavailable: AddedTransport = {
  get: async () => ({ status: 501 }),
  put: async () => ({ status: 501 }),
  remove: async () => ({ status: 501 }),
  seed: async () => ({ status: 501 }),
};
