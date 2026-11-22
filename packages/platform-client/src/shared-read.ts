/**
 * Una lectura del borde compartida por todos los que la piden (plan front-move 3.2: un request por recurso).
 *
 * - Quien la pide mientras otra está en curso recibe la misma promesa.
 * - Una respuesta que `keep` acepta se reutiliza durante `freshMs` (una carga de la página).
 * - `fresh: true` no reutiliza nada: la pide quien sabe que el estado cambió (tras encender, el sondeo).
 * - `invalidate()` olvida lo guardado y lo que está en curso: una escritura cambia lo que se lee después.
 * - Un fallo nunca se guarda: quien llama reintenta como antes.
 *
 * Sin red: `read` es quien llama al cliente.
 */
const SHARED_READ_FRESH_MS = 3_000;

export type SharedReadOptions<T> = { freshMs?: number; keep?: (value: T) => boolean; now?: () => number };
export type SharedRead<T> = { read(options?: { fresh?: boolean; signal?: AbortSignal }): Promise<T>; invalidate(): void };

/** El aborto de quien llama corta solo su espera; la lectura compartida sigue para los demás. */
function until<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export function sharedRead<T>(read: () => Promise<T>, options: SharedReadOptions<T> = {}): SharedRead<T> {
  const freshMs = options.freshMs ?? SHARED_READ_FRESH_MS;
  const now = options.now ?? Date.now;
  const keep = options.keep ?? (() => true);
  let generation = 0;
  let running: Promise<T> | null = null;
  let kept: { at: number; value: T } | null = null;
  function start(): Promise<T> {
    const mine = generation;
    const run = read().then((value) => {
      if (mine === generation && keep(value)) kept = { at: now(), value };
      return value;
    }).finally(() => { if (running === run) running = null; });
    running = run;
    return run;
  }
  return {
    read({ fresh = false, signal } = {}) {
      if (!fresh && kept && now() - kept.at < freshMs) return until(Promise.resolve(kept.value), signal);
      if (!fresh && running) return until(running, signal);
      generation++;
      kept = null;
      return until(start(), signal);
    },
    invalidate() {
      generation++;
      kept = null;
      running = null;
    },
  };
}

/** Una lectura compartida por clave (un contexto, una ruta); `invalidate()` sin clave olvida todas. */
export function sharedReads<T>(read: (key: string) => Promise<T>, options: SharedReadOptions<T> = {}) {
  const reads = new Map<string, SharedRead<T>>();
  const of = (key: string) => {
    let found = reads.get(key);
    if (!found) { found = sharedRead(() => read(key), options); reads.set(key, found); }
    return found;
  };
  return {
    read: (key: string, opts?: { fresh?: boolean; signal?: AbortSignal }) => of(key).read(opts),
    invalidate(key?: string) {
      if (key === undefined) for (const r of reads.values()) r.invalidate();
      else reads.get(key)?.invalidate();
    },
  };
}
