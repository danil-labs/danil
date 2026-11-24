import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
import { arrangeSpaces, type SpaceOrderSource } from "../../platform-client/src/space-order.ts";
import { capabilities } from "../../host/src/platform.ts";
import { createNavigationOrder } from "../../ui/src/lib/navigation-order.ts";

type Shared = { workspace: string; source: SpaceOrderSource; ids: string[] | null };

export function createSpaceNavigationOrder(workspace: Accessor<string>, onFailure: () => void) {
  const local = createNavigationOrder(() => `spaces.order.${workspace()}`);
  const [shared, setShared] = createSignal<Shared | null>(null);
  const [pending, setPending] = createSignal<Shared | null>(null);
  const [saving, setSaving] = createSignal(false);
  let revision = 0;
  let disposed = false;
  const read = async () => {
    const id = workspace();
    const source = capabilities().spaceOrder;
    if (!id || !source || saving()) return;
    const request = ++revision;
    try {
      const ids = await source.read(id);
      if (request === revision && workspace() === id && capabilities().spaceOrder === source) {
        setShared({ workspace: id, source, ids });
        if (ids) local.save(ids);
      }
    } catch {
      // Sin red se conserva el último orden confirmado; abrir nunca publica preferencias locales.
    }
  };
  createEffect(() => { workspace(); void read(); });
  const refresh = () => { if (document.visibilityState !== "hidden") void read(); };
  const timer = setInterval(refresh, 15_000);
  window.addEventListener("focus", refresh);
  window.addEventListener("harness:sources", refresh);
  onCleanup(() => {
    disposed = true;
    revision++;
    clearInterval(timer);
    window.removeEventListener("focus", refresh);
    window.removeEventListener("harness:sources", refresh);
  });
  const current = (value: Shared | null) => value?.workspace === workspace() && value.source === capabilities().spaceOrder ? value.ids : null;
  return {
    saving,
    arrange<T extends { id: string }>(items: readonly T[]): T[] {
      const ids = current(pending()) ?? current(shared());
      if (!ids) return local.arrange(items);
      return arrangeSpaces(items, ids);
    },
    async save(ids: string[]) {
      if (saving()) return;
      const id = workspace();
      const source = capabilities().spaceOrder;
      const known = shared();
      if (!source || (known?.workspace === id && known.source === source && known.ids === null)) { local.save(ids); return; }
      revision++;
      setSaving(true);
      setPending({ workspace: id, source, ids });
      try {
        const confirmed = await source.save(id, ids);
        if (!disposed && workspace() === id && capabilities().spaceOrder === source) {
          setShared({ workspace: id, source, ids: confirmed });
          local.save(confirmed);
        }
      } catch { if (!disposed && workspace() === id && capabilities().spaceOrder === source) onFailure(); }
      finally { setPending(null); setSaving(false); }
    },
  };
}
