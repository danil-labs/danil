import { type SystemId } from "@terminus/computers";
import { Fleet } from "@terminus/fleet";
import { leerPref } from "../../../../../apps/desktop/src/lib/prefs";
import { isMac, isWindows } from "../../../../host/src/window";
import { type Invoke, type Router, type SliceChange } from "../queries/router";
import { refetchMachines } from "../queries/store";

export type Internals = { invoke: Invoke };

export type Target = Window & { __TAURI_INTERNALS__?: Internals };

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

/** Tell every list of the window to read again: the machines behind it changed. */
export function refresh() {
  for (const name of ["harness:workspace-name", "harness:sources", "harness:tasks-changed", "harness:service-resync"]) {
    window.dispatchEvent(new CustomEvent(name));
  }
  void refetchMachines();
}

/** Another machine's slice changed: the window rereads just that. */
export function slicesChanged(changes: SliceChange[]) {
  if (changes.includes("workspaces")) window.dispatchEvent(new CustomEvent("harness:workspace-name"));
  window.dispatchEvent(new CustomEvent("harness:machine-slices", { detail: { changes } }));
  if (changes.includes("attention")) window.dispatchEvent(new CustomEvent("harness:service-resync"));
}

/** The machine picked in «Ejecutar en» for `workspace` (`store.ts`), remembered per workspace. */
export const pickedFor = (workspace: string | null) => (workspace ? (leerPref<Record<string, string>>("machines.run_on", {})[workspace] ?? null) : null);
