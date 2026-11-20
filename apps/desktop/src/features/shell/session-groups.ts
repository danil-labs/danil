import { createEffect, createMemo, createRoot, createSignal, on } from "solid-js";
import { invoke } from "../../lib/invoke.ts";
import { capabilities } from "../../lib/platform.ts";
import { escribirPref, leerPref } from "../../lib/prefs.ts";
import { listen } from "../../lib/serviceEvents.ts";
import { danilAvailable, danilAvailableContext, readDanilContext } from "../machines/index.ts";
import { type CreatedNotice, createAccountRequests } from "./account-requests.ts";
import { FIRST_LOGIN_KEY } from "./first-login.ts";
import { createPersonalOpener } from "./personal-open.ts";
import { createAccountWorkspaces } from "./session-account-workspaces.ts";
import { type ContextGroup, createSessionContexts } from "./session-contexts.ts";
import type { EmptyReason } from "./session-empty.ts";
import { coalesceSessionReturn as createSessionReturn } from "./session-return.ts";
import { sessionSeedInputs, sessionSyncKey } from "./session-seeding.ts";
import { sessionWorkspaceSource } from "./session-workspace-source.ts";
import { createAddedSync } from "./workspace-added-sync.ts";
import { ADDED_KEY, edgeAddedTransport, prefsAddedStore } from "./workspace-added-transport.ts";

export type SessionRailGroup = ContextGroup & { available: readonly { id: string; name: string; logo?: string | null }[] | null; added: ReadonlySet<string> | null; person: string | null; free?: { id: string; name: string }; empty_reason?: EmptyReason | null };
let instance: ReturnType<typeof wire> | undefined;
export const [sessionRailState, setSessionRailState] = createRoot(() => createSignal<ReturnType<typeof wire>>());
export const hasSessionGroups = () => !!instance?.groups();
export const sessionRail = (hidden: () => ReadonlySet<string>, seeded: (ids: readonly string[]) => void, shown: () => readonly string[] = () => []) => instance ??= createRoot(() => { const next = wire(hidden, seeded, shown); setSessionRailState(next); return next; });

function wire(hidden: () => ReadonlySet<string>, onSeeded: (ids: readonly string[]) => void, shown: () => readonly string[]) {
  const [revision, bump] = createSignal(0);
  const changed = () => bump((n) => n + 1);
  const sessions = createSessionContexts(invoke, changed);
  const accounts = createAccountWorkspaces(invoke, !!capabilities().nativeWindow, changed);
  accounts.hold(!!capabilities().nativeWindow && leerPref<boolean>(FIRST_LOGIN_KEY, false) !== true);
  accounts.forgetRefusals();
  const groups = () => (revision(), sessions.groups());
  const [laterContext, setLaterContext] = createSignal<string | null>(null);
  const [organizationNotice, setOrganizationNotice] = createSignal(false);
  const [menuNotice, setMenuNotice] = createSignal(false);
  const [agentCreated, setAgentCreated] = createSignal<CreatedNotice | null>(null);
  const requests = createAccountRequests(invoke, { groups: () => sessions.groups(), send: sessions.sendOptional, createHere: accounts.createHere }, (notice) => { setAgentCreated(notice); void refreshAccounts(); });
  let seenRemoved = 0;
  createEffect(() => {
    revision();
    const count = sessions.removed().length;
    if (count > seenRemoved) setMenuNotice(true);
    seenRemoved = count;
  });
  const catalog = capabilities().webRailCatalog;
  const availableFor = (org: string, context: string) => {
    revision();
    // La web: el riel sale del catálogo de cada contexto, nunca de lo que sirve una máquina.
    if (catalog) return catalog.workspaces(context);
    return sessionWorkspaceSource(groups()?.find((g) => g.context_id === context)?.plan ?? null, () => danilAvailableContext(org, context), () => accounts.available(org));
  };
  const opener = createPersonalOpener({ send: sessions.send, reread: async () => { await sessions.refresh(); return sessions.groups(); }, defaultContext: sessions.defaultContext, groups: sessions.groups });
  const refreshAccounts = () => accounts.refresh(groups() ?? [], sessions.send, (context) => records.get(context)?.person ?? null, opener);
  const accountKey = createMemo(() => JSON.stringify(groups()?.map((g) => [g.context_id, g.org, g.plan]) ?? null));
  createEffect(on(accountKey, () => void refreshAccounts()));
  // Una persona nueva recibe su organización personal después del login. Se reintenta sin otro
  // inicio de sesión hasta que identity liga el contexto y el reclamo se hace, o se agota el plazo.
  const adoption = {
    attempt: null as Promise<void> | null,
    retry() {
      this.attempt ??= (async () => {
        for (let attempt = 0; attempt < 5; attempt++) {
          await sessions.refresh();
          // Sin sesión (un cierre de sesión también emite `danil-connect`) no hay nada que reclamar.
          if (!groups()?.length) return;
          await refreshAccounts();
          if (!(await accounts.hasAdoptionCandidates())) break;
          await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
        }
      })().finally(() => { adoption.attempt = null; });
      return this.attempt;
    },
  };
  let adoptionStarted = false;
  createEffect(() => {
    if (adoptionStarted || !groups()?.length) return;
    adoptionStarted = true;
    void adoption.retry();
  });
  const records = new Map<string, { person: string | null; asking: boolean; sync: ReturnType<typeof createAddedSync> }>();
  const known = new Set<string>();
  /** Lo agregado que se vio de cada contexto: una sesión vencida no puede releerlo y conserva sus cuadros. */
  const lastAdded = new Map<string, ReadonlySet<string>>();
  const active = (id: string) => groups()?.find((g) => g.context_id === id);
  const store = prefsAddedStore(() => leerPref<unknown>(ADDED_KEY, {}), (all) => escribirPref(ADDED_KEY, all));
  const ensure = (g: ContextGroup) => {
    const existing = records.get(g.context_id);
    if (existing?.person || existing?.asking) return;
    if (!existing && g.workspaces === "later") setLaterContext(g.context_id);
    const record = existing ?? { person: null as string | null, asking: false, sync: null as unknown as ReturnType<typeof createAddedSync> };
    if (!existing) record.sync = createAddedSync({
      seed: g.workspaces === "later" ? "explicit" : "rail",
      transport: edgeAddedTransport((method, path, body) => sessions.send(g.context_id, method, path, body)),
      store,
      scope: () => record.person && active(g.context_id) && !sessions.emptyReason(g.context_id) ? { person: record.person, organization: g.org } : null,
      available: () => sessions.emptyReason(g.context_id) ? [] : active(g.context_id) ? availableFor(g.org, g.context_id) : null,
      shown: () => sessionSeedInputs(active(g.context_id), availableFor(g.org, g.context_id), new Set([...leerPref<string[]>("workspaces.order", []), ...(capabilities().railWorkspaces?.() ?? []).map((w) => w.id), ...shown()]), hidden()).shown,
      hidden: () => sessionSeedInputs(active(g.context_id), availableFor(g.org, g.context_id), new Set(), hidden()).hidden,
      onSeeded, onChange: changed,
    });
    records.set(g.context_id, record);
    record.asking = true;
    void sessions.send(g.context_id, "GET", "/v1/identity/me").then((r) => {
      const id = (r.body as { id?: unknown } | null)?.id;
      if (r.status === 200 && typeof id === "string" && active(g.context_id)) {
        record.person = id;
        changed();
        void record.sync.sync();
      }
    }).catch(() => {}).finally(() => { record.asking = false; });
  };
  const rows = createMemo(() => {
    revision();
    for (const id of accounts.known()) known.add(id);
    return groups()?.map((g): SessionRailGroup => {
    const empty_reason = sessions.emptyReason(g.context_id);
    // Una sesión vencida conserva sus cuadros: el grupo se queda con su aviso «Vuelve a entrar».
    const available = empty_reason && empty_reason !== "session_expired" ? [] : availableFor(g.org, g.context_id);
    // Los ids sin atribuir solo evitan que reaparezcan como locales; no aportan filas al grupo.
    for (const w of danilAvailable(g.org) ?? []) known.add(w.id);
    for (const w of available ?? []) known.add(w.id);
    const added = records.get(g.context_id)?.sync.added() ?? null;
    if (added) lastAdded.set(g.context_id, added);
    return { ...g, available, free: accounts.free(g.context_id), empty_reason, added: added ?? (empty_reason === "session_expired" ? lastAdded.get(g.context_id) ?? null : null), person: records.get(g.context_id)?.person ?? null };
    }) ?? null;
  });
  createEffect(() => {
    for (const g of groups() ?? []) ensure(g);
  });
  const syncKey = createMemo(() => sessionSyncKey(rows() ?? []));
  createEffect(on(syncKey, () => {
    for (const g of rows() ?? []) if (g.available && g.person) void records.get(g.context_id)?.sync.sync();
  }));
  if (catalog) {
    const returned = createSessionReturn(async () => { await sessions.refresh(); await catalog.refresh(); });
    returned();
    window.addEventListener("focus", returned);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") returned(); });
  }
  if (capabilities().nativeWindow) {
    // Las peticiones de la CLI (`account.request`); al arrancar se drenan las que llegaron antes.
    void sessions.refresh().then(() => requests.pump());
    void listen("danil-connect", () => { void adoption.retry(); }).catch(() => {});
    void listen("account.request", () => void requests.pump()).catch(() => {});
    const refreshed = createSessionReturn(async () => {
      await refreshAccounts();
      for (const g of groups() ?? []) await readDanilContext(g.org, g.context_id);
    });
    window.addEventListener("harness:machines", refreshed);
    const returned = createSessionReturn(async () => { await sessions.refresh(); refreshed(); });
    window.addEventListener("focus", returned);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") returned();
    });
  }
  return {
    agentCreated, clearAgentCreated: () => setAgentCreated(null),
    adoptionReport: accounts.adoptionReport, clearAdoptionReport: accounts.clearAdoptionReport,
    retryAdoption: () => { accounts.clearAdoptionUnavailable(); void adoption.retry(); },
    adoptionProgress: accounts.adoptionProgress, personalOutcome: accounts.personalOutcome, sealedElsewhere: (org: string) => (revision(), accounts.sealedElsewhere(org)), hasAdoptionCandidates: accounts.hasAdoptionCandidates,
    releaseAdoption: () => { accounts.hold(false); accounts.clearAdoptionUnavailable(); void adoption.retry(); },
    organizationNotice, clearOrganizationNotice: () => setOrganizationNotice(false), notifyOrganization: () => { setOrganizationNotice(true); setMenuNotice(true); },
    sessions, groups: rows, known, menuNotice, acknowledgeNotice: () => setMenuNotice(false), emptyReason: () => (revision(), sessions.emptyReason()), removed: () => (revision(), sessions.removed()), laterContext, acknowledgeLater: () => setLaterContext(null), ready: () => (revision(), sessions.ready()), connected: () => (revision(), sessions.connected()),
    createFree: async (context: string) => {
      const group = active(context);
      if (!group) throw { detail: "no_session" };
      const id = await accounts.create(group, refreshAccounts);
      if (!active(context)) throw { detail: "no_session" };
      await records.get(context)?.sync.add(id);
      return id;
    },
    add: (context: string, id: string) => records.get(context)?.sync.add(id),
    /**
     * Agrega un workspace de un contexto recién admitido. Espera a que el riel lea su persona
     * (`GET /v1/identity/me` del contexto): un intento cada 150 ms durante 6 s, el plazo de una
     * lectura del borde, y el conjunto se relee solo mientras el contexto aún no está.
     */
    addAdmitted: async (context: string, id: string) => {
      for (let attempt = 0; attempt < 40 && !records.get(context)?.person; attempt++) {
        if (!active(context) && attempt % 5 === 0) await sessions.refresh();
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      const record = records.get(context);
      if (!record?.person) throw { detail: "session_not_in_set" };
      record.sync.add(id);
      // Lo agregado queda en la cola local y se sube con reintentos (workspace-added-sync): no se pierde.
      await record.sync.sync();
      await catalog?.refresh();
    },
    remove: (context: string, id: string) => records.get(context)?.sync.remove(id),
    refreshContext: (context: string) => { const group = active(context); return group ? readDanilContext(group.org, context, true) : Promise.resolve(); },
    refresh: () => { void refreshAccounts(); for (const g of groups() ?? []) void readDanilContext(g.org, g.context_id); },
  };
}
