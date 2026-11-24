import { createEffect, createSignal, onCleanup, type Accessor, type Setter } from "solid-js";
import { t } from "../../../../ui/src/lib/i18n";
import { formatCreditsCount } from "../../../../ui/src/lib/tasks/danil-services.ts";
import { capabilities } from "../../../../host/src/platform";
import type { DanilCreditsSource } from "../model/danil-credits";
import { desktopCredits } from "./danil-credits-desktop";

const STALE_MS = 30_000;
const DEFAULT_SCOPE = "__default__";

type SlotState = {
  /** `undefined` solo antes de la primera lectura; después conserva el último valor válido durante revalidaciones. */
  amount: number | null | undefined;
  fetchedAt: number;
  refreshing: boolean;
};

type Slot = {
  get: Accessor<SlotState>;
  set: Setter<SlotState>;
  inflight: Promise<number | null> | null;
  pending: AbortController | null;
  epoch: number;
};

type SourceStore = {
  slots: Map<string, Slot>;
  refs: number;
  stopSubscribe?: () => void;
  stopVisibility?: () => void;
};

const stores = new WeakMap<DanilCreditsSource, SourceStore>();

function currentSource(): DanilCreditsSource | undefined {
  return capabilities().danilCredits ?? (capabilities().nativeWindow ? desktopCredits : undefined);
}

function storeFor(source: DanilCreditsSource): SourceStore {
  let store = stores.get(source);
  if (!store) {
    store = { slots: new Map(), refs: 0 };
    stores.set(source, store);
  }
  return store;
}

function slotFor(store: SourceStore, key: string): Slot {
  let slot = store.slots.get(key);
  if (!slot) {
    const [get, set] = createSignal<SlotState>({ amount: undefined, fetchedAt: 0, refreshing: false });
    slot = { get, set, inflight: null, pending: null, epoch: 0 };
    store.slots.set(key, slot);
  }
  return slot;
}

function scopeKeyOf(source: DanilCreditsSource): string | null {
  if (!source.scope) return DEFAULT_SCOPE;
  return source.scope();
}

function fetchSlot(
  source: DanilCreditsSource,
  store: SourceStore,
  key: string,
  options: { force?: boolean; clear?: boolean } = {},
): Promise<number | null> {
  const slot = slotFor(store, key);
  const now = Date.now();
  const state = slot.get();

  if (options.clear) {
    slot.epoch += 1;
    slot.pending?.abort();
    slot.pending = null;
    slot.inflight = null;
    source.clearCache?.();
    slot.set({ amount: undefined, fetchedAt: 0, refreshing: true });
  } else {
    if (!options.force && state.fetchedAt > 0 && now - state.fetchedAt < STALE_MS) {
      return Promise.resolve(state.amount ?? null);
    }
    if (slot.inflight) {
      if (!options.force) return slot.inflight;
      slot.epoch += 1;
      slot.pending?.abort();
      slot.pending = null;
      slot.inflight = null;
    }
    if (options.force) source.clearCache?.();
    slot.set((prev) => ({ ...prev, refreshing: true }));
  }

  const epoch = slot.epoch;
  const controller = new AbortController();
  slot.pending = controller;
  const run = source
    .readBalance(controller.signal)
    .then((value) => (typeof value === "number" && Number.isFinite(value) ? value : null))
    .catch(() => null)
    .then((next) => {
      if (slot.epoch !== epoch || controller.signal.aborted) return next;
      slot.set((prev) => ({
        // Un fallo transitorio nunca borra un saldo conocido de la misma organización.
        amount: next !== null ? next : typeof prev.amount === "number" ? prev.amount : null,
        fetchedAt: Date.now(),
        refreshing: false,
      }));
      return next;
    })
    .finally(() => {
      if (slot.inflight === run) slot.inflight = null;
      if (slot.pending === controller) slot.pending = null;
    });
  slot.inflight = run;
  return run;
}

function attachStore(source: DanilCreditsSource): () => void {
  const store = storeFor(source);
  store.refs += 1;
  if (store.refs === 1) {
    if (source.subscribe) {
      store.stopSubscribe = source.subscribe(() => {
        source.clearCache?.();
        for (const slot of store.slots.values()) {
          slot.epoch += 1;
          slot.pending?.abort();
          slot.pending = null;
          slot.inflight = null;
          slot.set({ amount: undefined, fetchedAt: 0, refreshing: false });
        }
        const key = scopeKeyOf(source);
        if (key !== null) void fetchSlot(source, store, key, { force: true });
      });
    }
    if (typeof document !== "undefined") {
      const onVisibility = () => {
        if (document.visibilityState !== "visible") return;
        const key = scopeKeyOf(source);
        if (key !== null) void fetchSlot(source, store, key);
      };
      document.addEventListener("visibilitychange", onVisibility);
      store.stopVisibility = () => document.removeEventListener("visibilitychange", onVisibility);
    }
  }
  return () => {
    store.refs -= 1;
    if (store.refs <= 0) {
      store.refs = 0;
      store.stopSubscribe?.();
      store.stopSubscribe = undefined;
      store.stopVisibility?.();
      store.stopVisibility = undefined;
    }
  };
}

/** Fuerza una revalidación en segundo plano del saldo compartido (ej. al cerrar un turno o al pulsar Actualizar). */
export function refreshDanilCreditsBalance(options: { force?: boolean } = {}): Promise<number | null> {
  const source = currentSource();
  if (!source) return Promise.resolve(null);
  const key = scopeKeyOf(source);
  if (key === null) return Promise.resolve(null);
  return fetchSlot(source, storeFor(source), key, { force: options.force ?? true });
}

export function createDanilCreditsBalance(options?: { enabled?: () => boolean }) {
  const enabled = () => options?.enabled?.() ?? true;
  const source = () => currentSource();

  createEffect(() => {
    const active = source();
    if (!active || !enabled()) return;
    const detach = attachStore(active);
    onCleanup(detach);
  });

  createEffect(() => {
    const active = source();
    if (!active || !enabled()) return;
    const key = scopeKeyOf(active);
    if (key === null) return;
    void fetchSlot(active, storeFor(active), key);
  });

  const activeSlot = () => {
    const active = source();
    if (!active) return null;
    const key = scopeKeyOf(active);
    if (key === null) return null;
    return slotFor(storeFor(active), key);
  };

  const amount = (): number | null | undefined => {
    const slot = activeSlot();
    return slot ? slot.get().amount : null;
  };

  const refreshing = (): boolean => activeSlot()?.get().refreshing ?? false;

  const compact = (): string | null => {
    const value = amount();
    return typeof value === "number" ? formatCreditsCount(value) : null;
  };

  const label = () => {
    const value = amount();
    if (value === undefined) return t("chat.services.loading");
    return value === null ? t("chat.credits.unavailable") : t("chat.credits.amount", { count: formatCreditsCount(value) });
  };

  const refresh = () => {
    const active = source();
    if (!active) return Promise.resolve(null);
    const key = scopeKeyOf(active);
    if (key === null) return Promise.resolve(null);
    return fetchSlot(active, storeFor(active), key, { force: true });
  };

  return { amount, compact, label, refreshing, refresh };
}
