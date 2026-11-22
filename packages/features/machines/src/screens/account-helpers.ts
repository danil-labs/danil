import { type SystemId } from "@terminus/computers";
import { Fleet } from "@terminus/fleet";
import { isMac, isWindows } from "../../../../host/src/window";
import { type Router } from "../queries/router";

/** `account_relay_token` (`proxy.rs`): the engine's short-lived client token of the account. */
export type ClientToken = { token: string; expires_at: number; endpoint: string; computer_id: string };

export type DanilStatus = { state: string; computer_id?: string | null };

export const RELIST = 10 * 60_000;

export const TOKEN_MARGIN = 60_000;

/** Who the fan-out is for: this computer, its account and the control plane. Another one installs anew. */
/** Sin cuenta: esta computadora es `"local"` (`machine_list`), como en el resto de la ventana. */
export const LOCAL = "local";

export const LOCAL_KEY = JSON.stringify([LOCAL, null, null]);

export type Installed = { key: string; fleet: Fleet; router: Router; restore: () => void };

/** Sistema de la ventana de escritorio. La web no carga este módulo. */
export function windowSystem(): SystemId {
  if (isMac()) return "macos";
  if (isWindows()) return "windows";
  return "linux";
}
