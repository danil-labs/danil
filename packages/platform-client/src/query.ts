import { createEffect, createResource, onCleanup, type Resource } from "solid-js";

type Entry = { promise: Promise<unknown> | null; value?: unknown; at: number; subscribers: Set<() => void> };
const entries = new Map<string, Entry>();

/** Cuánto vale una lectura antes de pedirla otra vez al montar otra vista. */
const FRESH_MS = 10_000;

function entry(key: string): Entry {
  let e = entries.get(key);
  if (!e) entries.set(key, (e = { promise: null, at: 0, subscribers: new Set() }));
  return e;
}

/**
 * Una lectura del servidor con clave (RV1 #17, B-023): varias vistas que piden lo
 * mismo comparten una sola petición y un solo valor; `invalidate(key)` la repite
 * en todas. El estado de UI se queda en cada vista.
 */
export function createQuery<T>(key: () => string | null | undefined, fetcher: (signal: AbortSignal) => Promise<T>) {
  const run = async (k: string, refetch: boolean): Promise<T> => {
    const e = entry(k);
    if (!refetch && e.promise && Date.now() - e.at < FRESH_MS) return e.promise as Promise<T>;
    const ctrl = new AbortController();
    const p = fetcher(ctrl.signal);
    e.promise = p;
    e.at = Date.now();
    p.catch(() => {
      if (e.promise === p) e.promise = null;
    });
    return p;
  };
  const [data, { refetch, mutate }] = createResource(
    () => key() ?? null,
    (k, info) => run(k, Boolean(info.refetching)),
  );
  let current: string | null = null;
  const onInvalidate = () => void refetch();
  const track = () => {
    const k = key() ?? null;
    if (k === current) return;
    if (current) entries.get(current)?.subscribers.delete(onInvalidate);
    current = k;
    if (k) entry(k).subscribers.add(onInvalidate);
  };
  createEffect(track);
  onCleanup(() => {
    if (current) entries.get(current)?.subscribers.delete(onInvalidate);
  });
  return { data: data as Resource<T | undefined>, refetch: () => refetch(), mutate };
}

/** Repite la lectura `key` en todas las vistas que la muestran (tras una mutación). */
export function invalidate(prefix: string): void {
  for (const [k, e] of entries) {
    if (!k.startsWith(prefix)) continue;
    e.promise = null;
    for (const f of [...e.subscribers]) f();
  }
}
