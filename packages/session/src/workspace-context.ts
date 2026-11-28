import { createSignal } from "solid-js";

export type WorkspaceSelection = { workspace: string | null; context: string | null };
/** El contexto activo pertenece a la ventana; nunca se persiste en el motor. */
export const [activeWorkspaceContext, setActiveWorkspaceContext] = createSignal<string | null>(null);
export const [displayWorkspaceContext, setDisplayWorkspaceContext] = createSignal<string | null>(null);
const [confirmedSelection, setConfirmedSelection] = createSignal<WorkspaceSelection>({ workspace: null, context: null });
const selectionListeners = new Set<(selection: WorkspaceSelection) => void>();
export const confirmedWorkspaceSelection = confirmedSelection;
export function onConfirmedWorkspaceSelection(listener: (selection: WorkspaceSelection) => void): () => void {
  selectionListeners.add(listener);
  return () => { selectionListeners.delete(listener); };
}
export function confirmWorkspaceSelection(workspace: string | null, context: string | null) {
  const next = { workspace, context };
  setConfirmedSelection(next);
  setActiveWorkspaceContext(context);
  for (const listener of [...selectionListeners]) listener(next);
}
const snapshots = new WeakMap<object, string | null>();
export function rememberWorkspaceSnapshot<T>(value: T, context: string | null): T {
  if (value && typeof value === "object") snapshots.set(value, context);
  return value;
}
function snapshotWorkspaceContext(value: object): string | null {
  return snapshots.has(value) ? snapshots.get(value)! : (value as { context?: string }).context ?? null;
}
export const requestedWorkspaceSnapshot = (value: object) => snapshotWorkspaceContext(value) === activeWorkspaceContext();
export const displayWorkspaceSnapshot = (value: object) => setDisplayWorkspaceContext(snapshotWorkspaceContext(value));
export function workspaceContextOptions(context: string | null) {
  return { headers: { "x-danil-context": context ?? "" } };
}

export function captureWorkspaceContext(options?: { headers?: HeadersInit }) {
  const headers = new Headers(options?.headers);
  if (!headers.has("x-danil-context")) headers.set("x-danil-context", displayWorkspaceContext() ?? "");
  return { ...options, headers: Object.fromEntries(headers) };
}
