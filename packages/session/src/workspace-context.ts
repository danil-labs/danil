import { createSignal } from "solid-js";

/** El contexto activo pertenece a la ventana; nunca se persiste en el motor. */
export const [activeWorkspaceContext, setActiveWorkspaceContext] = createSignal<string | null>(null);
export const [displayWorkspaceContext, setDisplayWorkspaceContext] = createSignal<string | null>(null);
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

const personalDisallowed = new Set<string>();
const personalKey = (context: string, workspace: string) => `${context}\0${workspace}`;
export function setWorkspacePersonalPolicy(context: string, workspace: string, allowsPersonal: boolean) {
  const key = personalKey(context, workspace);
  if (allowsPersonal) personalDisallowed.delete(key);
  else personalDisallowed.add(key);
}
export const workspaceDisallowsPersonal = (context: string, workspace: string) => personalDisallowed.has(personalKey(context, workspace));
export function clearWorkspacePersonalPolicy(context: string) {
  const prefix = `${context}\0`;
  for (const key of [...personalDisallowed]) if (key.startsWith(prefix)) personalDisallowed.delete(key);
}

export function captureWorkspaceContext(options?: { headers?: HeadersInit }) {
  const headers = new Headers(options?.headers);
  if (!headers.has("x-danil-context")) headers.set("x-danil-context", displayWorkspaceContext() ?? "");
  return { ...options, headers: Object.fromEntries(headers) };
}
