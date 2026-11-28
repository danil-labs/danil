import { sessionWorkspaceCatalog, workspaceCatalog } from "../../../platform-client/src/workspaces.ts";
import type { Workspace } from "../../../platform-client/src/workspaces.ts";
import type { WorkspaceAddLink } from "../../../session/src/workspace-add-link.ts";
import { createEffect, createMemo, createRoot, createSignal, on } from "solid-js";
import { invoke } from "../../../engine-client/src/client.ts";
import { bridgePersonSession } from "../../../session/src/person-session.ts";
import { capabilities, setCapabilities } from "../../../host/src/platform.ts";
import { deskEdgeWorkspaceAssets } from "../../../session/src/workspace-assets.ts";
import { escribirPref, leerPref } from "../../../session/src/prefs.ts";
import { listen } from "../../../host/src/serviceEvents.ts";
import { createAccountRequests } from "./account-requests.ts";
import { engineAdoptionReport, engineOwnsAdoption, onEngineAdoption, retryEngineAdoption } from "./engine-adoption.ts";
import { engineFeatures } from "./engine-features.ts";
import { createPersonalOpener } from "./personal-open.ts";
import { createAccountWorkspaces } from "./session-account-workspaces.ts";
import { type ContextGroup, createSessionContexts } from "./session-contexts.ts";
import { handAdoptionReport, handedReport } from "./session-gate.ts";
import type { EmptyReason } from "./session-empty.ts";
import { coalesceSessionReturn as createSessionReturn } from "./session-return.ts";
import { sessionSeedInputs, sessionSyncKey } from "./session-seeding.ts";
import { createAddedSync } from "./workspace-added-sync.ts";
import { ADDED_KEY, edgeAddedTransport, prefsAddedStore } from "./workspace-added-transport.ts";
import { sendIdentityMe } from "../../../platform-client/src/identity.ts";

type WorkspaceRow = { id: string; name: string; logo?: string | null; account?: string | null };
export type SessionRailGroup = ContextGroup & { available: readonly WorkspaceRow[] | null; added: ReadonlySet<string> | null; person: string | null; org_type?: string | null; free?: { id: string; name: string }; empty_reason?: EmptyReason | null; settled?: boolean };
let instance: ReturnType<typeof wire> | undefined;
export const [sessionRailState, setSessionRailState] = createRoot(() => createSignal<ReturnType<typeof wire>>());
export const hasSessionGroups = () => !!instance?.groups();
export const sessionRail = (hidden: () => ReadonlySet<string>, seeded: (ids: readonly string[]) => void, shown: () => readonly string[] = () => []) => instance ??= createRoot(() => { const next = wire(hidden, seeded, shown); setSessionRailState(next); return next; });

const NUMERIC_PLATFORM_WORKSPACE_RE = /^[1-9][0-9]{0,18}$/;

/** Resuelve `orgId` y el `account_id` numérico de plataforma a partir del workspace del motor activo. */
export function resolveActivePlatformContext(
  engineWorkspaceId: string | null | undefined,
  contextId?: string | null,
): { orgId: string | null; workspaceId: string | null } {
  const groups = sessionRailState()?.groups() ?? [];
  const activeGroup =
    (contextId ? groups.find((g) => g.context_id === contextId) : undefined) ??
    (engineWorkspaceId
      ? groups.find((g) => g.available?.some((w) => w.id === engineWorkspaceId))
      : undefined) ??
    groups[0];
  const orgId = activeGroup?.org ?? null;
  if (engineWorkspaceId && NUMERIC_PLATFORM_WORKSPACE_RE.test(engineWorkspaceId)) {
    return { orgId, workspaceId: engineWorkspaceId };
  }
  const match = engineWorkspaceId
    ? activeGroup?.available?.find((w) => w.id === engineWorkspaceId)
    : undefined;
  const accountId =
    match?.account && NUMERIC_PLATFORM_WORKSPACE_RE.test(match.account)
      ? match.account
      : null;
  return { orgId, workspaceId: accountId };
}

function wire(hidden: () => ReadonlySet<string>, onSeeded: (ids: readonly string[]) => void, shown: () => readonly string[]) {
  const [revision, bump] = createSignal(0);
  const changed = () => bump((n) => n + 1);
  const sessions = createSessionContexts(invoke, changed);
  const accounts = createAccountWorkspaces(invoke, !!capabilities().nativeWindow, changed, engineFeatures);
  accounts.forgetRefusals();
  const groups = () => (revision(), sessions.groups());
  const [laterContext, setLaterContext] = createSignal<string | null>(null);
  const [organizationNotice, setOrganizationNotice] = createSignal(false);
  const [menuNotice, setMenuNotice] = createSignal(false);
  const requests = createAccountRequests(invoke, { groups: sessions.groups });
  let seenRemoved = 0;
  createEffect(() => {
    revision();
    const count = sessions.removed().length;
    if (count > seenRemoved) setMenuNotice(true);
    seenRemoved = count;
  });
  const catalog = capabilities().webRailCatalog;
  const deskLists = new Map<string, readonly WorkspaceRow[]>();
  const deskLoaded = new Set<string>();
  const reading = new Map<string, Promise<void>>();
  const availableFor = (context: string) => {
    revision();
    return catalog ? catalog.workspaces(context) : deskLists.get(context) ?? null;
  };
  function refreshContext(context: string) {
    if (catalog) return catalog.refresh();
    const group = active(context);
    if (!group) return Promise.resolve();
    const pending = reading.get(context);
    if (pending) return pending;
    const read = sessionWorkspaceCatalog(sessions.send, context).then((items) => {
      if (!items || active(context)?.org !== group.org) return;
      // El directorio puede incluir otras membresías de la persona.
      deskLists.set(context, items.flatMap((item) => {
        const row = item as Workspace | null;
        const id = row?.engine_workspace_id;
        return row?.org === group.org && typeof id === "string" && id
          ? [{ id, name: typeof row.name === "string" ? row.name : id, account: typeof row.id === "string" ? row.id : null }]
          : [];
      }));
      changed();
    }).finally(() => {
      reading.delete(context);
      if (!deskLoaded.has(context)) {
        deskLoaded.add(context);
        changed();
      }
    });
    reading.set(context, read);
    return read;
  }
  const refreshCatalog = () => catalog?.refresh() ?? Promise.all((groups() ?? []).map((g) => refreshContext(g.context_id))).then(() => undefined);
  const opener = createPersonalOpener({ send: sessions.send, reread: async () => { await sessions.refresh(); return sessions.groups(); }, defaultContext: sessions.defaultContext, groups: sessions.groups });
  const refreshAccounts = () => accounts.refresh(groups() ?? [], sessions.send, (context) => records.get(context)?.person ?? null, opener);
  const accountKey = createMemo(() => JSON.stringify(groups()?.map((g) => [g.context_id, g.org, g.plan]) ?? null));
  createEffect(on(accountKey, () => {
    if (!catalog) {
      for (const context of deskLists.keys()) if (!active(context)) deskLists.delete(context);
      void refreshCatalog();
    }
    void refreshAccounts();
  }));
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
  // Con `engine_adoption_v1` (y la sesión en el motor) el reintento lo hace el motor.
  let engineAdopts = false;
  createEffect(() => {
    if (adoptionStarted || !groups()?.length) return;
    adoptionStarted = true;
    void adoption.retry();
  });
  const records = new Map<string, { person: string | null; orgType: string | null; orgRole: string | null; asking: boolean; checked: boolean; sync: ReturnType<typeof createAddedSync> }>();
  const known = new Set<string>();
  /** Lo agregado que se vio de cada contexto: una sesión vencida no puede releerlo y conserva sus cuadros. */
  const lastAdded = new Map<string, ReadonlySet<string>>();
  const active = (id: string) => groups()?.find((g) => g.context_id === id);
  const store = prefsAddedStore(() => leerPref<unknown>(ADDED_KEY, {}), (all) => escribirPref(ADDED_KEY, all));
  const ensure = (g: ContextGroup) => {
    const existing = records.get(g.context_id);
    if (existing?.person || existing?.asking) return;
    if (!existing && g.workspaces === "later") setLaterContext(g.context_id);
    const record = existing ?? { person: null as string | null, orgType: null as string | null, orgRole: null as string | null, asking: false, checked: false, sync: null as unknown as ReturnType<typeof createAddedSync> };
    if (!existing) record.sync = createAddedSync({
      seed: g.workspaces === "later" ? "explicit" : "rail",
      transport: edgeAddedTransport((method, path, body) => sessions.send(g.context_id, method, path, body)),
      store,
      scope: () => record.person && active(g.context_id) && !sessions.emptyReason(g.context_id) ? { person: record.person, organization: g.org } : null,
      available: () => sessions.emptyReason(g.context_id) ? [] : active(g.context_id) ? availableFor(g.context_id) : null,
      shown: () => sessionSeedInputs(active(g.context_id), availableFor(g.context_id), new Set([...leerPref<string[]>("workspaces.order", []), ...shown()]), hidden()).shown,
      hidden: () => sessionSeedInputs(active(g.context_id), availableFor(g.context_id), new Set(), hidden()).hidden,
      onSeeded, onChange: changed,
    });
    records.set(g.context_id, record);
    record.asking = true;
    void sendIdentityMe(sessions.send, g.context_id).then((r) => {
      const body = r.body as { id?: unknown; organizations?: unknown } | null;
      const id = body?.id;
      if (r.status === 200 && typeof id === "string" && active(g.context_id)) {
        record.person = id;
        const orgs = Array.isArray(body?.organizations) ? body.organizations : [];
        const match = orgs.find((item) => item && typeof item === "object" && (item as { id?: unknown }).id === g.org) as { type?: unknown; role?: unknown } | undefined;
        if (typeof match?.type === "string" && match.type) record.orgType = match.type;
        if (typeof match?.role === "string" && match.role) record.orgRole = match.role;
        changed();
        void record.sync.sync();
      }
    }).catch(() => {}).finally(() => {
      record.asking = false;
      if (!record.checked) {
        record.checked = true;
        if (!record.person) changed();
      }
    });
  };
  const rows = createMemo(() => {
    revision();
    for (const id of accounts.known()) known.add(id);
    return groups()?.map((g): SessionRailGroup => {
    const empty_reason = sessions.emptyReason(g.context_id);
    // Una sesión vencida conserva sus cuadros: el grupo se queda con su aviso «Vuelve a entrar».
    const available = empty_reason && empty_reason !== "session_expired" ? [] : availableFor(g.context_id);
    for (const w of available ?? []) known.add(w.id);
    const record = records.get(g.context_id);
    const added = record?.sync.added() ?? null;
    if (added) lastAdded.set(g.context_id, added);
    const free = accounts.free(g.context_id);
    const availableSettled = available !== null || (catalog ? (catalog.settled?.() ?? false) : deskLoaded.has(g.context_id));
    const addedSettled = added !== null || Boolean(empty_reason) || Boolean(record?.checked && (!record.person || record.sync.settled()));
    return {
      ...g,
      ...(!g.role && record?.orgRole ? { role: record.orgRole } : {}),
      ...(record?.orgType ? { org_type: record.orgType } : {}),
      available,
      free: free && !accounts.known().includes(free.id) ? free : undefined,
      empty_reason,
      added: added ?? (empty_reason === "session_expired" ? lastAdded.get(g.context_id) ?? null : null),
      person: record?.person ?? null,
      settled: Boolean(empty_reason) || (availableSettled && (available === null || addedSettled)),
    };
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
    if (!capabilities().accountAssets) {
      setCapabilities({ ...capabilities(), accountAssets: deskEdgeWorkspaceAssets(sessions.send) });
    }
    // Las peticiones de la CLI (`account.request`); al arrancar se drenan las que llegaron antes.
    void sessions.refresh().then(() => requests.pump());
    void listen("danil-connect", () => { void adoption.retry(); }).catch(() => {});
    // Un login de `danil login` llega del motor; los oyentes de la sesión escuchan `danil-connect`.
    void bridgePersonSession().catch(() => {});
    void listen("account.request", () => void requests.pump()).catch(() => {});
    // Lo que el motor liga después, en segundo plano, llega al mismo aviso.
    void engineFeatures().then((f) => {
      if (!engineOwnsAdoption(f)) return;
      engineAdopts = true;
      void onEngineAdoption(listen, (a) => {
        const group = groups()?.find((g) => g.org === a.org);
        const report = engineAdoptionReport(a, group?.context_id, group?.org_name ?? null);
        if (report?.adopted.length) handAdoptionReport(report);
      }).catch(() => {});
    });
    const refreshed = createSessionReturn(refreshAccounts);
    window.addEventListener("harness:machines", refreshed);
    const returned = createSessionReturn(async () => { await sessions.refresh(); refreshed(); await refreshCatalog(); });
    window.addEventListener("focus", returned);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") returned();
    });
  }
  async function addAdmitted(context: string, id: string) {
    for (let attempt = 0; attempt < 40 && !records.get(context)?.person; attempt++) {
      if (!active(context) && attempt % 5 === 0) await sessions.refresh();
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const record = records.get(context);
    if (!active(context) || !record?.person) throw { detail: "session_not_in_set" };
    record.sync.add(id);
    await record.sync.sync();
    await catalog?.refresh();
  }
  return {
    adoptionReport: () => accounts.adoptionReport() ?? handedReport(), clearAdoptionReport: () => { accounts.clearAdoptionReport(); handAdoptionReport(null); },
    retryAdoption: () => { if (engineAdopts) return void retryEngineAdoption(invoke); accounts.clearAdoptionUnavailable(); void adoption.retry(); },
    adoptionProgress: accounts.adoptionProgress, personalOutcome: accounts.personalOutcome, sealedElsewhere: (org: string) => (revision(), accounts.sealedElsewhere(org)), hasAdoptionCandidates: accounts.hasAdoptionCandidates,
    organizationNotice, clearOrganizationNotice: () => setOrganizationNotice(false), notifyOrganization: () => { setOrganizationNotice(true); setMenuNotice(true); },
    sessions, groups: rows, known, menuNotice, acknowledgeNotice: () => setMenuNotice(false), emptyReason: () => (revision(), sessions.emptyReason()), removed: () => (revision(), sessions.removed()), laterContext, acknowledgeLater: () => setLaterContext(null), ready: () => (revision(), sessions.ready()), connected: () => (revision(), sessions.connected()),
    materializeFree: async (context: string) => {
      const group = active(context);
      if (!group) throw { detail: "no_session" };
      const id = await accounts.create(group, refreshAccounts);
      if (!active(context)) throw { detail: "no_session" };
      await addAdmitted(context, id);
      return id;
    },
    addAdmitted,
    addFromHarness: async (target: WorkspaceAddLink) => {
      await sessions.refresh();
      const matches = (groups() ?? []).filter((g) => g.org === target.organization
        && (!target.person || sessions.families().find((f) => f.family === g.family)?.sub === target.person));
      if (matches.length !== 1) return null;
      const group = matches[0];
      const context = group.context_id;
      const rows = await workspaceCatalog(sessions.send, context);
      const row = rows.find((item) => item !== null && typeof item === "object" && "org" in item && item.org === group.org && "id" in item && String(item.id) === target.accountId) as Workspace | undefined;
      const id = row?.engine_workspace_id;
      if (typeof id !== "string" || !id || (target.workspace && target.workspace !== id)) return null;
      if (row.placement?.kind === "member_computer" && !accounts.known().includes(id)) {
        await accounts.materialize(group.org, target.accountId, id, typeof row.name === "string" ? row.name : id);
        await refreshAccounts();
      }
      await addAdmitted(context, id);
      await refreshContext(context);
      return { id, context };
    },
    remove: async (context: string, id: string) => {
      const record = records.get(context);
      if (!active(context) || !record?.person) throw { detail: "session_not_in_set" };
      record.sync.remove(id);
      await record.sync.sync();
    },
    revoke: capabilities().revokeWorkspaceAccess,
    refreshContext,
    refresh: () => { void refreshAccounts(); void refreshCatalog(); },
  };
}
