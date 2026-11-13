import { Fleet } from "@terminus/fleet";
import { createRouter } from "../features/machines/router";
import { t } from "../lib/i18n";
import { setCapabilities, type Capabilities, type WebAccountsSource } from "../lib/platform";
import { deliver } from "../lib/serviceEvents";
import { installIpc } from "./ipc";
import { type BrowserHost, createWebTransport } from "./transport";
import type { AccountProfileSource } from "../features/settings/account-profile";

declare const __TERMINUS_VERSION__: string;
type Base = { profile: AccountProfileSource; workspaces: NonNullable<Capabilities["webWorkspaces"]>; onUnavailable: () => void; };
const browser: BrowserHost = {
  openUrl: url => void window.open(url, "_blank", "noopener,noreferrer"), confirm: message => window.confirm(message),
  alert: message => window.alert(message), reload: () => window.location.reload(),
  writeText: text => navigator.clipboard.writeText(text), readText: () => navigator.clipboard.readText(),
};
/** Browser storage is scoped by the authenticated person and selected workspace. */
type Mounted = { storage: import("@terminus/fleet").StorageLike | null; webAccounts?: WebAccountsSource };

/** Mounts the real window with no machine service attached. */
export function mountWindow(base: Base, mounted: Mounted) {
  const unavailable = () => ({ what: t("web.machines.unavailable"), detail: "machines_unavailable" });
  const fleet = new Fleet({ self: null, storage: mounted.storage,
    connect: () => { throw unavailable(); }, wake: async () => { throw unavailable(); },
  });
  const active = createRouter({ self: null, fleet, native: null, deliver });
  // A file dropped outside the chat would replace the page with it.
  for (const type of ["dragover", "drop"]) window.addEventListener(type, (e) => e.preventDefault());
  setCapabilities({
    nativeWindow: false, updater: false, localSetup: false, computerStatus: true, browserFiles: true, appDownloads: true,
    accountProfile: base.profile,
    webWorkspaces: base.workspaces,
    initialSettings: takeSettingsParam(),
    remoteCreate: () => null,
    accountComputers: { list: async () => ({ kind: "error", status: 503, code: "machines_unavailable" }), onRenamed: () => {} },
    webAccounts: mounted.webAccounts,
  });
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
        <SyncNote machines={() => []} unavailable />
        <UpdateNotice />
      </>
    ), layer);
  });
  return { close: () => { stopped = true; fleet.close(); disposeApp?.(); disposeNotice?.(); noticeLayer?.remove(); } };
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

