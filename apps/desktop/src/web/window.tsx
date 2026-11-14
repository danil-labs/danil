import { type Machine, type machinesClient, machineToComputer, RelaySession } from "@terminus/computers";
import { classOf, Fleet, relayLink, unwrap } from "@terminus/fleet";
import { createRouter, type SliceChange } from "../features/machines/router";
import { directoryEntries } from "../features/shell/workspace-directory";
import { createSignal, lazy, Suspense } from "solid-js";
import { leerPref } from "../lib/prefs";
import { t } from "../lib/i18n";
import { setCapabilities, type Capabilities, type WebAccountsSource } from "../lib/platform";
import { deliver } from "../lib/serviceEvents";
import { installIpc } from "./ipc";
import { type BrowserHost, createWebTransport } from "./transport";
import type { MachineRow, MachineStatus } from "./SyncNote";
import type { AccountProfileSource } from "../features/settings/account-profile";

declare const __TERMINUS_VERSION__: string;
type Base = { machines: ReturnType<typeof machinesClient>; relayOrigin: string; permits: (name: string) => boolean; organizations?: Capabilities["organizations"]; onUnauthorized: () => void; profile: AccountProfileSource; workspaces: NonNullable<Capabilities["webWorkspaces"]>; onUnavailable: () => void; };
const Picker = lazy(() => import("../features/machines/MachinePicker").then(m => ({ default: m.MachinePicker })));
const AccountMachines = lazy(() => import("../features/machines/AccountMachines"));
/** Another machine's slice changed: the window rereads just that. */
function slicesChanged(changes: SliceChange[]) {
  if (changes.includes("workspaces")) window.dispatchEvent(new CustomEvent("harness:workspace-name"));
  window.dispatchEvent(new CustomEvent("harness:machine-slices", { detail: { changes } }));
  if (changes.includes("attention")) window.dispatchEvent(new CustomEvent("harness:service-resync"));
}
const browser: BrowserHost = {
  openUrl: url => void window.open(url, "_blank", "noopener,noreferrer"), confirm: message => window.confirm(message),
  alert: message => window.alert(message), reload: () => window.location.reload(),
  writeText: text => navigator.clipboard.writeText(text), readText: () => navigator.clipboard.readText(),
};
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
  const fleet = new Fleet({ self: null, storage: mounted.storage,
    connect: info => {
      const relay = new RelaySession({ endpoint: base.relayOrigin, computerId: info.id,
        getAdmission: async () => {
          if (!base.permits("machines.session")) throw unavailable();
          const reply = await base.machines.admission(info.id);
          if (reply.kind === "unauthorized") base.onUnauthorized();
          if (reply.kind !== "ok") throw unavailable();
          return reply.value;
        },
        onUnauthorized: () => void refresh(),
      });
      const link = relayLink(relay, () => relay.state() === "unknown" ? machineToComputer(listed.get(info.id)!).state : relay.state());
      return { ...link, call: async (...args) => {
        // El canal de tickets no enciende: la intención espera al plano de control.
        if (classOf(args[1]) === "intent") await fleet.wake(info.id);
        return link.call(...args);
      } };
    },
    wake: async id => {
      if (!base.permits("machines.start")) return "not_startable";
      const answer = await base.machines.start(id);
      if (answer.kind === "unauthorized") base.onUnauthorized();
      if (answer.kind === "ok") { void refresh(); return true; }
      return answer.kind === "error" && answer.code === "not_remotely_startable" ? "not_startable" : false;
    },
    onChange: id => {
      window.dispatchEvent(new CustomEvent("harness:machines"));
      const power = fleet.power(id);
      const changed = powers.get(id) !== power;
      if (power === "on" && powers.get(id) !== "on" && active.unlisted()) window.dispatchEvent(new CustomEvent("harness:workspace"));
      powers.set(id, power);
      if (changed) void refresh();
      void import("../features/machines/store").then(({ machineNamesChanged, refetchMachines }) => {
        if (stopped) return;
        machineNamesChanged();
        void refetchMachines();
      });
    },
    onEvents: (_id, events, gap) => {
      if (events.length) active.events(_id, events);
      if (gap) window.dispatchEvent(new CustomEvent("harness:service-resync"));
    },
    onSlice: () => bump(n => n + 1),
  });
  const active = createRouter({ self: null, fleet, native: null, deliver, onSlices: slicesChanged, directory: directoryEntries,
    pickedFor: workspace => {
      const picked: Record<string, string> = leerPref("machines.run_on", {});
      return workspace ? picked[workspace] ?? null : null;
    },
  });
  const status = (id: string): MachineStatus => {
    const power = fleet.power(id);
    return power === "on" ? "online" : power === "off" ? "offline" : power;
  };
  const machines = (): MachineRow[] => {
    revision();
    const slices = fleet.sliceStatuses();
    return fleet.machines().map(m => ({ id: m.id, name: m.name, status: status(m.id), at: slices[m.id]?.status === "cached" ? slices[m.id].at : null }));
  };
  const several = () => {
    revision();
    return fleet.machines().length > 1;
  };
  async function update() {
    if (stopped) return false;
    if (!base.permits("machines")) { setMissing(true); fleet.setMachines([]); return false; }
    const answer = await base.machines.list();
    if (stopped) return false;
    if (answer.kind === "unauthorized") { base.onUnauthorized(); return false; }
    if (answer.kind !== "ok") {
      if (answer.kind === "error" && (answer.status === null || answer.status === 408 || answer.status === 429 || answer.status >= 500)) return false;
      setMissing(true); fleet.setMachines([]); return false;
    }
    listed = new Map(answer.value.map(machine => [machine.machine_id, machine]));
    setMissing(false);
    bump(n => n + 1);
    fleet.setMachines(answer.value.map(machine => ({ id: machine.machine_id, name: machine.name || machine.machine_id,
      wakes: machineToComputer(machine).wakeable === true && base.permits("machines.start"),
    })));
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
    accountProfile: base.profile,
    webWorkspaces: base.workspaces,
    organizations: base.organizations,
    initialSettings: takeSettingsParam(),
    machineName: id => id === "local" && missing() ? t("web.machines.unavailable") : fleet.name(id),
    taskMachine: id => unwrap(id, fleet.remotes())?.machine ?? null,
    windowMachine: () => { const id = active.createsOn(null)?.machine; return id ? { id, name: fleet.name(id), local: false } : undefined; },
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
      return fleet.license();
    },
    accountComputers: { list: async () => { const answer = await base.machines.list(); return answer.kind === "ok" ? { kind: "ok", value: answer.value.map(machineToComputer) } : answer.kind === "unavailable" ? { kind: "error", status: answer.status } : answer; }, onRenamed: () => {}, subscribe: changed => { window.addEventListener("harness:machines", changed); return () => window.removeEventListener("harness:machines", changed); } },
    webAccounts: mounted.webAccounts,
    retryMachines: () => { fleet.retry(); void refresh(); },
  });
  installIpc(window, createWebTransport(active, __TERMINUS_VERSION__, browser));
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
  return { refresh, close: () => { stopped = true; fleet.close(); disposeApp?.(); disposeNotice?.(); noticeLayer?.remove(); } };
}

/** Paneles que se abren desde la URL (`?settings=`); el parámetro sale de la barra al leerlo. */
const LINKED_SETTINGS = ["cuenta-danil", "emails", "business", "fiscal"];

function takeSettingsParam(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  const wanted = params.get("settings");
  if (wanted === null) return undefined;
  params.delete("settings");
  const rest = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
  return LINKED_SETTINGS.includes(wanted) ? wanted : undefined;
}

