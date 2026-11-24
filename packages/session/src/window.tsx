import { RelaySession } from "../../features/machines/src/queries/relay.ts";
import type { Machine } from "../../platform-client/src/machines.ts";
import { machineToComputer } from "../../platform-client/src/machines.ts";
import { readContextSpaces } from "../../platform-client/src/workspace-spaces.ts";
import type { MachinesQuery } from "../../features/machines/src/queries/machines-query.ts";
import { Fleet, memberKey, relayLink, type StorageLike, unwrap } from "../../features/machines/src/model/fleet/index.ts";
import { createSignal, lazy, Suspense } from "solid-js";
import { createContextRelayPool, createRemoteGuestManager, deriveMachineAvailability, isRemoteGuestMachine, type MachineAvailability, machinesListed, mergeByMachineId } from "../../features/machines/src";
import { sessionRailState } from "../../shell/src/shell";
import { createRouter, type SliceChange } from "../../features/machines/src/queries/router";
import type { AccountProfileSource } from "../../features/settings/src/model/account-profile";
import { t } from "../../ui/src/lib/i18n";
import { type Capabilities, setCapabilities, type WebAccountsSource } from "../../host/src/platform";
import { leerPref } from "./prefs";
import { deliver } from "../../host/src/serviceEvents";
import { installIpc } from "./ipc";
import type { MachineStatus } from "../../features/machines/src/model/SyncNote";
import { createWebTransport } from "./transport";
import { composeControlPlane, webEdgeGithubAccount } from "./github-account";
import type { EdgeTransport } from "../../platform-client/src/edge";
import { browser, takeSettingsParam } from "./window-browser";
import { webMachineCall } from "./workspace-runtime";
import { MACHINE_ACTION } from "../../host/src/machine-action";
import { windowContext } from "./window-context";
import { openWorkspaceUrl } from "./open-workspace-url";
import { activeWorkspaceContext } from "./workspace-context";

declare const __TERMINUS_VERSION__: string;
type Base = { billing: ReturnType<typeof import("./window-billing").windowBilling>; contextMachines: (context: string) => MachinesQuery; sessions: import("./web-session-contexts").WebSessionCommands; active: ReturnType<typeof import("./window-active-context").windowActiveContext>; rail?: Capabilities["webRailCatalog"]; relayOrigin: string; origin?: string; transport?: EdgeTransport; credentials?: Capabilities["accountCredentials"]; permits: (name: string) => boolean; organizations?: Capabilities["organizations"]; promo?: Capabilities["webPromo"]; groupAccount?: Capabilities["groupAccount"]; reauth?: Capabilities["webReauth"]; preparing?: () => boolean; profile: AccountProfileSource; services: Pick<Capabilities, "webWorkspacePicker" | "danilCredits">; onUnavailable: () => void; };
const Picker = lazy(() => import("../../features/machines/src/screens/MachinePicker").then(m => ({ default: m.MachinePicker })));
const AccountMachines = lazy(() => import("../../features/machines/src/screens/AccountMachines"));
/** Another machine's slice changed: the window rereads just that. */
function slicesChanged(changes: SliceChange[]) {
  if (changes.includes("workspaces")) window.dispatchEvent(new CustomEvent("harness:workspace-name"));
  window.dispatchEvent(new CustomEvent("harness:machine-slices", { detail: { changes } }));
  if (changes.includes("attention")) window.dispatchEvent(new CustomEvent("harness:service-resync"));
}
/** Browser storage is scoped by the authenticated person and selected workspace. */
type Mounted = { storage: StorageLike | null; webAccounts?: WebAccountsSource };

/** Mounts the real window before optional machine services are available. */
export function mountWindow(base: Base, mounted: Mounted) {
  let stopped = false;
  let refreshing: Promise<boolean> | undefined;
  const [settled, setSettled] = createSignal(false);
  const [serviceError, setServiceError] = createSignal(false);
  const [permitted, setPermitted] = createSignal(true);
  const [revision, bump] = createSignal(0);
  let listed = new Map<string, Machine>();
  const powers = new Map<string, string>();
  const unavailable = () => ({ what: t("web.machines.unavailable"), detail: "machines_unavailable" });
  const notifyMachines = () => window.dispatchEvent(new CustomEvent("harness:machines"));
  const pool = createContextRelayPool();
  const remoteGuests = createRemoteGuestManager({ onChange: () => { if (!stopped) { fleet.setMachines(remoteGuests.syncHosts()); bump(n => n + 1); notifyMachines(); } } });
  const scope = windowContext({ factory: base.contextMachines, sessions: base.sessions, groups: () => base.active.groups(), fallback: () => base.active.current()?.context ?? null, active: () => active.activeContext(), fleet: () => fleet, revision, onContextsSettled: contexts => { active.pruneContexts(contexts); bump(n => n + 1); }, onContextState: (context, expired) => sessionRailState()?.sessions.noteContext(context, expired) });
  const fleet: Fleet = new Fleet({ self: null, storage: mounted.storage,
    connect: info => {
      if (isRemoteGuestMachine(info.id)) return remoteGuests.connect(info);
      const create = () => {
        const relay = new RelaySession({ endpoint: base.relayOrigin, computerId: info.id,
          getAdmission: async () => {
            if (!base.permits("machines.session")) throw unavailable();
            const reply = await scope.client(info.context).admission(info.id);
            if (reply.kind === "unauthorized") void refresh();
            // Sin `wake`, una VM apagada contesta 409: la sesión se detiene sin reintentar hasta una acción de la persona.
            if (reply.kind === "error" && reply.status === 409 && reply.code === "machine_stopped") throw { code: "machine_stopped" };
            if (reply.kind !== "ok") throw unavailable();
            return reply.value;
          },
          onUnauthorized: () => void refresh(),
        });
        const link = relayLink(relay, () => relay.state() === "unknown" ? machineToComputer(listed.get(memberKey(info.id, info.context))!).state : relay.state());
        return { ...link, call: webMachineCall(link, fleet, info.id, info.context) };
      };
      const hostLink = info.context ? pool.link(info.id, create, { onSuspend: () => active.attentionSuspended(info.id, info.context), onResume: (value) => active.attentionResumed(info.id, info.context, value) }) : create();
      return remoteGuests.attachHost(info, hostLink);
    },
    wake: async (id, context) => {
      if (isRemoteGuestMachine(id)) return remoteGuests.wake(id, context);
      if (!base.permits("machines.start")) return "not_startable";
      const answer = await scope.client(context).wake(id);
      if (answer.kind === "unauthorized") void refresh();
      if (answer.kind === "ok") { void refresh(); return true; }
      return answer.kind === "error" && answer.code === "not_remotely_startable" ? "not_startable" : false;
    },
    onChange: (id, context) => {
      notifyMachines();
      const power = fleet.power(id, context);
      const key = memberKey(id, context);
      const changed = powers.get(key) !== power;
      if (power === "on" && powers.get(key) !== "on" && active.unlisted()) window.dispatchEvent(new CustomEvent("harness:workspace"));
      powers.set(key, power);
      if (changed && !isRemoteGuestMachine(id)) void refresh();
      bump(n => n + 1);
      void import("../../features/machines/src/queries/store").then(({ machineNamesChanged, refetchMachines }) => {
        if (stopped) return;
        machineNamesChanged();
        void refetchMachines();
      });
    },
    onEvents: (_id, events, gap, metadata, context) => {
      // A connection transition requests fresh reads; only a journal page can report missing output.
      if (!context || scope.info(context)) active.events(_id, events, metadata ? { ...metadata, gap } : { resync: gap }, context);
    },
    onSlice: () => bump(n => n + 1),
  });
  const stopListing = fleet.onListing(() => bump(n => n + 1));
  const contextCatalog = (context: string) => {
    const rows = base.rail?.workspaces(context);
    if (!rows) return null;
    const org = scope.info(context)?.org ?? null;
    return rows.map((row) => ({ id: row.id, name: row.name, org }));
  };
  const allCatalog = () => {
    if (!base.rail) return null;
    const groups = scope.groups();
    if (!groups.length) return null;
    let resolved = false;
    const seen = new Set<string>();
    const out: { id: string; name: string; org: string | null }[] = [];
    for (const group of groups) {
      const rows = base.rail.workspaces(group.context);
      if (!rows) continue;
      resolved = true;
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        out.push({ id: row.id, name: row.name, org: group.org ?? null });
      }
    }
    return resolved ? out : null;
  };
  const active = createRouter({ contextInfo: scope.routing, self: null, fleet, native: null, deliver, onSlices: slicesChanged,
    readContextSpaces: readContextSpaces(base.sessions.handle),
    catalogWorkspaces: allCatalog,
    contextCatalogWorkspaces: contextCatalog,
    pickedFor: workspace => {
      const picked: Record<string, string> = leerPref("machines.run_on", {});
      return workspace ? picked[workspace] ?? null : null;
    },
  });
  const url = openWorkspaceUrl(active, base.sessions);
  const availability = (): MachineAvailability => {
    revision();
    const context = activeWorkspaceContext() ?? scope.current()?.context ?? base.active.current()?.context ?? undefined;
    const list = context ? fleet.machines(context) : fleet.machines();
    return deriveMachineAvailability({
      permitted: permitted(),
      settled: settled(),
      serviceError: serviceError(),
      machines: list.map((m) => ({ power: fleet.power(m.id, m.context), wakes: m.wakes, child: m.child })),
      scope: "context",
    });
  };
  const missing = () => availability().kind === "unavailable";
  const status = (id: string, context?: string): MachineStatus => { const power = fleet.power(id, context); return power === "on" ? "online" : power === "off" ? "offline" : power; };
  const machines = () => {
    revision();
    const slices = fleet.sliceStatuses(scope.current()?.context);
    return mergeByMachineId(fleet.machines().map(m => ({ machine: listed.get(memberKey(m.id, m.context)) ?? { machine_id: m.id, name: m.name }, organization: { id: m.organizationId ?? m.context ?? "", name: (m.context && scope.info(m.context)?.name) || m.name }, status: status(m.id, m.context), at: slices[m.id]?.status === "cached" ? slices[m.id].at : null })));
  };
  const several = () => (revision(), fleet.machines().length > 1);
  // El chip de la VM en Cuentas de IA se ve aunque sea la única: «Ejecutar en» sí pide más de una.
  const any = () => (revision(), fleet.machines().length > 0);
  async function update() {
    if (stopped) return false;
    if (!base.permits("machines")) { setPermitted(false); setServiceError(false); setSettled(true); fleet.setMachines(remoteGuests.syncHosts([])); return false; }
    setPermitted(true);
    const inventory = await scope.inventory();
    if (!inventory) { setServiceError(true); setSettled(true); fleet.setMachines(remoteGuests.syncHosts([])); bump(n => n + 1); return false; }
    const { answer, rows } = inventory;
    if (stopped) return false;
    if (answer.kind !== "ok") {
      const transient = answer.kind === "error" && (answer.status === null || answer.status === 408 || answer.status === 429 || answer.status >= 500);
      if (transient && settled()) { bump(n => n + 1); return false; }
      setServiceError(true);
      setSettled(true);
      if (!transient) fleet.setMachines(remoteGuests.syncHosts([]));
      bump(n => n + 1);
      return false;
    }
    listed = new Map(rows.map(({ machine, group }) => [memberKey(machine.machine_id, group.context), machine]));
    setServiceError(false);
    setSettled(true);
    fleet.setMachines(remoteGuests.syncHosts(rows.map(({ machine, group }) => ({ id: machine.machine_id, name: scope.machineName(machine, group, rows),
      wakes: machineToComputer(machine).wakeable === true && base.permits("machines.start"), kind: scope.fleetKind(machine, group), hosted: scope.hosted(machine), context: group.context, organizationId: machine.organization_id ?? null,
    }))));
    for (const { machine, group } of rows) fleet.observe(machine.machine_id, machineToComputer(machine).state, group.context);
    bump(n => n + 1);
    machinesListed(fleet);
    fleet.subscribeEvents();
    active.registryChanged();
    for (const name of ["harness:workspace-name", "harness:service-resync", "harness:machines"]) window.dispatchEvent(new CustomEvent(name));
    return true;
  }
  function refresh(): Promise<boolean> {
    if (refreshing) return refreshing;
    refreshing = update().finally(() => { refreshing = undefined; });
    return refreshing;
  }
  // A file dropped outside the chat would replace the page with it.
  for (const type of ["dragover", "drop"]) window.addEventListener(type, (e) => e.preventDefault());
  setCapabilities({
    nativeWindow: false, updater: false, localSetup: false, computerStatus: true, browserFiles: true, appDownloads: true,
    accountProfile: base.profile, personalAccount: base.billing.account,
    ...base.services,
    organizations: base.organizations,
    initialSettings: takeSettingsParam(),
    machineAvailability: availability,
    activePlan: () => (revision(), base.active.current()?.plan ?? null),
    machineName: id => id === "local" ? (missing() ? t("web.machines.unavailable") : "") : fleet.name(id, scope.current()?.context),
    taskWritable: id => {
      revision();
      const context = scope.current()?.context;
      const task = unwrap(id, fleet.remotes(context));
      return !!task && remoteGuests.canContinue(fleet, task.machine, context);
    },
    taskMachine: id => unwrap(id, fleet.remotes(scope.current()?.context))?.machine ?? null,
    windowMachine: () => { const id = active.createsOn(null)?.machine; return id ? { id, name: fleet.name(id, scope.current()?.context), local: false } : undefined; },
    remoteCreate: workspace => active.createsOn(workspace),
    machineOnCreate: workspace =>
      several() ? (
        <Suspense fallback={null}>
          <div class="flex items-center gap-1 pt-2 text-xs text-neutral-500" data-create-on="">
            <span>{t("web.machines.create_on")}</span>
            <Picker workspace={workspace} />
          </div>
        </Suspense>
      ) : null,
    accountMachines: props =>
      any() ? (
        <Suspense fallback={null}>
          <AccountMachines {...props} machines={machines} />
        </Suspense>
      ) : null,
    machinesLicense: () => {
      revision();
      return fleet.license(scope.current()?.context);
    },
    accountComputers: { list: async () => { const answer = await scope.client(scope.current()?.context).list(); return answer.kind === "ok" ? { kind: "ok", value: answer.value.map(machineToComputer) } : answer.kind === "unavailable" ? { kind: "error", status: answer.status } : answer; }, onRenamed: () => {}, subscribe: changed => { window.addEventListener("harness:machines", changed); return () => window.removeEventListener("harness:machines", changed); } },
    accountCredentials: base.credentials,
    webAccounts: mounted.webAccounts,
    webRailCatalog: base.rail, webPromo: base.promo, groupAccount: base.groupAccount, webReauth: base.reauth,
    retryMachines: () => { fleet.retry(); void refresh(); },
  });
  const github = base.origin && base.transport
    ? webEdgeGithubAccount(base.origin, base.transport, () => window.location.href)
    : undefined;
  installIpc(window, createWebTransport(scope.engine(active), __TERMINUS_VERSION__, browser, composeControlPlane(base.sessions, github)));
  let disposeApp: (() => void) | undefined;
  let disposeNotice: (() => void) | undefined;
  let noticeLayer: HTMLElement | undefined;
  void import("../../ui/src/phrases").then(() => import("../../shell/src/app/main")).then(app => {
    disposeApp = app.disposeWindow;
    if (stopped) disposeApp();
  }).catch(base.onUnavailable);
  window.addEventListener("pagehide", () => fleet.close(), { once: true });
  // Abrir una pantalla que necesita la VM es una acción: se enciende una vez (`wake: true`) y se vuelve a leer.
  const waking = new Map<string, Promise<void>>();
  const onMachineAction = () => {
    const context = scope.current()?.context;
    for (const m of fleet.machines(context)) {
      const key = memberKey(m.id, m.context);
      if (!m.wakes || m.child || fleet.power(m.id, m.context) === "on" || waking.has(key)) continue;
      waking.set(key, fleet.wake(m.id, m.context)
        .then(() => { for (const name of ["harness:machines", "harness:service-resync"]) window.dispatchEvent(new CustomEvent(name)); })
        .catch(() => {})
        .finally(() => { waking.delete(key); bump(n => n + 1); }));
    }
  };
  const onFocus = () => {
    if (availability().kind === "no_machines") void refresh();
  };
  window.addEventListener("focus", onFocus);
  window.addEventListener(MACHINE_ACTION, onMachineAction);
  void Promise.all([import("solid-js/web"), import("../../features/machines/src/model/SyncNote"), import("./UpdateNotice"), import("./ReauthNote"), import("../../ui/src/phrases")]).then(([{ render }, { MachineStates, MachinesUnavailableNote }, { UpdateNotice }, { ReauthNote, WorkspaceNote }]) => {
    if (stopped) return;
    const layer = document.createElement("div");
    noticeLayer = layer;
    document.body.append(layer);
    disposeNotice = render(() => (
      <>
        <MachineStates machines={machines} /><MachinesUnavailableNote unavailable={missing()} />
        <UpdateNotice />{base.billing.returned()}<ReauthNote reauth={base.reauth} /><WorkspaceNote preparing={base.preparing} />
      </>
    ), layer);
  });
  return { refresh, close: () => { stopped = true; window.removeEventListener("focus", onFocus); window.removeEventListener(MACHINE_ACTION, onMachineAction); stopListing(); remoteGuests.close(); url.close(); active.close(); disposeApp?.(); disposeNotice?.(); noticeLayer?.remove(); } };
}
