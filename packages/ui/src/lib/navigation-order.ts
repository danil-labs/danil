import { type Accessor, createMemo, createSignal, onCleanup } from "solid-js";
import { escribirPref, leerPref } from "../../../session/src/prefs.ts";
import { createPointerDrag } from "./pointer-drag.ts";

type Destination = { id: string; before: boolean };

export function createNavigationOrder(key: Accessor<string>) {
  const [revision, setRevision] = createSignal(0);
  const saved = createMemo(() => {
    revision();
    const value = leerPref<unknown>(key(), []);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  });
  const refresh = (event: Event) => {
    if ((event as CustomEvent<string>).detail === key()) setRevision(n => n + 1);
  };
  const storage = () => setRevision(n => n + 1);
  window.addEventListener("harness:navigation-order", refresh);
  window.addEventListener("storage", storage);
  onCleanup(() => {
    window.removeEventListener("harness:navigation-order", refresh);
    window.removeEventListener("storage", storage);
  });

  return {
    arrange<T extends { id: string }>(items: readonly T[]): T[] {
      const remaining = new Map(items.map(item => [item.id, item]));
      const ordered: T[] = [];
      for (const id of saved()) {
        const item = remaining.get(id);
        if (!item) continue;
        ordered.push(item);
        remaining.delete(id);
      }
      return [...ordered, ...remaining.values()];
    },
    save(ids: string[]) {
      escribirPref(key(), ids);
      window.dispatchEvent(new CustomEvent("harness:navigation-order", { detail: key() }));
    },
  };
}

export function createNavigationReorder(options: {
  scope: Accessor<string>;
  list: () => HTMLElement | undefined;
  attribute: string;
  axis: "x" | "y";
  ids: Accessor<string[]>;
  save: (ids: string[]) => void;
}) {
  const drag = createPointerDrag<Destination>({
    scope: options.scope,
    canStart: id => options.ids().length > 1 && options.ids().includes(id) && !!options.list(),
    locate(point, id) {
      const item = document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>(`[${options.attribute}]`);
      const nextId = item?.getAttribute(options.attribute);
      if (!item || !nextId || !options.list()?.contains(item) || nextId === id) return null;
      const rect = item.getBoundingClientRect();
      return { id: nextId, before: options.axis === "x" ? point.x < rect.left + rect.width / 2 : point.y < rect.top + rect.height / 2 };
    },
    scroll() {
      const element = options.list();
      return element ? { element, axis: options.axis } : null;
    },
    drop(id, drop) {
      const ids = options.ids();
      const remaining = ids.filter(value => value !== id);
      const index = remaining.indexOf(drop.id);
      if (!ids.includes(id) || index < 0) return;
      remaining.splice(index + (drop.before ? 0 : 1), 0, id);
      if (remaining.some((value, i) => value !== ids[i])) options.save(remaining);
    },
  });
  return {
    source: drag.source,
    edge: (id: string) => drag.destination()?.id === id ? (drag.destination()!.before ? "before" : "after") : null,
    start: drag.start,
  };
}
