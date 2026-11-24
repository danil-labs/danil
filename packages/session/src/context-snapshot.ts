import { untrack } from "solid-js";
import { displayWorkspaceContext } from "./workspace-context.ts";

const contexts = new WeakMap<object, string | null>();
export const contextualSnapshot = <T extends object>(snapshot: T): T & { context?: string } => {
  const context = displayWorkspaceContext();
  return context ? { ...snapshot, context } : snapshot;
};
export const snapshotMatchesContext = (snapshot: { context?: string } | null) => (snapshot?.context ?? null) === displayWorkspaceContext();
export const contextSnapshotKey = (key: string, context = displayWorkspaceContext()) => context ? `${key}.context.${JSON.stringify(context)}` : key;
export const snapshotStorageKey = (key: string, snapshot: object) => contextSnapshotKey(key, contexts.has(snapshot) ? contexts.get(snapshot)! : displayWorkspaceContext());

/** El contexto se captura al programar, antes de que una transición cambie la identidad activa. */
export function createSnapshotWriter<T extends object>(write: (snapshot: T) => void, delay: number, schedule: (run: () => void, ms: number) => unknown, cancel: (handle: unknown) => void) {
  let pending: T | null = null;
  let handle: unknown;
  const flush = () => {
    if (handle !== undefined) cancel(handle);
    handle = undefined;
    const snapshot = pending;
    pending = null;
    if (snapshot) write(snapshot);
  };
  return {
    save(snapshot: T) {
      contexts.set(snapshot, untrack(displayWorkspaceContext));
      pending = snapshot;
      if (handle !== undefined) cancel(handle);
      handle = schedule(flush, delay);
    },
    flush,
    cancel() { if (handle !== undefined) cancel(handle); handle = undefined; pending = null; },
  };
}
