import { createSignal, untrack } from "solid-js";

export type ResourceState<K, T> =
  | { status: "idle"; key: null }
  | { status: "loading"; key: K }
  | { status: "ready"; key: K; value: T }
  | { status: "stale"; key: K; value: T; error?: unknown }
  | { status: "error"; key: K; error: unknown };

/** A resource owns one visible key; the transport retains its retry and cache policy. */
export function createResource<K, T>(options: {
  read: (key: K, signal: AbortSignal) => Promise<T>;
  timeoutMs: number;
  maxReads?: number;
  reconcile?: (previous: T, incoming: T) => T;
}) {
  const [state, setState] = createSignal<ResourceState<K, T>>({ status: "idle", key: null });
  let epoch = 0;
  let version: number | undefined;
  let disposed = false;
  let running: { key: K; controller: AbortController; promise: Promise<T> } | undefined;
  const same = (key: K) => { const current = untrack(state); return current.status !== "idle" && Object.is(current.key, key); };
  const snapshot = (key: K): { value: T } | undefined => {
    const current = untrack(state);
    return same(key) && "value" in current ? { value: current.value } : undefined;
  };
  const abort = () => running?.controller.abort(new DOMException("Resource context changed", "AbortError"));

  function read(key: K): Promise<T> {
    if (disposed) return Promise.reject(new DOMException("Resource disposed", "AbortError"));
    if (running && Object.is(running.key, key) && !running.controller.signal.aborted) return running.promise;
    if (!same(key)) { abort(); epoch++; version = undefined; }
    const previous = snapshot(key);
    const controller = new AbortController();
    const entry = { key, controller, promise: undefined as unknown as Promise<T> };
    let rejectAbort!: (error: unknown) => void;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const onAbort = () => rejectAbort(controller.signal.reason);
    controller.signal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException("Resource deadline exceeded", "TimeoutError")), options.timeoutMs);
    const load = async (): Promise<T> => {
      for (let reads = 0; ; reads++) {
        if (reads >= (options.maxReads ?? 8)) throw new DOMException("Resource invalidation budget exceeded", "QuotaExceededError");
        const requested = epoch;
        try {
          const value = await Promise.race([untrack(() => options.read(key, controller.signal)), aborted]);
          controller.signal.throwIfAborted();
          if (requested !== epoch) continue;
          const prior = snapshot(key);
          const next = prior && options.reconcile ? options.reconcile(prior.value, value) : value;
          setState({ status: "ready", key, value: next });
          return next;
        } catch (error) {
          if (controller.signal.aborted) throw error;
          if (requested !== epoch) continue;
          throw error;
        }
      }
    };
    let begin!: () => void;
    entry.promise = new Promise<T>((resolve, reject) => { begin = () => { void load().then(resolve, reject); }; }).catch(error => {
      if (!disposed && running === entry && same(key)) {
        const prior = snapshot(key);
        setState(prior ? { status: "stale", key, value: prior.value, error } : { status: "error", key, error });
      }
      throw error;
    }).finally(() => {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", onAbort);
      if (running === entry) running = undefined;
    });
    running = entry;
    setState(previous ? { status: "stale", key, value: previous.value } : { status: "loading", key });
    begin();
    return entry.promise;
  }

  return {
    state,
    read,
    invalidate(nextVersion?: number) {
      if (disposed || (nextVersion !== undefined && version !== undefined && nextVersion <= version)) return;
      if (nextVersion !== undefined) version = nextVersion;
      epoch++;
      const current = untrack(state);
      if ("value" in current) setState({ status: "stale", key: current.key, value: current.value });
    },
    seed(key: K, value: T) {
      if (disposed) return;
      if (!same(key)) { abort(); epoch++; version = undefined; }
      const prior = snapshot(key);
      setState({ status: "stale", key, value: prior && options.reconcile ? options.reconcile(prior.value, value) : value });
    },
    dispose() {
      disposed = true; epoch++; abort();
      setState({ status: "idle", key: null });
    },
  };
}
