/**
 * The browser entry (`web.html`, `pnpm web:build`), served by the Danil app on
 * its own origin. It reads the Supabase session that app stored, lists the
 * person's computers and mounts the app at once over the account's fleet
 * (`@terminus/fleet`, the desktop's router): each machine is one relay session
 * and one slice, the saved one first and the live one behind; nothing waits for
 * a machine to answer. A page that sets `window.terminusWeb` before this module
 * loads can replace any setting, or give `getToken` with `computerId` or
 * `computers` and skip the session.
 */
import {
  type Computer,
  type MachineState,
  RelaySession,
  linkedWorkspaces,
  serviceFeatures,
  listComputers,
  listDirectory,
  listSharedComputers,
  listWorkspaces,
  linkDanilWorkspace,
  setDirectoryPins,
  createSpaceOrderSource,
  orderComputers,
  renameComputer,
  createScreenAccess,
  sessionProbe,
  startComputer,
  startSharedComputer,
  systemOf,
  wakes,
} from "@terminus/computers";
import { chosenWebLayout, MOBILE_WEB_DIR } from "@terminus/design";
import { Fleet, type Link, type MachineInfo, relayLink, unwrap } from "@terminus/fleet";
import { type Accessor, createSignal, lazy, Suspense } from "solid-js";
import { createRouter, type Router, type SliceChange } from "../features/machines/router";
import { t } from "../lib/i18n";
import { attentionCapability } from "./attention/capability";
import { supportAccessCapability } from "./attention/support-access";
import { leerPref } from "../lib/prefs";
import { type OtherAccount, setCapabilities, type WebAccountsSource } from "../lib/platform";
import { deliver } from "../lib/serviceEvents";
// In the page, not in the lazy app chunk: the stylesheet loads with the HTML.
import "../styles/global.css";
import "../lib/sharedClock";
import { HomeLink } from "./HomeLink";
import { installIpc } from "./ipc";
import { webAccountProfile } from "./account";
import { webAccountEmails } from "./account-emails";
import { authLocation } from "./auth/return";
import { adminPageCapability, personalAccountCapability } from "./admin/capability";
import { agentsSession } from "./attention/workspace-sources";
import { webUsageMe } from "../features/settings/usage-source";
import { webGithubAccount } from "./github-account";
import { type Account, type Listing, SLOT_PREFIX, loadAccounts, ownerOf, pickAccount, readListings, rememberLast, removeExtra, savedListings } from "./accounts";
import { forgetShellCache, setShellCacheScope } from "../lib/shellCache";
import { webAuditLog } from "./audit-log";
import type { WatchedSession } from "./session";
import { webWorkspaceAssets } from "./workspace-assets";
import type { MachineRow, MachineStatus } from "./SyncNote";
import { type BrowserHost, createWebTransport } from "./transport";
import { announceStaleTab, updateNoticeReady } from "./update-state";

declare const __TERMINUS_VERSION__: string;
/** Set at build time in `vite.config.ts`; all public values. */
declare const __TERMINUS_WEB__: WebSettings;

/** La vista de consumo propio, en su trozo: solo la carga quien abre la pestaña. */
const UsageView = lazy(() => import("../features/settings/UsageView"));

type WebSettings = { endpoint: string; supabaseUrl: string; supabaseKey: string; login: string; workos?: boolean };

type Base = { supabaseUrl?: string; supabaseKey?: string; userId?: string | null; refresh?: () => Promise<boolean>; subscribe?: (clear: () => void) => () => void; endpoint: string; getToken: () => string | Promise<string>; onUnauthorized?: () => void };
export type TerminusWebConfig = Partial<
  WebSettings & Base & { computerId: string; computers: Computer[]; webAccounts: WebAccountsSource; addAccount: import("./AddAccount").AddAccountOptions }
>;

/** How often the page lists the computers again to pick up machines and links changed since it loaded; the desktop's cadence. */
const RELIST = 10 * 60_000;
/** A link seen in the events lists again after this pause, so the copies from every machine of the account make one read. */
const RELIST_SOON = 1_000;
/** The same unknown workspace asks for another list at most this often: one the control plane does not list does not loop. */
const UNLINKED_AGAIN = 60_000;

/**
 * A tab opened before a deploy asks for chunks the new build no longer has, and
 * the Worker answers them with the page (`not_found_handling`): the lazy screen
 * stays blank. Once the app is on screen the person decides (`UpdateNotice`);
 * before that there is nothing to lose: reload into the new build, once per
 * window of time so a chunk that is really broken does not loop.
 */
const RELOADED_AT = "terminus.web.reloaded-at";
window.addEventListener("vite:preloadError", (event) => {
  if (updateNoticeReady()) {
    event.preventDefault();
    announceStaleTab();
    return;
  }
  if (Date.now() - Number(sessionStorage.getItem(RELOADED_AT) ?? 0) < 30_000) return;
  sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  event.preventDefault();
  window.location.reload();
});

const Picker = lazy(() => import("../features/machines/MachinePicker").then((m) => ({ default: m.MachinePicker })));
const AccountMachines = lazy(() => import("../features/machines/AccountMachines"));

const browser: BrowserHost = {
  openUrl: (url) => void window.open(url, "_blank", "noopener,noreferrer"),
  confirm: (message) => window.confirm(message),
  alert: (message) => window.alert(message),
  reload: () => window.location.reload(),
  writeText: (text) => navigator.clipboard.writeText(text),
  readText: () => navigator.clipboard.readText(),
};

const pageStorage = () => {
  try {
    return localStorage;
  } catch {
    return null;
  }
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
type Mounted = { storage: ReturnType<typeof pageStorage>; webAccounts?: WebAccountsSource; workspace?: string | null };

/** Mounts the app; what it returns applies a newer computer list (machines, names, links) without remounting. */
function mountApp(computers: Computer[], base: Base, before?: (id: string) => () => Promise<boolean>, mounted: Mounted = { storage: pageStorage() }): (computers: Computer[]) => void {
  const [changed, bump] = createSignal(0);
  let rows = new Map(computers.map((c) => [c.computer_id, c]));
  // A workspace linked from the desktop after the page loaded: its events arrive before its row says it.
  const unlinkedAt = new Map<string, number>();
  let soon: ReturnType<typeof setTimeout> | undefined;
  const relistSoon = () => {
    clearTimeout(soon);
    soon = setTimeout(() => void relistNow?.(), RELIST_SOON);
  };
  const token = async () => base.getToken();
  const agents = agentsSession(base.endpoint, { getToken: async () => await base.getToken(), unauthorized: async () => base.refresh ? await base.refresh() : false });
  let router: Router | null = null;
  const powers = new Map<string, string>();
  const fleet = new Fleet({
    self: null,
    connect: (info) =>
      rowLink(
        new RelaySession({
          endpoint: base.endpoint,
          computerId: info.id,
          getToken: base.getToken,
          onUnauthorized: base.onUnauthorized,
          beforeReconnect: before?.(info.id),
          // Un upgrade sin licencia no trae cuerpo: se pregunta por HTTP para no reintentar en bucle.
          probe: async () => sessionProbe(base.endpoint, await token(), info.id),
        }),
        () => rows.get(info.id)?.state,
      ),
    // Sin `contracts` ni `compatible`, como el teléfono: un motor con otro contrato
    // sigue en servicio y solo falla la orden que no conoce (nunca la máquina entera).
    wake: async (id) => (await startComputer(base.endpoint, await token(), id)).kind === "ok",
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
    const answer = await listWorkspaces(base.endpoint, await token());
    if (answer.kind === "unauthorized") base.onUnauthorized?.();
    return answer.kind === "ok" ? answer.value : null;
  };
  const active = createRouter({ self: null, fleet, native: null, registry, onSlices: slicesChanged, deliver, pickedFor });
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
  const screens = createScreenAccess({ endpoint: base.endpoint, getToken: token, knows: (id) => !!fleet.info(id) });
  setCapabilities({
    appDownloads: true,
    workspaceDirectory: import.meta.env.TERMINUS_ALPHA ? {
      list: async () => {
        const answer = await listDirectory(base.endpoint, await token());
        if (answer.kind !== "ok") throw new Error("directory_unavailable");
        return answer.value;
      },
      pin: async (keys) => { await setDirectoryPins(base.endpoint, await token(), keys); },
      link: async (workspaceId, danilWorkspaceId) => {
        const answer = await linkDanilWorkspace(base.endpoint, await token(), workspaceId, danilWorkspaceId);
        if (answer.kind === "ok") return;
        if (answer.kind === "error" && answer.status === 403) throw new Error("not_account_admin");
        throw new Error(answer.kind === "error" ? (answer.code ?? "link_failed") : "link_failed");
      },
    } : undefined,
    inbox: import.meta.env.TERMINUS_ALPHA ? attentionCapability(false, window.location.pathname.replace(/\/+$/, "").endsWith("/inbox"), { userId: base.userId ?? mounted.webAccounts?.current.user_id, subscribe: base.subscribe, ...agents }) : undefined,
    supportAccess: import.meta.env.TERMINUS_ALPHA ? supportAccessCapability({ getToken: async () => await base.getToken(), unauthorized: async () => base.refresh ? await base.refresh() : false }) : undefined,
    spaceOrder: createSpaceOrderSource(base.endpoint, token),
    nativeWindow: false,
    updater: false,
    localSetup: false,
    computerStatus: true,
    browserFiles: true,
    sidebarExtra: () => <HomeLink />,
    accountProfile: webAccountProfile(base.endpoint, base.getToken, base.onUnauthorized),
    accountEmails: import.meta.env.TERMINUS_ALPHA ? webAccountEmails({ getToken: async () => await base.getToken(), unauthorized: async () => base.refresh ? await base.refresh() : false }, `${import.meta.env.BASE_URL}alpha-api`) : undefined,
    initialSettings: takeSettingsParam(),
    accountAssets: webWorkspaceAssets(base.endpoint, base.getToken, base.onUnauthorized),
    accountAuditLog: import.meta.env.TERMINUS_ALPHA && base.supabaseUrl && base.supabaseKey ? webAuditLog(base.supabaseUrl, base.supabaseKey, base.getToken, base.onUnauthorized) : undefined,
    adminPage: import.meta.env.TERMINUS_ALPHA ? adminPageCapability({ getToken: async () => await base.getToken(), unauthorized: async () => base.refresh ? await base.refresh() : false }, "https://harness.danil.ai/") : undefined,
    personalAccount: import.meta.env.TERMINUS_ALPHA ? personalAccountCapability({ getToken: async () => await base.getToken(), unauthorized: async () => base.refresh ? await base.refresh() : false }) : undefined,
    accountUsage: import.meta.env.TERMINUS_ALPHA
      ? () => (
          <Suspense fallback={null}>
            <UsageView source={webUsageMe(base.endpoint, base.getToken)} />
          </Suspense>
        )
      : undefined,
    accountMemory: { endpoint: base.endpoint, getToken: token },
    accountCredentials: { endpoint: base.endpoint, getToken: token },
    machineName: (id) => fleet.name(id),
    taskMachine: (id) => unwrap(id, fleet.remotes())?.machine ?? null,
    windowMachine: () => {
      const id = active.createsOn(null)?.machine;
      return id ? { id, name: fleet.name(id), local: false } : undefined;
    },
    remoteCreate: (workspace) => active.createsOn(workspace),
    machineScreen: (id) => screens.opener(id),
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
      workspaces: async () => listWorkspaces(base.endpoint, await token()),
      list: async () => listComputers(base.endpoint, await token()),
      rename: async (id, name) => renameComputer(base.endpoint, await token(), id, name),
      onRenamed: (id, name) => rename(id, name),
    },
    connectMachine: {
      list: async () => listComputers(base.endpoint, await token()),
      // La nueva suma su rebanada sin recargar la página ni cerrar las demás.
      onReady: () => void relistNow?.(),
    },
    sharedComputers: {
      list: async () => listSharedComputers(base.endpoint, await token()),
      start: async (id) => startSharedComputer(base.endpoint, await token(), id),
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
  function rename(id: string, name: string) {
    if (!fleet.rename(id, name)) return;
    namesChanged();
  }
  function namesChanged() {
    bump((n) => n + 1);
    void import("../features/machines/store").then(({ machineNamesChanged, refetchMachines }) => {
      machineNamesChanged();
      void refetchMachines();
    });
  }
  // GitHub de la cuenta lo contesta el Worker con la sesión: no espera a que despierte una máquina.
  const github = webGithubAccount({ endpoint: base.endpoint, getToken: base.getToken, onUnauthorized: base.onUnauthorized, href: () => window.location.href });
  installIpc(window, createWebTransport(active, __TERMINUS_VERSION__, browser, github));
  window.addEventListener("pagehide", () => fleet.flush());
  void import("./phrases").then(() => import("../app/main"));
  void Promise.all([import("solid-js/web"), import("./SyncNote"), import("./UpdateNotice"), import("./phrases")]).then(([{ render }, { SyncNote }, { UpdateNotice }]) => {
    const layer = document.createElement("div");
    document.body.append(layer);
    render(() => (
      <>
        <SyncNote machines={machines} />
        <UpdateNotice />
      </>
    ), layer);
  });
  return (fresh) => {
    rows = new Map(fresh.map((c) => [c.computer_id, c]));
    active.registryChanged();
    const before = fleet.machines().map((m) => `${m.id}\u0000${m.name}`).join("\n");
    fleet.setMachines(orderComputers(fresh).map(infoOf));
    // Renamed from another window or the phone.
    if (fleet.machines().map((m) => `${m.id}\u0000${m.name}`).join("\n") !== before) namesChanged();
    // Every list of the window reads again, with the machines and links as they are now.
    for (const name of ["harness:workspace-name", "harness:service-resync"]) window.dispatchEvent(new CustomEvent(name));
  };
}

/** Paneles que se abren desde la URL (`?settings=`); el parámetro sale de la barra al leerlo. */
const LINKED_SETTINGS = ["cuenta-danil", "emails"];

function takeSettingsParam(): string | undefined {
  const params = new URLSearchParams(window.location.search);
  const wanted = params.get("settings");
  if (wanted === null) return undefined;
  params.delete("settings");
  const rest = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
  return LINKED_SETTINGS.includes(wanted) ? wanted : undefined;
}

/** Lists the computers again now; set once the page is mounted with a session. */
let relistNow: (() => Promise<void>) | null = null;

/** The page's own address without query: where every account switch and sign-in returns. */
const home = () => `${window.location.origin}${import.meta.env.BASE_URL}`;

/** One logo reader per other account, with that account's token; kept across re-reads so its list is not fetched again. */
const otherAssets = new Map<string, ReturnType<typeof webWorkspaceAssets>>();

/** The other accounts of this browser for the column: each one's workspaces from its registry, its logos with its own token. */
function othersOf(accounts: readonly Account[], current: Account, listings: ReadonlyMap<string, Listing>, endpoint: string): OtherAccount[] {
  return accounts
    .filter((a) => a.user_id !== current.user_id)
    .map((a) => {
      const listing = listings.get(a.user_id);
      let assets = otherAssets.get(a.user_id);
      if (!assets) {
        assets = webWorkspaceAssets(endpoint, () => a.client.getToken());
        otherAssets.set(a.user_id, assets);
      }
      const reader = assets;
      return {
        user_id: a.user_id,
        email: a.email,
        name: a.name,
        extra: a.slot !== null,
        signedIn: a.signedIn && !listing?.refused,
        stale: listing?.stale ?? true,
        workspaces: (listing?.workspaces ?? []).map((w) => ({
          id: w.id,
          name: w.name,
          logo: async () => (a.signedIn && w.logo_url ? ((await reader.read(w.id, "logo").catch(() => null)) ?? null) : null),
        })),
      };
    });
}

async function start(settings: WebSettings) {
  const [{ render }, { Gate, computersOf }, { supabaseSession }, { aplicarLengua }] = await Promise.all([
    import("solid-js/web"),
    import("./Gate"),
    import("./session"),
    import("../lib/i18n"),
    import("./phrases"),
  ]);
  aplicarLengua();
  const { endpoint } = settings;
  const leave = () => window.location.assign(authLocation(settings.login, window.location.origin, `${window.location.pathname}${window.location.search}`));
  if (!settings.supabaseUrl || !settings.supabaseKey) {
    console.error("terminus web: built without TERMINUS_WEB_SUPABASE_URL and TERMINUS_WEB_SUPABASE_KEY");
    return;
  }
  const storage = pageStorage();
  const params = new URLSearchParams(window.location.search);
  /** A session ended (`null`: the primary, else an extra's slot); set once the page knows which account it mounted. */
  let ended: (slot: string | null) => void = () => undefined;
  // With WorkOS (alfa) there is one session per browser: no extra accounts.
  const primary: WatchedSession = settings.workos
    ? (await import("./workos-session")).workosSession({ onGone: () => ended(null) })
    : supabaseSession(settings.supabaseUrl, settings.supabaseKey, { onGone: () => ended(null) });
  const extras = settings.workos ? null : storage;
  const clients = new Map<string, ReturnType<typeof supabaseSession>>();
  const clientFor = (slot: string) => {
    let c = clients.get(slot);
    if (!c) {
      c = supabaseSession(settings.supabaseUrl, settings.supabaseKey, { storageKey: SLOT_PREFIX + slot, onGone: () => ended(slot) });
      clients.set(slot, c);
    }
    return c;
  };

  // «Agregar cuenta» and its return from Google or Microsoft: a page of their own.
  const callback = params.get("account-callback");
  if (!settings.workos && (params.has("add-account") || callback)) {
    const { startAddAccount } = await import("./AddAccount");
    const accounts = await loadAccounts({ storage: extras, primary, clientFor });
    startAddAccount(document.getElementById("root") as HTMLElement, { storage, accounts, clientFor, home: home(), email: params.get("email"), callback, code: params.get("code"), error: params.get("error_description") ?? params.get("error") });
    return;
  }

  let accounts = await loadAccounts({ storage: extras, primary, clientFor });
  if (!accounts.some((a) => a.signedIn)) return leave();
  const list = (token: string) => listWorkspaces(endpoint, token);
  // The account is picked with the saved lists; the network only when `?w=` is not in them.
  const wanted = params.get("w");
  let listings = savedListings(storage, accounts);
  const fresh = readListings(storage, accounts, list);
  if (wanted && !ownerOf(wanted, listings)) listings = await fresh;
  const { account } = pickAccount(accounts, listings, wanted, storage);
  if (!account) return leave();
  const current = account;
  rememberLast(storage, current.user_id);
  if (wanted) {
    params.delete("w");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
  }
  // The sidebar's saved snapshot of another account's workspace never paints here.
  if (accounts.length > 1) setShellCacheScope({ mine: (w) => listings.get(current.user_id)?.workspaces.some((x) => x.id === w) ?? false, prefer: wanted });

  // The mounted account's session ended: another account opens, or the login. Another's: its workspaces show it.
  const [others, setOthers] = createSignal<OtherAccount[]>(othersOf(accounts, current, listings, endpoint));
  const reread = async () => {
    accounts = await loadAccounts({ storage: extras, primary, clientFor });
    listings = await readListings(storage, accounts, list);
    setOthers(othersOf(accounts, current, listings, endpoint));
  };
  void fresh.then((next) => {
    listings = next;
    setOthers(othersOf(accounts, current, listings, endpoint));
  });
  ended = (slot) => {
    if (slot === current.slot) {
      if (accounts.some((a) => a.signedIn && a.user_id !== current.user_id)) window.location.assign(home());
      else leave();
    } else void reread();
  };

  const webAccounts: WebAccountsSource = {
    current: { user_id: current.user_id, email: current.email, name: current.name, extra: current.slot !== null },
    others: others as Accessor<OtherAccount[]>,
    open: (workspace) => {
      const owner = [...listings].find(([, l]) => l.workspaces.some((w) => w.id === workspace))?.[0];
      if (owner) rememberLast(storage, owner);
      window.location.assign(`${home()}?w=${encodeURIComponent(workspace)}`);
    },
    add: (email) => settings.workos ? void primary.signOut?.() : window.location.assign(`${home()}?add-account${email ? `&email=${encodeURIComponent(email)}` : ""}`),
    remove: async (userId) => {
      const gone = accounts.find((a) => a.user_id === userId);
      if (!gone || gone.slot === null) return;
      forgetShellCache(listings.get(userId)?.workspaces.map((w) => w.id) ?? []);
      await removeExtra(storage, gone);
      if (userId === current.user_id) window.location.assign(home());
      else await reread();
    },
    // Sin sesión la página vuelve sola a la entrada (`ended`); con WorkOS cierra también la de AuthKit.
    signOut: () => void session.signOut?.().catch(() => leave()),
  };
  const session = current.slot === null ? primary : clientFor(current.slot);

  /** A refusal found after mounting covers the app: retrying the socket would not change it. */
  let blocked = false;
  const block = (initial: { t: "access_required" } | { t: "license" } | { t: "no_account" } | { t: "not_yours" }) => {
    if (blocked) return;
    blocked = true;
    const layer = document.createElement("div");
    layer.className = "fixed inset-0 z-50";
    document.body.append(layer);
    render(() => <Gate session={session} endpoint={endpoint} initial={initial} accounts={webAccounts} />, layer);
  };

  const dispose = render(
    () => (
      <Gate
        session={session}
        endpoint={endpoint}
        accounts={webAccounts}
        onOpen={(computers) => {
          dispose();
          const several = computers.length > 1;
          const relink = mountApp(
            computers,
            { endpoint, supabaseUrl: settings.supabaseUrl, supabaseKey: settings.supabaseKey, userId: current.user_id, refresh: () => session.unauthorized(), getToken: () => session.getToken(), onUnauthorized: () => void session.unauthorized(), subscribe: clear => session.watch(current.user_id, clear) },
            (computerId) => async () => {
              const answer = await computersOf(endpoint, session);
              if (answer.kind === "error" && answer.status === 403 && answer.code === "access_required") block({ t: "access_required" });
              else if (answer.kind === "license" || answer.kind === "no_account") block({ t: answer.kind });
              // One computer gone from several only stops its own session.
              else if (answer.kind === "ok" && !answer.value.some((c) => c.computer_id === computerId)) {
                if (!several) block({ t: "not_yours" });
              } else return answer.kind !== "unauthorized";
              return false;
            },
            { storage, webAccounts, workspace: wanted },
          );
          // A machine connected or a workspace linked since the page loaded shows up here without reloading it.
          const relist = async () => {
            const answer = await computersOf(endpoint, session).catch(() => null);
            if (answer?.kind === "ok") relink(answer.value);
            await reread().catch(() => undefined);
          };
          relistNow = relist;
          if (!relisting) {
            relisting = true;
            setInterval(() => void relist(), RELIST);
            document.addEventListener("visibilitychange", () => {
              if (document.visibilityState === "visible") void relist();
            });
          }
        }}
      />
    ),
    document.getElementById("root") as HTMLElement,
  );
}

/** The re-list timer and listener are installed once per page, however many times the gate opens. */
let relisting = false;

const given = (window as Window & { terminusWeb?: TerminusWebConfig }).terminusWeb ?? {};
const preset = given.computers ?? (given.computerId ? [{ computer_id: given.computerId, state: "unknown" }] : null);
const connecting = window.location.pathname.replace(/\/+$/, "") === `${import.meta.env.BASE_URL}connect`;
const authenticating = window.location.pathname.replace(/\/+$/, "") === `${import.meta.env.BASE_URL}auth`;

/**
 * Un teléfono abre el Terminus del teléfono (`<base>m/`, la app de Expo para
 * web) salvo que la persona haya elegido este. Una ruta del teléfono que cae
 * aquí (el respaldo de página única sirve esta copia) se pasa a su raíz con
 * `?to=`; su raíz misma solo llega aquí si no está publicada (`web:dev`), y
 * entonces sigue esta.
 */
function toPhone(): boolean {
  const phone = `${import.meta.env.BASE_URL}${MOBILE_WEB_DIR}/`;
  const path = window.location.pathname;
  if (path.startsWith(phone) && path !== phone) {
    window.location.replace(`${phone}?to=${encodeURIComponent(path.slice(phone.length - 1) + window.location.search)}`);
    return true;
  }
  if (path.startsWith(phone) || connecting || authenticating || preset || given.addAccount || chosenWebLayout(window) !== "mobile") return false;
  window.location.replace(`${phone}${window.location.search}`);
  return true;
}

const adminPath = `${import.meta.env.BASE_URL}admin`;
const demo = new URLSearchParams(window.location.search).get("demo") === "1";

if (import.meta.env.TERMINUS_ALPHA && window.location.pathname.replace(/\/+$/, "") === `${import.meta.env.BASE_URL}sign-in`) {
  // With WorkOS the alfa sign-in is the common one; `login` points here, so it renders in place.
  if (__TERMINUS_WEB__.workos) void import("./auth/main").then((m) => m.startAuth(__TERMINUS_WEB__, document.getElementById("root") as HTMLElement));
  else void import("./attention/SignIn").then((m) => m.startSignIn(__TERMINUS_WEB__));
} else if (import.meta.env.TERMINUS_ALPHA && window.location.pathname.replace(/\/+$/, "") === adminPath) {
  if (demo) void import("./admin/main").then((m) => m.startAdminDemo({ dark: new URLSearchParams(window.location.search).get("theme") === "dark" }));
  else void import("./admin/main").then((m) => m.startAdmin({ ...__TERMINUS_WEB__, ...given } as WebSettings));
} else if (import.meta.env.TERMINUS_ALPHA && !window.location.pathname.startsWith(`${import.meta.env.BASE_URL}m/`) && new URLSearchParams(window.location.search).get("demo") === "1") {
  void import("./attention/main").then((m) => m.startAttention(__TERMINUS_WEB__));
} else if (toPhone()) {
  // Se va al del teléfono: no se monta nada aquí.
} else if (authenticating) void import("./auth/main").then((m) => m.startAuth({ ...__TERMINUS_WEB__, ...given } as WebSettings, document.getElementById("root") as HTMLElement));
else if (connecting) void import("./connect/main").then((m) => m.startConnect({ ...__TERMINUS_WEB__, ...given } as WebSettings, document.getElementById("root") as HTMLElement));
else if (given.addAccount) {
  const options = given.addAccount;
  void import("./AddAccount").then((m) => m.startAddAccount(document.getElementById("root") as HTMLElement, options));
} else if (preset && given.getToken) mountApp(preset, { ...__TERMINUS_WEB__, ...given } as Base, undefined, { storage: pageStorage(), webAccounts: given.webAccounts });
else void start({ ...__TERMINUS_WEB__, ...given } as WebSettings);
