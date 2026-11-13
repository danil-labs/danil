import { type Machine, type machinesClient, machineToComputer, RelaySession } from "@terminus/computers";
import { classOf, Fleet, relayLink, unwrap } from "@terminus/fleet";
import { createRouter } from "../features/machines/router";
import { createSignal } from "solid-js";
import { leerPref } from "../lib/prefs";
import { t } from "../lib/i18n";
import { setCapabilities, type Capabilities, type WebAccountsSource } from "../lib/platform";
import { deliver } from "../lib/serviceEvents";
import { installIpc } from "./ipc";
import { type BrowserHost, createWebTransport } from "./transport";
import type { AccountProfileSource } from "../features/settings/account-profile";

declare const __TERMINUS_VERSION__: string;
type Base = { machines: ReturnType<typeof machinesClient>; relayOrigin: string; permits: (name: string) => boolean; organizations: NonNullable<Capabilities["webOrganizations"]>; onUnauthorized: () => void; profile: AccountProfileSource; workspaces: NonNullable<Capabilities["webWorkspaces"]>; onUnavailable: () => void; };
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
    onSlice: () => window.dispatchEvent(new CustomEvent("harness:machine-slices", { detail: { changes: ["sessions", "projects", "workspaces"] } })),
  });
  const active = createRouter({ self: null, fleet, native: null, deliver,
    pickedFor: workspace => workspace ? leerPref<Record<string, string>>("machines.run_on", {})[workspace] ?? null : null,
  });
  async function update() {
    if (stopped) return false;
    if (!base.permits("machines")) { setMissing(true); fleet.setMachines([]); return false; }
    const answer = await base.machines.list();
    if (stopped) return false;
    if (answer.kind === "unauthorized") { base.onUnauthorized(); return false; }
    if (answer.kind !== "ok") { setMissing(true); fleet.setMachines([]); return false; }
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
    webOrganizations: base.organizations,
    initialSettings: takeSettingsParam(),
    machineName: id => fleet.name(id),
    taskMachine: id => unwrap(id, fleet.remotes())?.machine ?? null,
    windowMachine: () => { const id = active.createsOn(null)?.machine; return id ? { id, name: fleet.name(id), local: false } : undefined; },
    remoteCreate: workspace => active.createsOn(workspace),
    accountComputers: { list: async () => { const answer = await base.machines.list(); return answer.kind === "ok" ? { kind: "ok", value: answer.value.map(machineToComputer) } : answer.kind === "unavailable" ? { kind: "error", status: answer.status } : answer; }, onRenamed: () => {}, subscribe: changed => { window.addEventListener("harness:machines", changed); return () => window.removeEventListener("harness:machines", changed); } },
    webAccounts: mounted.webAccounts,
    retryMachines: () => void refresh(),
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
        <SyncNote machines={() => { revision(); return [...listed.values()].map(machine => ({ id: machine.machine_id, name: machine.name || machine.machine_id, status: machine.state === "starting" ? "starting" : machineToComputer(machine).state === "online" ? "online" : "offline", at: null })); }} unavailable={missing()} />
        <UpdateNotice />
      </>
    ), layer);
  });
  return { refresh, close: () => { stopped = true; fleet.close(); disposeApp?.(); disposeNotice?.(); noticeLayer?.remove(); } };
}

/** Paneles que se abren desde la URL (`?settings=`); el parámetro sale de la barra al leerlo. */
const LINKED_SETTINGS = ["cuenta-danil"];

function takeSettingsParam(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  const wanted = params.get("settings");
  if (wanted === null) return undefined;
  params.delete("settings");
  const rest = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
  return LINKED_SETTINGS.includes(wanted) ? wanted : undefined;
}

