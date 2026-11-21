import { createEffect, createResource, onCleanup, type Resource } from "solid-js";

type Fetcher = (signal: AbortSignal) => Promise<unknown>;

/** Una clave: una sola lectura en vuelo, su último valor y las vistas que la muestran. */
type Entry = {
  inflight: Promise<unknown> | null;
  ctrl: AbortController | null;
  at: number;
  /** Generación: sube en cada invalidación; una lectura vieja no pisa una nueva. */
  gen: number;
  fetcher: Fetcher | null;
  views: Set<() => void>;
};

const entries = new Map<string, Entry>();

/** Cuánto vale una lectura antes de pedirla otra vez al montar otra vista. */
const FRESH_MS = 10_000;

function entry(key: string): Entry {
  let e = entries.get(key);
  if (!e) entries.set(key, (e = { inflight: null, ctrl: null, at: 0, gen: 0, fetcher: null, views: new Set() }));
  return e;
}

/** La lectura compartida de `key`: reusa la que está en vuelo o fresca; si no, lanza UNA. */
function load(key: string, force: boolean): Promise<unknown> {
  const e = entry(key);
  if (e.inflight && (!force || e.at >= Date.now() - 1000) && Date.now() - e.at < FRESH_MS) return e.inflight;
  if (!e.fetcher) return Promise.reject(new Error("query_without_fetcher"));
  e.ctrl?.abort();
  const ctrl = new AbortController();
  const gen = ++e.gen;
  const p = e.fetcher(ctrl.signal);
  e.ctrl = ctrl;
  e.inflight = p;
  e.at = Date.now();
  p.catch(() => {
    // Un error no se cachea: la próxima vista lo vuelve a pedir.
    if (e.gen === gen) e.inflight = null;
  });
  return p;
}

/**
 * Una lectura del servidor con clave (RV1 #17, B-023): varias vistas que piden lo
 * mismo comparten una sola petición y un solo valor; `invalidate(prefix)` lanza
 * una sola lectura nueva por clave y la reparte. Al quedarse sin vistas, la
 * lectura en vuelo se aborta. El estado de UI se queda en cada vista.
 */
export function createQuery<T>(key: () => string | null | undefined, fetcher: (signal: AbortSignal) => Promise<T>) {
  const [data, { refetch, mutate }] = createResource(
    () => key() ?? null,
    async (k, info) => {
      const e = entry(k);
      e.fetcher = fetcher as Fetcher;
      const value = (await load(k, Boolean(info.refetching))) as T;
      // La clave pudo cambiar mientras llegaba: no se entrega un valor de otra clave.
      if ((key() ?? null) !== k) throw new DOMException("stale", "AbortError");
      return value;
    },
  );

  // Cada vista se suscribe a su clave actual; al cambiarla o desmontarse, se da de baja.
  let current: string | null = null;
  const onInvalidate = () => void refetch();
  const leave = (k: string | null) => {
    if (!k) return;
    const e = entries.get(k);
    if (!e) return;
    e.views.delete(onInvalidate);
    if (e.views.size === 0) {
      e.ctrl?.abort();
      e.inflight = null;
    }
  };
  createEffect(() => {
    const k = key() ?? null;
    if (k === current) return;
    leave(current);
    current = k;
    if (k) entry(k).views.add(onInvalidate);
  });
  onCleanup(() => leave(current));

  return { data: data as Resource<T | undefined>, refetch: () => void invalidate(current ?? "\u0000"), mutate };
}

/**
 * Repite las lecturas cuyas claves empiezan por `prefix`, UNA petición por clave,
 * y la reparte a todas sus vistas (tras una mutación o en el sondeo).
 */
export function invalidate(prefix: string): void {
  for (const [k, e] of entries) {
    if (!k.startsWith(prefix) || e.views.size === 0) continue;
    e.inflight = null;
    void load(k, true).catch(() => {});
    for (const view of [...e.views]) view();
  }
}

/** Al cerrar sesión: olvida todas las lecturas y aborta las que estén en vuelo. */
export function clearQueries(): void {
  for (const e of entries.values()) e.ctrl?.abort();
  entries.clear();
}
