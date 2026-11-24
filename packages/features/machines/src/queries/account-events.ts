import { leerPref } from "../../../../session/src/prefs";
import { type SliceChange } from "./router";
import { refetchMachines } from "./store";

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
