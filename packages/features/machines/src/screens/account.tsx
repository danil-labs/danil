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
import "../../../../ui/src/phrases";
import type { Computer } from "../../../../platform-client/src/api.ts";
import type { MachineState, SystemId } from "../../../../platform-client/src/machine.ts";
import { serviceFeatures } from "../model/links.ts";
import { RelaySession } from "../queries/relay.ts";
import { createScreenAccess } from "../queries/screen-access.ts";
import { settledContextIds } from "../../../../session/src/settled-contexts.ts";
import { cancelEdgeWrites, isRetiredComputersEndpoint, listComputers, readContextSpaces, sessionProbe, setMachineRoute, startComputer, startedOf, wokeOf } from "../queries";
import { Fleet, type MachineInfo, unwrap } from "../model/fleet/index.ts";
import { createRoot, createSignal } from "solid-js";
import { listenDanilConnectionChange } from "../../../../host/src/danilConnectionEvents.ts";
import { whenConnected } from "../../../../session/src/engineConnection.ts";
import { t } from "../../../../ui/src/lib/i18n";
import { type Capabilities, capabilities, setCapabilities } from "../../../../host/src/platform";
import { deliver, listen } from "../../../../host/src/serviceEvents.ts";
import { isMac } from "../../../../host/src/window";
import type { MachineStatus } from "../model/SyncNote";
import AccountMachines from "./AccountMachines";
import { mergeBridgeInventory } from "../model/bridge-inventory";
import { CLOUD_RETRY_INITIAL_MS, CLOUD_RETRY_MS } from "../queries/cloud-machines";
import { createConnectedStatus } from "../queries/connected-status";
import { createCloudRelayFactory } from "../queries/context-relay";
import { machinesListed, readDanilContext, setDanilFleet } from "../queries/danil-source";
import { createEngineWorkspaces } from "../queries/engine-workspaces";
import { guestChannels } from "../queries/guestChannels";
import { createGuestLink, guestMachineInfo, invalidateGuestChildren, isGuestMachine, wakeGuestMachine } from "../queries/guestLink";
import { MachinePicker } from "./MachinePicker";
import { infoOf, orderComputers, systemOf, wakes } from "../model/machine-info";
import { createRouter, type Invoke } from "../queries/router";
import { createSessionCloud } from "../queries/session-cloud";
import { machineNamesChanged, refetchMachines, setCloudInventory } from "../queries/store";
import { normalizeWslChildren, type WslChild } from "../model/wsl";
import { RELIST, TOKEN_MARGIN, LOCAL, LOCAL_KEY, windowSystem, type ClientToken, type Installed } from "./account-helpers";
import { refresh, slicesChanged, pickedFor } from "../queries/account-events";
import {
  fetchAccountRelayToken,
  listNativeMachines,
  readDanilConnectStatusOrNull,
  readDanilSessionStatusOrNull,
  readDanilSessionsOrNull,
  readDanilWorkspaceAccountOrNull,
  readListedWorkspacesOrNull,
} from "../queries/account-queries.ts";
import { invokeNative, nativeInternals, type NativeInternals } from "../../../../host/src/native";

let started = false;

/**
 * Máquinas locales (Linux en esta PC): los huéspedes con motor son máquinas
 * hijas de esta computadora. No vienen del plano de control; se suman a la
 * flota con un enlace directo (`guestLink.ts`).
 */
let rawGuestChildren: WslChild[] = [];
const guestMachines = (): MachineInfo[] =>
  rawGuestChildren.map((child) => guestMachineInfo(child, homeName(), rawGuestChildren.length)).filter((m) => isGuestMachine(m.id));
async function readGuestMachines(): Promise<MachineInfo[]> {
  if (!(await guestChannels()).length) {
    rawGuestChildren = [];
    return [];
  }
  try {
    // Solo ids de huésped: la flota local no sabe llegar a otra cosa (`connect` lanza).
    rawGuestChildren = normalizeWslChildren(await invokeNative<WslChild[]>("guest_children")).filter((c) => isGuestMachine(c.id));
  } catch {
    // Sin canal o sin registro: la flota sigue con las de la cuenta.
  }
  return guestMachines();
}
let installed: Installed | null = null;
let syncing: Promise<void> | null = null;

/** El nombre con que la cuenta conoce a esta computadora («Macbook m4»); sin él, «Esta Mac». */
const [selfName, setSelfName] = createRoot(() => createSignal<string | null>(null));
const homeName = () => selfName() ?? (isMac() ? t("shell.machines.this_mac") : t("shell.machines.this_computer"));

/** `railSession` es la sesión del riel de la cuenta: la pasa el shell, que es quien la conoce. */
export function startAccountMachines<DanilSessionInfo, WorkspaceAccount>(
  railSession: (list: DanilSessionInfo[] | null, of: WorkspaceAccount | null) => { computer_id: string | null; account: string | null } | null,
) {
  if (started) return;
  const found = nativeInternals();
  if (!found) return;
  const internals: NativeInternals = found;
  started = true;
  setCloudInventory("initial");
  const native: Invoke = internals.invoke.bind(internals);
  let token: ClientToken | null = null;
  // Las máquinas de la organización por el borde (`/v1/machines`); el motor local sigue por su RPC.
  const cloud = createSessionCloud(native, (e) => {
    // `403 organization_selection_required`: se abre el selector de organización (si esta ventana lo tiene).
    const organizations = (capabilities() as { organizations?: () => Promise<{ report: (e: unknown) => unknown }> }).organizations;
    void organizations?.().then((selector) => selector.report(e));
  }, undefined, contexts => { installed?.router.pruneContexts(contexts); installed?.fleet.pruneContexts(contexts); }, createConnectedStatus(native));
  let cloudIds = new Set<string>();
  /** `machines.session.renew` anunciada por el borde: el relay renueva dentro del canal. */
  let cloudRenew = false;
  let cloudRetry: ReturnType<typeof setTimeout> | null = null;
  let lastCloudRows: Computer[] = [];
  let cloudRetrying = false;
  let cloudRead: Promise<Computer[]> | null = null;
  let cloudRetryDelay = CLOUD_RETRY_INITIAL_MS;
  let cloudEpoch = 0;
  function invalidateCloud() {
    cloudEpoch++;
    setCloudInventory("initial");
    if (cloudRetry) clearTimeout(cloudRetry);
    cloudRetry = null;
    cloudRead = null;
    lastCloudRows = [];
    cloudIds = new Set();
    cloudRenew = false;
    cloudRetrying = false;
    cloudRetryDelay = CLOUD_RETRY_INITIAL_MS;
    syncing = null;
    again = false;
  }
  function readCloud(allowLegacy = true): Promise<Computer[]> {
    if (cloudRead) return cloudRead;
    const epoch = cloudEpoch;
    cloudRead = (async () => {
      try {
        const answer = await cloud.rows(allowLegacy);
        if (epoch !== cloudEpoch) return [];
        cloudRetrying = answer.state === "retrying" || ("retrying" in answer && answer.retrying === true);
        if (!cloudRetrying) setCloudInventory("settled");
        if (answer.state === "ready") {
          lastCloudRows = answer.computers;
          cloudRenew = answer.renewInChannel;
          cloudIds = new Set(lastCloudRows.map(c => c.computer_id));
        } else if (!cloudRetrying) {
          lastCloudRows = [];
          cloudRenew = false;
          cloudIds = new Set();
        }
        if (cloudRetry) { clearTimeout(cloudRetry); cloudRetry = null; }
        if (cloudRetrying || answer.state === "unavailable") {
          const delay = cloudRetrying ? cloudRetryDelay * (0.5 + Math.random() * 0.5) : CLOUD_RETRY_MS;
          cloudRetryDelay = cloudRetrying ? Math.min(cloudRetryDelay * 2, CLOUD_RETRY_MS) : CLOUD_RETRY_INITIAL_MS;
          cloudRetry = setTimeout(() => {
            cloudRetry = null;
            void readCloud(allowLegacy).then(() => { if (epoch === cloudEpoch && !cloudRetrying) void sync(); });
          }, delay);
          (cloudRetry as unknown as { unref?: () => void }).unref?.();
        } else cloudRetryDelay = CLOUD_RETRY_INITIAL_MS;
        return lastCloudRows;
      } finally {
        if (epoch === cloudEpoch) cloudRead = null;
      }
    })();
    return cloudRead;
  }
  /** Si esta computadora es una VM administrada, y su sistema. La lista los lee en cada `machine_list`. */
  let homeWakes = false;
  let homeOs: SystemId = windowSystem();
  let homeFeatures: string[] = [];
  let homeVersion: string | null = null;
  /** The session the fan-out talks as: the open workspace's account; `null` is the default one. */
  let account: string | null = null;
  // Los workspaces de otras máquinas que el motor de aquí conoce, de todas sus sesiones: el riel es de la persona, no del workspace abierto.
  const engineWorkspaces = createEngineWorkspaces({
    invoke: native,
    listen,
    features: async () => {
      const rows = await listNativeMachines();
      const features = Array.isArray(rows) ? rows[0]?.features : null;
      return Array.isArray(features) ? features.filter((f): f is string => typeof f === "string") : [];
    },
    onChange: () => {
      if (!installed) return void window.dispatchEvent(new CustomEvent("harness:workspace-name"));
      observeEngine(installed.fleet);
      void refetchMachines();
      slicesChanged(["workspaces"]);
    },
  });
  /** Lo que la vista del motor sabe de cada máquina vale hasta que su sesión del relay diga algo. */
  const observeEngine = (fleet: Fleet) => {
    for (const [id, state] of engineWorkspaces.machineStates()) if (fleet.has(id)) fleet.observe(id, state as MachineState);
  };

  const getToken = async (): Promise<ClientToken> => {
    if (token && token.expires_at - Date.now() > TOKEN_MARGIN) return token;
    const asked = account;
    const next = await fetchAccountRelayToken(asked);
    if (asked === account) token = next;
    return next;
  };

  const uninstall = () => {
    if (!installed) return;
    const gone = installed;
    installed = null;
    setDanilFleet(null);
    gone.restore();
    refresh();
  };

  function readCloudWorkspaces(context: string) {
    const info = cloud.contextInfo(context);
    if (info && info.plan !== "free") void readDanilContext(info.org, context);
  }

  const disconnect = () => {
    uninstall();
    const { spaceOrder: _order, ...rest } = capabilities();
    setCapabilities(rest);
  };

  /** `endpoint` null: modo local, solo huéspedes, sin nada de la cuenta (token, relay, registro, pantallas, espacios). */
  function install(self: string, endpoint: string | null, others: Computer[], key: string) {
    const [changed, bump] = createSignal(0);
    const cloudRelay = createCloudRelayFactory(cloud, () => cloudRenew, () => void sync(), { suspended: info => router.attentionSuspended(info.id, info.context), resumed: (info, value) => router.attentionResumed(info.id, info.context, value) });
    const fleet = new Fleet({
      self,
      selfName: homeName,
      connect: (info) => {
        if (isGuestMachine(info.id)) return createGuestLink(info.id, native);
        if (cloudIds.has(info.id)) return cloudRelay(info);
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
      wake: async (id, context) => {
        if (isGuestMachine(id)) return wakeGuestMachine(id);
        if (cloudIds.has(id)) return wokeOf(await cloud.client.wake(id, context));
        if (endpoint === null) throw { code: "unknown_machine", detail: id };
        return startedOf(await startComputer(endpoint, (await getToken()).token, id));
      },
      storage: localStorage,
      onChange: () => {
        bump((n) => n + 1);
        window.dispatchEvent(new CustomEvent("harness:machines"));
        void refetchMachines();
      },
      // La cola de aplazadas cambió (aquí, en la web o en el teléfono): la lista se relee.
      onDeferred: (machine, _frame, context) => router.deferredChanged(machine, context),
      onSlice: () => bump((n) => n + 1),
      onEvents: (machine, events, gap, metadata, context) => {
        if (events.length) router.events(machine, events, metadata, context);
        if (gap) {
          if (context) readCloudWorkspaces(context);
          window.dispatchEvent(new CustomEvent("harness:service-resync"));
          window.dispatchEvent(new CustomEvent("harness:service-gap"));
        }
      },
    });
    const router = createRouter({
      self, contextInfo: cloud.contextInfo,
      readContextSpaces: readContextSpaces(native),
      fleet,
      native,
      onSlices: slicesChanged,
      deliver,
      pickedFor,
      engineWorkspaces: engineWorkspaces.workspaces,
      engineFeatures: engineWorkspaces.features,
      home: () => ({ wakes: homeWakes, os: homeOs, features: homeFeatures, version: homeVersion }),
    });
    fleet.setMachines([...others.map(infoOf), ...guestMachines()]);
    const validatedContexts = cloud.validatedContexts();
    if (validatedContexts !== null) { router.pruneContexts(validatedContexts); fleet.pruneContexts(validatedContexts); }
    observeEngine(fleet);
    machinesListed(fleet);
    fleet.subscribeEvents();
    const stopListing = fleet.onListing((_machine, context) => { if (context) refresh(); });
    for (const context of validatedContexts ?? []) readCloudWorkspaces(context);
    const screens =
      endpoint === null
        ? null
        : createScreenAccess({
            endpoint,
            getToken: async () => (await getToken()).token,
            knows: (id) => id === self || !!fleet.info(id),
          });

    const activeCtx = () => router.activeContext() ?? undefined;
    const status = (id: string, context?: string): MachineStatus => {
      const power = fleet.power(id, context);
      return power === "on" ? "online" : power === "off" ? "offline" : power;
    };
    const previous: Capabilities = capabilities();
    setCapabilities({
      ...previous,
      machineName: (id) => (id === self ? homeName() : fleet.name(id, activeCtx())),
      taskMachine: (id) => unwrap(id, fleet.remotes(activeCtx()))?.machine ?? null,
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
                ...fleet.machines().map((info) => ({ id: info.id, name: info.name, status: status(info.id, info.context), at: null })),
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
    const onPageHide = () => fleet.flush();
    window.addEventListener("pagehide", onPageHide);
    installed = {
      key,
      fleet,
      router,
      restore: () => {
        screens?.close();
        stopListing();
        setMachineRoute(null);
        window.removeEventListener("pagehide", onPageHide);
        setCapabilities(previous);
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
    const sessions = (await readDanilSessionsOrNull()) as DanilSessionInfo[] | null;
    if (Array.isArray(sessions)) {
      const listed = installed ? null : await readListedWorkspacesOrNull();
      const workspace = installed?.router.activeWorkspace() ?? (typeof listed?.active === "string" ? listed.active : null);
      const of = (await readDanilWorkspaceAccountOrNull(workspace)) as WorkspaceAccount | null;
      const session = railSession(sessions, of);
      return { self: session?.computer_id ?? null, account: session?.account ?? session?.computer_id ?? null };
    }
    const status = await readDanilConnectStatusOrNull();
    return { self: status?.state === "connected" ? (status.computer_id ?? null) : null, account: null };
  }

  /** Reads the account and its computers; installs, updates or removes the fan-out to match. */
  async function check(who: { self: string | null; account: string | null }) {
    const epoch = cloudEpoch;
    const self = who.self;
    const client = self ? await getToken().catch(() => null) : null;
    if (epoch !== cloudEpoch) return;
    const answer = client && !isRetiredComputersEndpoint(client.endpoint) && await listComputers(client.endpoint, client.token);
    if (epoch !== cloudEpoch) return;
    if (!self || !client || !answer || answer.kind === "unauthorized" || answer.kind === "license") {
      token = null;
      if (installed?.key !== LOCAL_KEY) uninstall();
      return installLocal(epoch, !self);
    }
    // `/v1/computers` es del sistema viejo: si no responde, las VMs de `/v1/machines` se leen igual.
    const legacyRows = answer.kind === "ok" ? answer.value : [];
    const mine = legacyRows.find((c) => c.computer_id === self);
    setSelfName(mine?.name?.trim() || null);
    homeWakes = mine ? wakes(mine) : false;
    homeOs = systemOf(mine?.os) ?? windowSystem();
    homeFeatures = mine ? serviceFeatures(mine) : [];
    homeVersion = mine?.host_version ?? null;
    const cloudRows = await readCloud();
    if (epoch !== cloudEpoch) return;
    const others = orderComputers(mergeBridgeInventory(legacyRows, cloudRows).filter((c) => c.computer_id !== self));
    await readGuestMachines();
    if (epoch !== cloudEpoch) return;
    const key = JSON.stringify([self, account, client.endpoint]);

    // The same account: machines that came, left or changed name are applied live, without tearing the rest down.
    if (installed?.key === key) {
      installed.fleet.setMachines([...others.map(infoOf), ...guestMachines()]);
      observeEngine(installed.fleet);
      machinesListed(installed.fleet);
      for (const context of cloud.validatedContexts() ?? []) readCloudWorkspaces(context);
      machineNamesChanged();
      return void refetchMachines();
    }
    uninstall();
    install(self, client.endpoint, others, key);
  }

  /** Sin cuenta: la flota de los huéspedes y los contextos de la sesión; sin ninguno, nada, como antes. */
  async function installLocal(epoch: number, allowLegacy: boolean) {
    const guests = await readGuestMachines();
    if (epoch !== cloudEpoch) return;
    const cloudRows = (await readCloud(allowLegacy)).filter((row) => allowLegacy || "context" in row);
    if (epoch !== cloudEpoch) return;
    // Un contexto Free corre en este motor: sin VM ni huéspedes, el router sigue para conservar la pareja activa de la ventana.
    if (!guests.length && !cloudRows.length && !cloud.validatedContexts()?.length) return disconnect();
    if (installed?.key === LOCAL_KEY) {
      installed.fleet.setMachines([...cloudRows.map(infoOf), ...guests]);
      machinesListed(installed.fleet);
      for (const context of cloud.validatedContexts() ?? []) readCloudWorkspaces(context);
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
    install(LOCAL, null, cloudRows, LOCAL_KEY);
  }

  let again = false;
  let identityRead = 0;
  /** Una comprobación por época; otra petición del mismo alcance se repite al terminar. */
  const sync = async (): Promise<void> => {
    const identity = ++identityRead;
    const epoch = cloudEpoch;
    const status = await readDanilSessionStatusOrNull();
    const scoped = status?.state === "connected" && settledContextIds(status.sessions) !== null;
    const who = scoped ? { self: null, account: null } : await whoAmI();
    if (identity !== identityRead || epoch !== cloudEpoch) return;
    if (who.account !== account) {
      invalidateCloud();
      if (installed?.key !== LOCAL_KEY) uninstall();
      account = who.account;
      token = null;
    }
    if (syncing) {
      again = true;
      return syncing;
    }
    const pending = (scoped ? installLocal(cloudEpoch, false) : check(who))
      .catch(() => {})
      .finally(() => {
        if (syncing !== pending) return;
        syncing = null;
        if (again) {
          again = false;
          void sync();
        }
      });
    syncing = pending;
    return pending;
  };

  void whenConnected().then(() => {
    void listenDanilConnectionChange(() => { cancelEdgeWrites(); invalidateCloud(); void sync(); });
    window.addEventListener("danil:organization-changed", () => { invalidateCloud(); void sync(); });
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
    window.addEventListener("harness:workspace", () => { cancelEdgeWrites(); void sync(); });
    // Una máquina recién conectada («Conectar otra máquina») suma su rebanada sin desmontar las demás.
    window.addEventListener("harness:account-computers", () => void sync());
    // Una distro conectada, quitada o cambiada de estado en esta PC: la flota se actualiza en vivo.
    const onGuestsChanged = () => {
      invalidateGuestChildren();
      void sync();
    };
    window.addEventListener("danil:guests-changed", onGuestsChanged);
    void listen("guest-state-changed", onGuestsChanged);
    setInterval(() => void sync(), RELIST);
    void engineWorkspaces.refresh();
    return sync();
  });
}
