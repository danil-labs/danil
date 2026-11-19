import { type Machine, type machinesClient, machineToComputer, RelaySession } from "@terminus/computers";
import { classOf, Fleet, memberKey, relayLink, unwrap } from "@terminus/fleet";
import { createSignal, lazy, Suspense } from "solid-js";
import { createContextRelayPool, machinesListed } from "../features/machines";
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
import { windowContext } from "./window-context";

declare const __TERMINUS_VERSION__: string;
type Base = { contextMachines?: (context: string) => ReturnType<typeof machinesClient>; machines: ReturnType<typeof machinesClient>; relayOrigin: string; permits: (name: string) => boolean; organizations?: Capabilities["organizations"]; promo?: Capabilities["webPromo"]; groupAccount?: Capabilities["groupAccount"]; onUnauthorized: () => void; profile: AccountProfileSource; services: Pick<Capabilities, "webWorkspaces" | "danilCredits">; onUnavailable: () => void; };
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
  const scope = windowContext({ legacy: base.machines, factory: base.contextMachines, account: base.groupAccount, fleet: () => fleet, revision, onContextsSettled: contexts => { active.pruneContexts(contexts); bump(n => n + 1); } });
  const fleet = new Fleet({ self: null, storage: mounted.storage,
    connect: info => {
      const create = () => {
        const relay = new RelaySession({ endpoint: base.relayOrigin, computerId: info.id,
          getAdmission: async () => {
            if (!base.permits("machines.session")) throw unavailable();
            const reply = await scope.client(info.context).admission(info.id);
            if (reply.kind === "unauthorized") base.onUnauthorized();
            if (reply.kind !== "ok") throw unavailable();
            return reply.value;
          },
          onUnauthorized: () => void refresh(),
        });
        const link = relayLink(relay, () => relay.state() === "unknown" ? machineToComputer(listed.get(memberKey(info.id, info.context))!).state : relay.state());
        return { ...link, call: async (...args: Parameters<typeof link.call>) => {
          // El canal de tickets no enciende: la intención espera al plano de control.
          if (classOf(args[1]) === "intent") await fleet.wake(info.id, info.context);
          return link.call(...args);
        } };
      };
      return info.context ? pool.link(info.id, create, { onSuspend: () => active.attentionSuspended(info.id, info.context), onResume: (value) => active.attentionResumed(info.id, info.context, value) }) : create();
    },
    wake: async (id, context) => {
      if (!base.permits("machines.start")) return "not_startable";
      const answer = await scope.client(context).start(id);
      if (answer.kind === "unauthorized") base.onUnauthorized();
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
  const active = createRouter({ contextInfo: scope.info, self: null, fleet, native: null, deliver, onSlices: slicesChanged,
    pickedFor: workspace => {
      const picked: Record<string, string> = leerPref("machines.run_on", {});
      return workspace ? picked[workspace] ?? null : null;
    },
  });
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
  async function update() {
    if (stopped) return false;
    if (!base.permits("machines")) { setMissing(true); fleet.setMachines([]); return false; }
    const inventory = await scope.inventory();
    if (!inventory) { setMissing(true); fleet.setMachines([]); bump(n => n + 1); return false; }
    const { answer, group } = inventory;
    if (stopped) return false;
    if (answer.kind === "unauthorized") { base.onUnauthorized(); return false; }
    if (answer.kind !== "ok") {
      bump(n => n + 1);
      if (answer.kind === "error" && (answer.status === null || answer.status === 408 || answer.status === 429 || answer.status >= 500)) return false;
      setMissing(true); fleet.setMachines([]); return false;
    }
    listed = new Map(answer.value.map(machine => [memberKey(machine.machine_id, group?.context), machine]));
    setMissing(false);
    bump(n => n + 1);
    fleet.setMachines(answer.value.map(machine => ({ id: machine.machine_id, name: machine.name || machine.machine_id,
      wakes: machineToComputer(machine).wakeable === true && base.permits("machines.start"), kind: group ? machine.kind === "personal" ? "personal" : "organization" : machine.kind ?? null, context: group?.context, organizationId: machine.organization_id ?? null,
    })));
    machinesListed(fleet);
    fleet.subscribeEvents();
    if (active.activeContext() !== (group?.context ?? null)) await active.handle("set_active_workspace", { id: base.services.webWorkspaces?.active() ?? null }, { headers: { "x-danil-context": group?.context ?? "" } });
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
    accountProfile: base.profile,
    ...base.services,
    organizations: base.organizations,
    initialSettings: takeSettingsParam(),
    machineName: id => id === "local" && missing() ? t("web.machines.unavailable") : fleet.name(id, scope.current()?.context),
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
      several() ? (
        <Suspense fallback={null}>
          <AccountMachines {...props} machines={machines} />
        </Suspense>
      ) : null,
    machinesLicense: () => {
      revision();
      return fleet.license(scope.current()?.context);
    },
    accountComputers: { list: async () => { const answer = await scope.client(scope.current()?.context).list(); return answer.kind === "ok" ? { kind: "ok", value: answer.value.map(machineToComputer) } : answer.kind === "unavailable" ? { kind: "error", status: answer.status } : answer; }, onRenamed: () => {}, subscribe: changed => { window.addEventListener("harness:machines", changed); return () => window.removeEventListener("harness:machines", changed); } },
    webAccounts: mounted.webAccounts,
    webRailSource: scope.source, webPromo: base.promo, groupAccount: base.groupAccount,
    retryMachines: () => { fleet.retry(); void refresh(); },
  });
  installIpc(window, createWebTransport(scope.engine(active), __TERMINUS_VERSION__, browser));
  let disposeApp: (() => void) | undefined;
  let disposeNotice: (() => void) | undefined;
  let noticeLayer: HTMLElement | undefined;
  void import("./phrases").then(() => import("../app/main")).then(app => {
    disposeApp = app.disposeWindow;
    if (stopped) disposeApp();
  }).catch(base.onUnavailable);
  window.addEventListener("pagehide", () => fleet.close(), { once: true });
  void Promise.all([import("solid-js/web"), import("./SyncNote"), import("./UpdateNotice"), import("./phrases")]).then(([{ render }, { SyncNote }, { UpdateNotice }]) => {
    if (stopped) return;
    const layer = document.createElement("div");
    noticeLayer = layer;
    document.body.append(layer);
    disposeNotice = render(() => (
      <>
        <SyncNote machines={machines} unavailable={missing()} />
        <UpdateNotice />
      </>
    ), layer);
  });
  return { refresh, close: () => { stopped = true; stopListing(); active.close(); disposeApp?.(); disposeNotice?.(); noticeLayer?.remove(); } };
}

