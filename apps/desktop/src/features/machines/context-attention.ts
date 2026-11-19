import { createRoot, createSignal } from "solid-js";

type AttentionRow = { workspace: string; tasks: unknown[]; context?: string; stale?: boolean };
const [staleContexts, setStaleContexts] = createRoot(() => createSignal<ReadonlySet<string>>(new Set()));
export const contextAttentionStale = (context: string) => staleContexts().has(context);

/** Suspender el stream conserva su última atención hasta recibir un snapshot fresco. */
export function createContextAttention(deliver?: (events: { name: string; payload: unknown }[]) => void) {
  const snapshots = new Map<string, AttentionRow[]>();
  const owned = new Set<string>();
  const track = (key: string) => {
    if (owned.has(key)) return;
    owned.add(key);
    setStaleContexts(before => { const next = new Set(before); next.delete(key); return next; });
  };
  const project = (value: unknown, context?: string) => {
    const key = context ?? "";
    track(key);
    const rows = Array.isArray(value) ? value.filter((row): row is AttentionRow => !!row && typeof row === "object" && typeof row.workspace === "string") : [];
    const scoped = rows.map(row => ({ ...row, ...(context ? { context, stale: staleContexts().has(key) } : staleContexts().has(key) ? { stale: true } : {}) }));
    snapshots.set(key, scoped);
    return scoped;
  };
  const mark = (context: string | undefined, stale: boolean) => {
    const key = context ?? "";
    track(key);
    setStaleContexts(before => { const next = new Set(before); if (stale) next.add(key); else next.delete(key); return next; });
    const rows = snapshots.get(key);
    if (rows?.length) deliver?.([{ name: "attention", payload: project(rows, context) }]);
  };
  const forget = (context: string) => {
    snapshots.delete(context); owned.delete(context);
    setStaleContexts(before => { const next = new Set(before); next.delete(context); return next; });
  };
  return { project, forget, prune(valid: ReadonlySet<string>) { for (const key of owned) if (key && !valid.has(key)) forget(key); }, cached: (context?: string) => snapshots.get(context ?? "") ?? [], suspend: (context?: string) => mark(context, true),
    resume(context?: string) { track(context ?? ""); setStaleContexts(before => { const next = new Set(before); next.delete(context ?? ""); return next; }); },
    close() { for (const key of owned) setStaleContexts(before => { const next = new Set(before); next.delete(key); return next; }); snapshots.clear(); owned.clear(); },
  };
}
