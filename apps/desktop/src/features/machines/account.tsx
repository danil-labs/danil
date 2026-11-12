/**
 * With the Danil account signed in, this window adds the tasks of the other
 * computers of the person to its own (`router.ts`, `@terminus/fleet`): its own
 * engine keeps the native IPC and paints first, and each other computer is one
 * relay session that only adds its slice. With one session per account, it is
 * the account of the open workspace: its client token, its computers and its
 * registry; switching to a workspace of another account installs that one. A
 * workspace of no account talks as the default one. The workspaces of
 * other machines come from this engine (`state_machines`) when it has them,
 * for every session at once. With no session at all, a local guest (WSL) gets
 * a guests-only fleet as `"local"`; with no guest either, nothing is installed.
 * Lazy from `app/main.tsx`.
 */
import "../../web/phrases";
import {
  type Computer,
  createScreenAccess,
  linkedWorkspaces,
  organizationOf,
  serviceFeatures,
  listComputers,
  listWorkspaces,
  createSpaceOrderSource,
  orderComputers,
  RelaySession,
  sessionProbe,
  startComputer,
  startedOf,
  systemOf,
  type MachineState,
  type SystemId,
  wakes,
} from "@terminus/computers";
import { Fleet, type MachineInfo, unwrap } from "@terminus/fleet";
import { createRoot, createSignal, For } from "solid-js";
import { render } from "solid-js/web";
import { t } from "../../lib/i18n";
import { setMachineRoute } from "../../lib/invoke";
import { whenConnected } from "../../lib/engineConnection";
import { leerPref } from "../../lib/prefs";
import { capabilities, setCapabilities, type Capabilities } from "../../lib/platform";
import { directoryEntries } from "../shell/workspace-directory";
import { deliver, listen } from "../../lib/serviceEvents";
import { isMac, isWindows } from "../../lib/window";
import { Toast, ToastPortal } from "../../ui/Toast";
import type { MachineStatus } from "../../web/SyncNote";
import { type DanilSessionInfo, railSession, type WorkspaceAccount } from "../settings/danil-sessions";
import AccountMachines from "./AccountMachines";
import { MachinePicker } from "./MachinePicker";
import { createRouter, type Invoke, type Router, type SliceChange } from "./router";
import { createEngineWorkspaces, railOf } from "./engine-workspaces";
import { machineNamesChanged, refetchMachines } from "./store";
import type { WslChild } from "./wsl";
import { guestChannels } from "./guestChannels";
import { createGuestLink, guestMachineInfo, isGuestMachine, wakeGuestMachine } from "./guestLink";

type Internals = { invoke: Invoke };
type Target = Window & { __TAURI_INTERNALS__?: Internals };

/** `account_relay_token` (`proxy.rs`): the engine's short-lived client token of the account. */
type ClientToken = { token: string; expires_at: number; endpoint: string; computer_id: string };
type DanilStatus = { state: string; computer_id?: string | null };

const RELIST = 10 * 60_000;
const TOKEN_MARGIN = 60_000;
const TOAST_FOR = 5_000;

/** Who the fan-out is for: this computer, its account and the control plane. Another one installs anew. */
/** Sin cuenta: esta computadora es `"local"` (`machine_list`), como en el resto de la ventana. */
const LOCAL = "local";
const LOCAL_KEY = JSON.stringify([LOCAL, null, null]);

type Installed = { key: string; fleet: Fleet; router: Router; restore: () => void };

let started = false;

/**
 * Máquinas locales (Linux en esta PC): los huéspedes con motor son máquinas
 * hijas de esta computadora. No vienen del plano de control; se suman a la
 * flota con un enlace directo (`guestLink.ts`).
 */
let guestMachines: MachineInfo[] = [];
async function readGuestMachines(): Promise<MachineInfo[]> {
  if (!(await guestChannels()).length) return [];
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    // Solo ids de huésped: la flota local no sabe llegar a otra cosa (`connect` lanza).
    guestMachines = (await invoke<WslChild[]>("guest_children")).map(guestMachineInfo).filter((m) => isGuestMachine(m.id));
  } catch {
    // Sin canal o sin registro: la flota sigue con las de la cuenta.
  }
  return guestMachines;
}
let installed: Installed | null = null;
let syncing: Promise<void> | null = null;

/** El nombre con que la cuenta conoce a esta computadora («Macbook m4»); sin él, «Esta Mac». */
const [selfName, setSelfName] = createRoot(() => createSignal<string | null>(null));
const homeName = () => selfName() ?? (isMac() ? t("shell.machines.this_mac") : t("shell.machines.this_computer"));

/** Sistema de la ventana de escritorio. La web no carga este módulo. */
function windowSystem(): SystemId {
  if (isMac()) return "macos";
  if (isWindows()) return "windows";
  return "linux";
}

/** Tell every list of the window to read again: the machines behind it changed. */
function refresh() {
  for (const name of ["harness:workspace-name", "harness:sources", "harness:tasks-changed", "harness:service-resync"]) {
    window.dispatchEvent(new CustomEvent(name));
  }
  void refetchMachines();
}

/** Another machine's slice changed: the window rereads just that. */
function slicesChanged(changes: SliceChange[]) {
  if (changes.includes("workspaces")) window.dispatchEvent(new CustomEvent("harness:workspace-name"));
  window.dispatchEvent(new CustomEvent("harness:machine-slices", { detail: { changes } }));
  if (changes.includes("attention")) window.dispatchEvent(new CustomEvent("harness:service-resync"));
}

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

/** The machine picked in «Ejecutar en» for `workspace` (`store.ts`), remembered per workspace. */
const pickedFor = (workspace: string | null) => (workspace ? (leerPref<Record<string, string>>("machines.run_on", {})[workspace] ?? null) : null);

export function startAccountMachines(target: Target = window) {
  if (started) return;
  const found = target.__TAURI_INTERNALS__;
  if (!found) return;
  const internals: Internals = found;
  started = true;
  const native: Invoke = internals.invoke.bind(internals);
  // The window's own IPC under its usual name: the command guards read these two literally.
  const invoke = native;
  let token: ClientToken | null = null;
  /** Si esta computadora es una VM administrada, y su sistema. La lista los lee en cada `machine_list`. */
  let homeWakes = false;
  let homeOs: SystemId = windowSystem();
  let homeFeatures: string[] = [];
  let homeVersion: string | null = null;
  /** The session the fan-out talks as: the open workspace's account; `null` is the default one. */
  let account: string | null = null;
  // Los workspaces de otras máquinas que el motor de aquí conoce, de todas sus sesiones: el riel es de la persona, no del workspace abierto.
  const engineWorkspaces = createEngineWorkspaces({
    invoke,
    listen,
    features: async () => {
      const rows = (await invoke("machine_list", {})) as { features?: unknown }[] | null;
      const features = Array.isArray(rows) ? rows[0]?.features : null;
      return Array.isArray(features) ? features.filter((f): f is string => typeof f === "string") : [];
    },
    onChange: () => {
      bumpRail((n) => n + 1);
      if (!installed) return void window.dispatchEvent(new CustomEvent("harness:workspace-name"));
      observeEngine(installed.fleet);
      slicesChanged(["workspaces"]);
    },
  });
  // El riel sale del índice del motor cuando lo tiene; el capability lo lee con su señal.
  const [railRead, bumpRail] = createRoot(() => createSignal(0));
  setCapabilities({
    ...capabilities(),
    railWorkspaces: () => {
      railRead();
      const rows = engineWorkspaces.workspaces();
      return rows ? railOf(rows) : null;
    },
  });
  /** Lo que la vista del motor sabe de cada máquina vale hasta que su sesión del relay diga algo. */
  const observeEngine = (fleet: Fleet) => {
    for (const [id, state] of engineWorkspaces.machineStates()) if (fleet.has(id)) fleet.observe(id, state as MachineState);
  };

  const getToken = async (): Promise<ClientToken> => {
    if (token && token.expires_at - Date.now() > TOKEN_MARGIN) return token;
    const asked = account;
    const next = (await invoke("account_relay_token", asked ? { account: asked } : {})) as ClientToken;
    if (asked === account) token = next;
    return next;
  };

  const uninstall = () => {
    if (!installed) return;
    const gone = installed;
    installed = null;
    gone.restore();
    refresh();
  };

  const disconnect = () => {
    uninstall();
    const { spaceOrder: _order, ...rest } = capabilities();
    setCapabilities(rest);
  };

  /** `endpoint` null: modo local, solo huéspedes, sin nada de la cuenta (token, relay, registro, pantallas, espacios). */
  function install(self: string, endpoint: string | null, others: Computer[], key: string) {
    const [changed, bump] = createSignal(0);
    const fleet = new Fleet({
      self,
      connect: (info) => {
        if (isGuestMachine(info.id)) return createGuestLink(info.id);
        if (endpoint === null) throw { code: "unknown_machine", detail: info.id };
        return new RelaySession({
              endpoint,
              computerId: info.id,
              getToken: async () => (await getToken()).token,
              // Un upgrade sin licencia no trae cuerpo: se pregunta por HTTP para no reintentar en bucle.
              probe: async () => sessionProbe(endpoint, (await getToken()).token, info.id),
              onUnauthorized: () => {
                token = null;
                void sync();
              },
            });
      },
      // Sin `contracts` ni `compatible`, como el teléfono: un motor con otro contrato
      // sigue en servicio y solo falla la orden que no conoce (nunca la máquina entera).
      wake: async (id) => {
        if (isGuestMachine(id)) return wakeGuestMachine(id);
        if (endpoint === null) throw { code: "unknown_machine", detail: id };
        return startedOf(await startComputer(endpoint, (await getToken()).token, id));
      },
      storage: localStorage,
      onChange: () => {
        bump((n) => n + 1);
        window.dispatchEvent(new CustomEvent("harness:machines"));
      },
      // La cola de aplazadas cambió (aquí, en la web o en el teléfono): la lista se relee.
      onDeferred: (machine) => router.deferredChanged(machine),
      onSlice: () => bump((n) => n + 1),
      onEvents: (machine, events, gap) => {
        if (events.length) router.events(machine, events);
        if (gap) {
          window.dispatchEvent(new CustomEvent("harness:service-resync"));
          window.dispatchEvent(new CustomEvent("harness:service-gap"));
        }
      },
    });
    const router = createRouter({
      self,
      fleet,
      native,
      ...(endpoint === null
        ? {}
        : {
            registry: async () => {
              const answer = await listWorkspaces(endpoint, (await getToken()).token);
              if (answer.kind === "unauthorized") token = null;
              return answer.kind === "ok" ? answer.value : null;
            },
          }),
      onSlices: slicesChanged,
      deliver,
      pickedFor,
      directory: directoryEntries,
      engineWorkspaces: engineWorkspaces.workspaces,
      engineFeatures: engineWorkspaces.features,
      home: () => ({ wakes: homeWakes, os: homeOs, features: homeFeatures, version: homeVersion }),
    });
    fleet.setMachines([...others.map(infoOf), ...guestMachines]);
    observeEngine(fleet);
    fleet.subscribeEvents();
    const screens =
      endpoint === null
        ? null
        : createScreenAccess({
            endpoint,
            getToken: async () => (await getToken()).token,
            knows: (id) => id === self || !!fleet.info(id),
          });

    const status = (id: string): MachineStatus => {
      const power = fleet.power(id);
      return power === "on" ? "online" : power === "off" ? "offline" : power;
    };
    const previous: Capabilities = capabilities();
    setCapabilities({
      ...previous,
      ...(endpoint === null ? {} : { spaceOrder: createSpaceOrderSource(endpoint, async () => (await getToken()).token) }),
      machineName: (id) => (id === self ? homeName() : fleet.name(id)),
      taskMachine: (id) => unwrap(id, fleet.remotes())?.machine ?? null,
      windowMachine: () => ({ id: self, name: homeName(), local: true }),
      ...(screens ? { machineScreen: (id: string) => screens.opener(id) } : {}),
      remoteCreate: (workspace) => {
        const target = router.createsOn(workspace);
        return target && target.machine !== self ? target : null;
      },
      machineOnCreate: (workspace) => (
        <div class="flex items-center gap-1 pt-2 text-xs text-neutral-500" data-create-on="">
          <span>{t("web.machines.create_on")}</span>
          <MachinePicker workspace={workspace} />
        </div>
      ),
      // Bajo cada cuenta de IA, sus máquinas: el mismo componente que la web, con esta computadora primero; con una sola, nada.
      accountMachines: (props) => {
        changed();
        if (!fleet.machines().length) return null;
        return (
          <AccountMachines
            {...props}
            machines={() => {
              changed();
              return [
                { id: self, name: homeName(), status: "online" as const, at: null },
                ...fleet.machines().map((info) => ({ id: info.id, name: info.name, status: status(info.id), at: null })),
              ];
            }}
          />
        );
      },
      machinesLicense: () => {
        changed();
        return fleet.license();
      },
      retryMachines: () => {
        fleet.retry();
        refresh();
      },
    });
    const route = (command: string, args?: unknown, options?: { headers?: HeadersInit }) => router.handle(command, (args ?? {}) as Record<string, unknown>, options);
    setMachineRoute(route);
    const layer = document.createElement("div");
    document.body.append(layer);
    const unmount = render(
      () => (
        <MachineToasts
          machines={() => {
            changed();
            return fleet.machines().map((info) => ({ id: info.id, name: info.name, status: status(info.id), known: fleet.state(info.id) !== "unknown" }));
          }}
        />
      ),
      layer,
    );
    const onPageHide = () => fleet.flush();
    window.addEventListener("pagehide", onPageHide);
    installed = {
      key,
      fleet,
      router,
      restore: () => {
        screens?.close();
        setMachineRoute(null);
        window.removeEventListener("pagehide", onPageHide);
        setCapabilities(previous);
        unmount();
        layer.remove();
        router.close();
      },
    };
    // The groups of workspaces and the open one come from this read; the lists read after it.
    void router
      .handle("list_workspaces", {})
      .catch(() => null)
      .then(() => {
        if (installed?.router === router) refresh();
      });
  }

  /**
   * The computer and account the window's workspace talks as, asked for that
   * workspace by name: the engine's own open one may be another. An engine
   * without `danil_sessions` has one session, the one of `danil_connect_status`.
   */
  async function whoAmI(): Promise<{ self: string | null; account: string | null }> {
    const sessions = (await invoke("danil_sessions", {}).catch(() => null)) as DanilSessionInfo[] | null;
    if (Array.isArray(sessions)) {
      const listed = installed ? null : ((await invoke("list_workspaces", {}).catch(() => null)) as { active?: unknown } | null);
      const workspace = installed?.router.activeWorkspace() ?? (typeof listed?.active === "string" ? listed.active : null);
      const of = (await invoke("danil_workspace_account", workspace ? { workspace } : {}).catch(() => null)) as WorkspaceAccount | null;
      const session = railSession(sessions, of);
      return { self: session?.computer_id ?? null, account: session?.account ?? session?.computer_id ?? null };
    }
    const status = (await invoke("danil_connect_status", {}).catch(() => null)) as DanilStatus | null;
    return { self: status?.state === "connected" ? (status.computer_id ?? null) : null, account: null };
  }

  /** Reads the account and its computers; installs, updates or removes the fan-out to match. */
  async function check() {
    const who = await whoAmI();
    const self = who.self;
    if (who.account !== account) {
      // La flota local no habla como ninguna cuenta: la de la cuenta la reemplaza en el mismo tick.
      if (installed?.key !== LOCAL_KEY) uninstall();
      account = who.account;
      token = null;
    }
    if (!self) {
      token = null;
      return installLocal();
    }
    let client: ClientToken;
    try {
      client = await getToken();
    } catch {
      // An engine without `danil_client_token`, or a control plane without client tokens.
      return disconnect();
    }
    const answer = await listComputers(client.endpoint, client.token);
    if (answer.kind === "unauthorized" || answer.kind === "license") {
      token = null;
      return disconnect();
    }
    if (answer.kind !== "ok") return;
    const mine = answer.value.find((c) => c.computer_id === self);
    setSelfName(mine?.name?.trim() || null);
    homeWakes = mine ? wakes(mine) : false;
    homeOs = systemOf(mine?.os) ?? windowSystem();
    homeFeatures = mine ? serviceFeatures(mine) : [];
    homeVersion = mine?.host_version ?? null;
    const others = orderComputers(answer.value.filter((c) => c.computer_id !== self));
    await readGuestMachines();
    const key = JSON.stringify([self, account, client.endpoint]);

    // The same account: machines that came, left or changed name are applied live, without tearing the rest down.
    if (installed?.key === key) {
      installed.fleet.setMachines([...others.map(infoOf), ...guestMachines]);
      observeEngine(installed.fleet);
      machineNamesChanged();
      return void refetchMachines();
    }
    uninstall();
    install(self, client.endpoint, others, key);
  }

  /** Sin cuenta: la flota de los huéspedes, si hay alguno; si no, nada, como antes. */
  async function installLocal() {
    const guests = await readGuestMachines();
    if (!guests.length) return disconnect();
    if (installed?.key === LOCAL_KEY) {
      installed.fleet.setMachines([...guests]);
      machineNamesChanged();
      return void refetchMachines();
    }
    // Lo de la cuenta anterior no es de esta computadora sin cuenta.
    setSelfName(null);
    homeWakes = false;
    homeOs = windowSystem();
    homeFeatures = [];
    homeVersion = null;
    uninstall();
    install(LOCAL, null, [], LOCAL_KEY);
  }

  let again = false;
  /** One check at a time; a request during one runs again after it, so a workspace switch is never read stale. */
  const sync = (): Promise<void> => {
    if (syncing) {
      again = true;
      return syncing;
    }
    syncing = check()
      .catch(() => {})
      .finally(() => {
        syncing = null;
        if (again) {
          again = false;
          void sync();
        }
      });
    return syncing;
  };

  void whenConnected().then(() => {
    void listen("danil-connect", () => void sync());
    // Un motor sin el aviso de los workspaces de aquí: lo que cambia la ventana (crear, renombrar, logo) se vuelve a pedir con su versión.
    window.addEventListener("harness:workspace-name", () => void engineWorkspaces.refresh());
    window.addEventListener("harness:workspace", () => void engineWorkspaces.refresh());
    // El índice de aquí y las copias de las otras máquinas: la barra relee solo el recurso que cambió.
    void listen("state.changed", (e) => installed?.router.stateChanged(e.payload));
    void listen("state.copy_changed", (e) => installed?.router.copyChanged(e.payload));
    void listen("danil-sessions", () => {
      void sync();
      void engineWorkspaces.refresh();
    });
    // Another workspace may belong to another account: its computers are others.
    window.addEventListener("harness:workspace", () => void sync());
    // Una máquina recién conectada («Conectar otra máquina») suma su rebanada sin desmontar las demás.
    window.addEventListener("harness:account-computers", () => void sync());
    // Una VM conectada o quitada en Configuración: con cuenta o sin ella, la flota la suma o la quita.
    window.addEventListener("danil:guests-changed", () => void sync());
    setInterval(() => void sync(), RELIST);
    void engineWorkspaces.refresh();
    return sync();
  });
}

/** `known`: the relay already said its state; before that `offline` only means not asked yet. */
type Row = { id: string; name: string; status: MachineStatus; known: boolean };

/** A machine of the account that turns on or off says so once, without asking for anything. */
function MachineToasts(props: { machines: () => Row[] }) {
  const [shown, setShown] = createSignal<{ key: number; text: string }[]>([]);
  const last = new Map<string, MachineStatus>();
  let n = 0;
  const said = (row: Row) => {
    if (row.status === "online") return t("shell.machines.now_on", { name: row.name });
    if (row.status === "starting") return t("shell.machines.waking", { name: row.name });
    if (row.status === "offline") return t("shell.machines.now_off", { name: row.name });
    return null;
  };
  const watch = () => {
    for (const row of props.machines()) {
      if (!row.known) continue;
      const before = last.get(row.id);
      last.set(row.id, row.status);
      // The first state is how it was found, not a change.
      if (before === undefined || before === row.status) continue;
      const text = said(row);
      if (!text) continue;
      const key = ++n;
      setShown((list) => [...list.filter((x) => x.text !== text), { key, text }]);
      setTimeout(() => setShown((list) => list.filter((x) => x.key !== key)), TOAST_FOR);
    }
    return shown();
  };
  return (
    <ToastPortal>
      <For each={watch()}>
        {(toast) => (
          <Toast data-machine-toast="" onDismiss={() => setShown((list) => list.filter((x) => x.key !== toast.key))}>
            <span class="text-xs text-neutral-700">{toast.text}</span>
          </Toast>
        )}
      </For>
    </ToastPortal>
  );
}
