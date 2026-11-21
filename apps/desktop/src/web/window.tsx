import { type Machine, type machinesClient, machineToComputer, RelaySession } from "@terminus/computers";
import { Fleet, memberKey, relayLink, unwrap } from "@terminus/fleet";
import { createSignal, lazy, Suspense } from "solid-js";
import { createContextRelayPool, machinesListed } from "../features/machines";
import { sessionRailState } from "../features/shell";
import { createRouter, type SliceChange } from "../features/machines/router";
import type { AccountProfileSource } from "../features/settings/account-profile";
import { t } from "../lib/i18n";
import { type Capabilities, setCapabilities, type WebAccountsSource } from "../lib/platform";
import { leerPref } from "../lib/prefs";
import { deliver } from "../lib/serviceEvents";
import { installIpc } from "./ipc";
import type { MachineRow, MachineStatus } from "./SyncNote";
import { createWebTransport } from "./transport";
import { browser, takeSettingsParam } from "./window-browser";
import { webMachineCall } from "./workspace-runtime";
import { windowContext } from "./window-context";
import { openWorkspaceUrl } from "./open-workspace-url";

declare const __TERMINUS_VERSION__: string;
type Base = { billing: ReturnType<typeof import("./window-billing").windowBilling>; contextMachines: (context: string) => ReturnType<typeof machinesClient>; sessions: import("./web-session-contexts").WebSessionCommands; active: ReturnType<typeof import("./window-active-context").windowActiveContext>; rail?: Capabilities["webRailCatalog"]; relayOrigin: string; credentials?: Capabilities["accountCredentials"]; permits: (name: string) => boolean; organizations?: Capabilities["organizations"]; promo?: Capabilities["webPromo"]; groupAccount?: Capabilities["groupAccount"]; reauth?: Capabilities["webReauth"]; preparing?: () => boolean; profile: AccountProfileSource; services: Pick<Capabilities, "webWorkspacePicker" | "danilCredits">; onUnavailable: () => void; };
const Picker = lazy(() => import("../features/machines/MachinePicker").then(m => ({ default: m.MachinePicker })));
const AccountMachines = lazy(() => import("../features/machines/AccountMachines"));
/** Another machine's slice changed: the window rereads just that. */
function slicesChanged(changes: SliceChange[]) {
  if (changes.includes("workspaces")) window.dispatchEvent(new CustomEvent("harness:workspace-name"));
  window.dispatchEvent(new CustomEvent("harness:machine-slices", { detail: { changes } }));
  if (changes.includes("attention")) window.dispatchEvent(new CustomEvent("harness:service-resync"));
}
/** Browser storage is scoped by the authenticated person and selected workspace. */
type Mounted = { storage: import("@terminus/fleet").StorageLike | null; webAccounts?: WebAccountsSource };

/** Mounts the real window before optional machine services are available. */
export function mountWindow(base: Base, mounted: Mounted) {
  let stopped = false;
  let refreshing: Promise<boolean> | undefined;
  const [missing, setMissing] = createSignal(true);
  const [revision, bump] = createSignal(0);
  let listed = new Map<string, Machine>();
  const powers = new Map<string, string>();
  const unavailable = () => ({ what: t("web.machines.unavailable"), detail: "machines_unavailable" });
  const pool = createContextRelayPool();
  const scope = windowContext({ factory: base.contextMachines, sessions: base.sessions, groups: () => base.active.groups(), fallback: () => base.active.current()?.context ?? null, active: () => active.activeContext(), fleet: () => fleet, revision, onContextsSettled: contexts => { active.pruneContexts(contexts); bump(n => n + 1); }, onContextState: (context, expired) => sessionRailState()?.sessions.noteContext(context, expired) });
  const fleet: Fleet = new Fleet({ self: null, storage: mounted.storage,
    connect: info => {
      const create = () => {
        const relay = new RelaySession({ endpoint: base.relayOrigin, computerId: info.id,
          getAdmission: async () => {
            if (!base.permits("machines.session")) throw unavailable();
            const reply = await scope.client(info.context).admission(info.id);
            if (reply.kind === "unauthorized") void refresh();
            if (reply.kind !== "ok") throw unavailable();
            return reply.value;
          },
          onUnauthorized: () => void refresh(),
        });
        const link = relayLink(relay, () => relay.state() === "unknown" ? machineToComputer(listed.get(memberKey(info.id, info.context))!).state : relay.state());
        return { ...link, call: webMachineCall(link, fleet, info.id, info.context) };
      };
      return info.context ? pool.link(info.id, create, { onSuspend: () => active.attentionSuspended(info.id, info.context), onResume: (value) => active.attentionResumed(info.id, info.context, value) }) : create();
    },
    wake: async (id, context) => {
      if (!base.permits("machines.start")) return "not_startable";
      const answer = await scope.client(context).wake(id);
      if (answer.kind === "unauthorized") void refresh();
      if (answer.kind === "ok") { void refresh(); return true; }
      return answer.kind === "error" && answer.code === "not_remotely_startable" ? "not_startable" : false;
    },
    onChange: (id, context) => {
      window.dispatchEvent(new CustomEvent("harness:machines"));
      const power = fleet.power(id, context);
      const key = memberKey(id, context);
      const changed = powers.get(key) !== power;
      if (power === "on" && powers.get(key) !== "on" && active.unlisted()) window.dispatchEvent(new CustomEvent("harness:workspace"));
      powers.set(key, power);
      if (changed) void refresh();
      bump(n => n + 1);
      void import("../features/machines/store").then(({ machineNamesChanged, refetchMachines }) => {
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
  const active = createRouter({ contextInfo: scope.routing, organizationMachine: scope.organizationMachine, self: null, fleet, native: null, deliver, onSlices: slicesChanged,
    pickedFor: workspace => {
      const picked: Record<string, string> = leerPref("machines.run_on", {});
      return workspace ? picked[workspace] ?? null : null;
    },
  });
  const url = openWorkspaceUrl(active, base.sessions);
  const status = (id: string, context?: string): MachineStatus => {
    const power = fleet.power(id, context);
    return power === "on" ? "online" : power === "off" ? "offline" : power;
  };
  const machines = (): MachineRow[] => {
    revision();
    const slices = fleet.sliceStatuses(scope.current()?.context);
    return fleet.machines().map(m => ({ id: m.id, name: m.name, status: status(m.id, m.context), at: slices[m.id]?.status === "cached" ? slices[m.id].at : null }));
  };
  const several = () => {
    revision();
    return fleet.machines().length > 1;
  };
  // El chip de la VM en Cuentas de IA se ve aunque sea la única: «Ejecutar en» sí pide más de una.
  const any = () => {
    revision();
    return fleet.machines().length > 0;
  };
  async function update() {
    if (stopped) return false;
    if (!base.permits("machines")) { setMissing(true); fleet.setMachines([]); return false; }
    const inventory = await scope.inventory();
    if (!inventory) { setMissing(true); fleet.setMachines([]); bump(n => n + 1); return false; }
    const { answer, rows } = inventory;
    if (stopped) return false;
    if (answer.kind !== "ok") {
      bump(n => n + 1);
      if (answer.kind === "error" && (answer.status === null || answer.status === 408 || answer.status === 429 || answer.status >= 500)) return false;
      setMissing(true); fleet.setMachines([]); return false;
    }
    listed = new Map(rows.map(({ machine, group }) => [memberKey(machine.machine_id, group.context), machine]));
    setMissing(false);
    bump(n => n + 1);
    fleet.setMachines(rows.map(({ machine, group }) => ({ id: machine.machine_id, name: scope.machineName(machine, group, rows),
      wakes: machineToComputer(machine).wakeable === true && base.permits("machines.start"), kind: scope.fleetKind(machine, group), hosted: machine.kind !== "personal", context: group.context, organizationId: machine.organization_id ?? null,
    })));
    for (const { machine, group } of rows) fleet.observe(machine.machine_id, machineToComputer(machine).state, group.context);
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
    machineName: id => id === "local" && missing() ? t("web.machines.unavailable") : fleet.name(id, scope.current()?.context),
    taskWritable: id => {
      revision();
      const context = scope.current()?.context;
      const task = unwrap(id, fleet.remotes(context));
      return !!task && fleet.canContinue(task.machine, context);
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
  installIpc(window, createWebTransport(scope.engine(active), __TERMINUS_VERSION__, browser, base.sessions));
  let disposeApp: (() => void) | undefined;
  let disposeNotice: (() => void) | undefined;
  let noticeLayer: HTMLElement | undefined;
  void import("./phrases").then(() => import("../app/main")).then(app => {
    disposeApp = app.disposeWindow;
    if (stopped) disposeApp();
  }).catch(base.onUnavailable);
  window.addEventListener("pagehide", () => fleet.close(), { once: true });
  void Promise.all([import("solid-js/web"), import("./SyncNote"), import("./UpdateNotice"), import("./ReauthNote"), import("./phrases")]).then(([{ render }, { SyncNote }, { UpdateNotice }, { ReauthNote, WorkspaceNote }]) => {
    if (stopped) return;
    const layer = document.createElement("div");
    noticeLayer = layer;
    document.body.append(layer);
    disposeNotice = render(() => (
      <>
        <SyncNote machines={machines} unavailable={missing()} />
        <UpdateNotice />{base.billing.returned()}<ReauthNote reauth={base.reauth} /><WorkspaceNote preparing={base.preparing} />
      </>
    ), layer);
  });
  return { refresh, close: () => { stopped = true; stopListing(); url.close(); active.close(); disposeApp?.(); disposeNotice?.(); noticeLayer?.remove(); } };
}

