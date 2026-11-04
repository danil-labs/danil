/**
 * What the Tauri window does for each invoke, in a browser: window-only
 * commands and plugins answer from the browser or refuse with a sentence the
 * interface already knows; what the control plane answers (GitHub of the
 * account, `github-account.ts`) goes to the Worker with the person's session;
 * every other engine command goes to the machines of the account through the
 * same router as the desktop (`features/machines/router.ts`).
 */
import { t } from "../lib/i18n.ts";
import type { ControlPlaneCommands } from "./github-account.ts";

type Args = Record<string, unknown>;
type Options = { headers?: HeadersInit } | undefined;
type Failure = { what: unknown; detail: unknown };

export type BrowserHost = {
  openUrl(url: string): void;
  confirm(message: string): boolean;
  alert(message: string): void;
  reload(): void;
  writeText(text: string): Promise<void>;
  readText(): Promise<string>;
};

/** What the transport uses of the router: one call, with the machine in the envelope. */
export type Engine = { handle(command: string, args?: Args, options?: Options): Promise<unknown> };

export type WebTransport = { handle(command: string, args?: Args, options?: Options): Promise<unknown> };

const desktopOnly = (command: string): Failure => ({ what: t("web.desktop_only"), detail: command });

const REFUSED = /^(site_|typst_live_)|^(open_file_external|tree_open_external)$/;
const QUIET = new Set([
  "launcher_continue",
  "window_ready",
  "window_vitals",
  "window_painted",
  "window_background",
  "request_close",
  "close_confirmed",
  "window_to_background",
  "tray_update",
  "quit_completely",
  "service_filter",
  "service_prepare_update",
  "service_cancel_update",
  "update_install",
  "update_pending",
]);

const isWeb = (url: unknown): url is string => typeof url === "string" && /^https?:\/\//i.test(url);

export function createWebTransport(engine: Engine, version: string, host: BrowserHost, controlPlane?: ControlPlaneCommands): WebTransport {
  function dialog(args: Args): string {
    const message = String(args.message ?? "");
    const buttons = args.buttons as string | Record<string, string[] | string> | undefined;
    const custom = buttons && typeof buttons === "object" ? Object.values(buttons)[0] : undefined;
    if (buttons === "OkCancel" || buttons === "YesNo" || Array.isArray(custom)) {
      const [yes, no] = Array.isArray(custom) ? custom : buttons === "YesNo" ? ["Yes", "No"] : ["Ok", "Cancel"];
      return host.confirm(message) ? yes : no;
    }
    host.alert(message);
    return typeof custom === "string" ? custom : "Ok";
  }

  async function plugin(command: string, args: Args): Promise<unknown> {
    const [name, action] = command.slice("plugin:".length).split("|");
    switch (name) {
      case "event":
      case "window":
      case "webview":
      case "updater":
        return null;
      case "app":
        return action === "version" ? version : action === "name" ? "Danil" : null;
      case "dialog":
        if (action === "message") return dialog(args);
        host.alert(t("web.local_files"));
        return null;
      case "clipboard-manager":
        if (action === "write_text") return host.writeText(String(args.text ?? ""));
        if (action === "read_text") return host.readText();
        throw desktopOnly(command);
      case "process":
        host.reload();
        return null;
    }
    throw desktopOnly(command);
  }

  return {
    async handle(command, args = {}, options) {
      if (command.startsWith("plugin:")) return plugin(command, args);
      if (command === "launcher_state") return { phase: "ready" };
      if (command === "tray_notify") return "focused";
      if (command === "restart_app") return host.reload();
      if (QUIET.has(command)) return null;
      if (command === "site_open_external" || command === "open_external") {
        const url = command === "open_external" ? args.target : args.url;
        if (!isWeb(url)) throw desktopOnly(command);
        host.openUrl(url);
        return null;
      }
      if (REFUSED.test(command)) throw desktopOnly(command);
      if (controlPlane?.answers(command)) return controlPlane.handle(command, args);
      return engine.handle(command, args, options);
    },
  };
}
