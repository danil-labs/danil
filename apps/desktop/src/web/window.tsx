import { type Computer, type MachineState, RelaySession, linkedWorkspaces, organizationOf, serviceFeatures, orderComputers, startedOf, systemOf, wakes, type computeClient } from "@terminus/computers";
import { Fleet, type Link, type MachineInfo, relayLink, unwrap } from "@terminus/fleet";
import { createSignal, lazy, Suspense } from "solid-js";
import { createRouter, type Router, type SliceChange } from "../features/machines/router";
import { directoryEntries } from "../features/shell/workspace-directory";
import { t } from "../lib/i18n";
import { leerPref } from "../lib/prefs";
import { setCapabilities, type Capabilities, type WebAccountsSource } from "../lib/platform";
import { deliver } from "../lib/serviceEvents";
import { installIpc } from "./ipc";
import { type BrowserHost, createWebTransport } from "./transport";
import type { MachineRow, MachineStatus } from "./SyncNote";
import type { AccountProfileSource } from "../features/settings/account-profile";

declare const __TERMINUS_VERSION__: string;
type Base = { compute: ReturnType<typeof computeClient>; profile: AccountProfileSource; workspaces: NonNullable<Capabilities["webWorkspaces"]>; onUnauthorized: () => void; onUnavailable: () => void; };
const RELIST_SOON = 1_000;
const UNLINKED_AGAIN = 60_000;
const Picker = lazy(() => import("../features/machines/MachinePicker").then(m => ({ default: m.MachinePicker })));
const AccountMachines = lazy(() => import("../features/machines/AccountMachines"));
const browser: BrowserHost = {
  openUrl: url => void window.open(url, "_blank", "noopener,noreferrer"), confirm: message => window.confirm(message),
  alert: message => window.alert(message), reload: () => window.location.reload(),
  writeText: text => navigator.clipboard.writeText(text), readText: () => navigator.clipboard.readText(),
};
/** The machine picked in «Ejecutar en» for `workspace` (`features/machines/store.ts`), remembered per workspace. */
const pickedFor = (workspace: string | null) => (workspace ? (leerPref<Record<string, string>>("machines.run_on", {})[workspace] ?? null) : null);

const infoOf = (c: Computer): MachineInfo => {
  const os = systemOf(c.os);
  return {
    id: c.computer_id,
    name: c.name?.trim() || c.computer_id,
    wakes: wakes(c),
    linked: linkedWorkspaces(c),
    organization: organizationOf(c),
    features: serviceFeatures(c),
    ...(c.host_version ? { version: c.host_version } : {}),
    ...(os ? { os } : {}),
  };
};

/**
 * A relay session whose state, until the relay says it, is the one of its row
 * in `/v1/computers`: a machine listed off with a saved slice is not asked.
 */
function rowLink(relay: RelaySession, row: () => string | undefined): Link {
  return relayLink(relay, () => (relay.state() === "unknown" ? ((row() as MachineState | undefined) ?? "unknown") : relay.state()));
}

/** Another machine's slice changed: the window rereads just that. */
function slicesChanged(changes: SliceChange[]) {
  if (changes.includes("workspaces")) window.dispatchEvent(new CustomEvent("harness:workspace-name"));
  window.dispatchEvent(new CustomEvent("harness:machine-slices", { detail: { changes } }));
  if (changes.includes("attention")) window.dispatchEvent(new CustomEvent("harness:service-resync"));
}

/** What only a page with Danil accounts adds (`start`): the account's own saved slices, the other accounts and the workspace asked in `?w=`. */
type Mounted = { storage: import("@terminus/fleet").StorageLike | null; webAccounts?: WebAccountsSource; workspace?: string | null };

/** Mounts the app; what it returns applies a newer computer list (machines, names, links) without remounting. */
export function mountWindow(computers: Computer[], base: Base, mounted: Mounted) {
  const [changed, bump] = createSignal(0);
  let rows = new Map(computers.map((c) => [c.computer_id, c]));
  // A workspace linked from the desktop after the page loaded: its events arrive before its row says it.
  const unlinkedAt = new Map<string, number>();
  let soon: ReturnType<typeof setTimeout> | undefined;
  const relistSoon = () => {
    clearTimeout(soon);
    soon = setTimeout(() => void base.compute.list().then(answer => { if (answer.kind === "ok") relist(answer.value); }), RELIST_SOON);
  };
  let router: Router | null = null;
  const powers = new Map<string, string>();
  const fleet = new Fleet({
    self: null,
    connect: (info) =>
      rowLink(
        new RelaySession({
          endpoint: "https://connect.danil.ai",
          computerId: info.id,
          getAdmission: () => base.compute.admission(info.id),
          onUnauthorized: base.onUnauthorized,
        }),
        () => rows.get(info.id)?.state,
      ),
    // Sin `contracts` ni `compatible`, como el teléfono: un motor con otro contrato
    // sigue en servicio y solo falla la orden que no conoce (nunca la máquina entera).
    wake: async (id) => startedOf(await base.compute.start(id)),
    storage: mounted.storage,
    onSlice: () => bump((n) => n + 1),
    // La cola de aplazadas cambió (aquí, en el escritorio o en el teléfono): la lista se relee.
    onDeferred: (machine) => router?.deferredChanged(machine),
    onChange: (machine) => {
      window.dispatchEvent(new CustomEvent("harness:machines"));
      bump((n) => n + 1);
      const now = fleet.power(machine);
      // Sin workspaces de nadie al abrir: la primera máquina que se enciende los trae.
      if (now === "on" && powers.get(machine) !== "on" && router?.unlisted()) window.dispatchEvent(new CustomEvent("harness:workspace"));
      powers.set(machine, now);
    },
    onEvents: (machine, events, gap) => {
      if (events.length) router?.events(machine, events);
      if (gap) {
        window.dispatchEvent(new CustomEvent("harness:service-resync"));
        window.dispatchEvent(new CustomEvent("harness:service-gap"));
      }
      // Renamed, linked or unlinked in the account's registry: the links of each machine may have changed too.
      if (events.some((e) => e.name === "workspace.changed")) relistSoon();
    },
    onUnlinked: (_machine, workspaces) => {
      const now = Date.now();
      const fresh = workspaces.filter((w) => now - (unlinkedAt.get(w) ?? 0) >= UNLINKED_AGAIN);
      if (!fresh.length) return;
      for (const w of fresh) unlinkedAt.set(w, now);
      relistSoon();
    },
  });
  // The account's workspaces list even with every machine of theirs asleep; an older control plane answers none.
  const registry = async () => {
    const answer = await base.compute.workspaces();
    if (answer.kind === "unauthorized") base.onUnauthorized();
    else if (answer.kind !== "ok" && answer.kind !== "missing") base.onUnavailable();
    return answer.kind === "ok" ? answer.value : null;
  };
  const active = createRouter({ self: null, fleet, native: null, registry, onSlices: slicesChanged, deliver, pickedFor, directory: directoryEntries });
  router = active;
  // `?w=`: the page opens on that workspace of this account (the router keeps it while it is listed).
  if (mounted.workspace) void active.handle("set_active_workspace", { id: mounted.workspace }).catch(() => undefined);
  fleet.setMachines(orderComputers(computers).map(infoOf));
  fleet.subscribeEvents();

  const status = (id: string): MachineStatus => {
    const power = fleet.power(id);
    return power === "on" ? "online" : power === "off" ? "offline" : power;
  };
  const machines = (): MachineRow[] => {
    changed();
    const slices = fleet.sliceStatuses();
    return fleet.machines().map((m) => ({ id: m.id, name: m.name, status: status(m.id), at: slices[m.id]?.status === "cached" ? slices[m.id].at : null }));
  };
  const several = () => {
    changed();
    return fleet.machines().length > 1;
  };
  // A file dropped outside the chat would replace the page with it.
  for (const type of ["dragover", "drop"]) window.addEventListener(type, (e) => e.preventDefault());
  setCapabilities({
    nativeWindow: false, updater: false, localSetup: false, computerStatus: true, browserFiles: true, appDownloads: true,
    accountProfile: base.profile,
    webWorkspaces: base.workspaces,
    initialSettings: takeSettingsParam(),
    machineName: (id) => fleet.name(id),
    taskMachine: (id) => unwrap(id, fleet.remotes())?.machine ?? null,
    windowMachine: () => {
      const id = active.createsOn(null)?.machine;
      return id ? { id, name: fleet.name(id), local: false } : undefined;
    },
    remoteCreate: (workspace) => active.createsOn(workspace),
    machineOnCreate: (workspace) =>
      several() ? (
        <Suspense fallback={null}>
          <div class="flex items-center gap-1 pt-2 text-xs text-neutral-500" data-create-on="">
            <span>{t("web.machines.create_on")}</span>
            <Picker workspace={workspace} />
          </div>
        </Suspense>
      ) : null,
    accountComputers: {
      list: async () => base.compute.list(),
      onRenamed: () => {},
    },
    accountMachines: (props) =>
      several() ? (
        <Suspense fallback={null}>
          <AccountMachines {...props} machines={machines} />
        </Suspense>
      ) : null,
    machinesLicense: () => {
      changed();
      return fleet.license();
    },
    webAccounts: mounted.webAccounts,
    retryMachines: () => {
      fleet.retry();
      for (const name of ["harness:workspace-name", "harness:service-resync"]) window.dispatchEvent(new CustomEvent(name));
    },
  });
  /** A name changed in Configuración: the chips, the toasts and the picker read it without reloading. */
  function namesChanged() {
    bump((n) => n + 1);
    void import("../features/machines/store").then(({ machineNamesChanged, refetchMachines }) => {
      machineNamesChanged();
      void refetchMachines();
    });
  }
  installIpc(window, createWebTransport(active, __TERMINUS_VERSION__, browser));
  let stopped = false;
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
        <SyncNote machines={machines} />
        <UpdateNotice />
      </>
    ), layer);
  });
  const relist = (fresh: Computer[]) => {
    rows = new Map(fresh.map((c) => [c.computer_id, c]));
    active.registryChanged();
    const before = fleet.machines().map((m) => `${m.id}\u0000${m.name}`).join("\n");
    fleet.setMachines(orderComputers(fresh).map(infoOf));
    // Renamed from another window or the phone.
    if (fleet.machines().map((m) => `${m.id}\u0000${m.name}`).join("\n") !== before) namesChanged();
    // Every list of the window reads again, with the machines and links as they are now.
    for (const name of ["harness:workspace-name", "harness:service-resync"]) window.dispatchEvent(new CustomEvent(name));
  };
  return { relist, close: () => { stopped = true; clearTimeout(soon); fleet.close(); disposeApp?.(); disposeNotice?.(); noticeLayer?.remove(); } };
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

