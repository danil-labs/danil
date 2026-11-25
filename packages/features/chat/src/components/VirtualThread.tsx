import { createVirtualizer, defaultRangeExtractor, observeElementRect, type Range } from "@tanstack/solid-virtual";
import { batch, createEffect, createMemo, createSignal, mapArray, onCleanup, onMount, untrack, type Accessor, type JSX } from "solid-js";
import { ThreadRowContext } from "../model/threadRow";
import { shouldAlignVirtualOffset } from "../model/threadRows";

const THREAD_GAP = 6;
// En hilos cortos/medios (<= 80 bloques) se montan todas las filas para que el scroll sea
// 100 % nativo sin saltos de estimación ni reescrituras de `scrollTop` al subir.
const VIRTUALIZE_ABOVE = 80;
const OVERSCAN = 12;
const JUMP_FRAMES = 12;
// Sin esto una conversación escondida conserva el alto de la anterior y abre por el principio.
const FROM_THE_END = 1e9;

export type VirtualThreadApi = {
  /** Deja la fila a `offset` del borde de arriba, montándola si hace falta. */
  jump: (index: number, offset: number) => Promise<void>;
  /** Dónde cae la fila respecto al borde de arriba, medida o estimada. */
  topOf: (index: number) => number | null;
};

type Placed = { index: number; key: string; before: number; after: number };

/**
 * Filas del hilo en flujo normal entre dos márgenes: lo no montado pesa lo medido o lo
 * estimado. TanStack decide el rango y mide; solo `write` mueve la barra.
 */
export function VirtualThread(props: {
  scroller: HTMLElement;
  keys: Accessor<string[]>;
  estimate: (index: number) => number;
  retained: Accessor<ReadonlySet<string>>;
  write: (offset: number, reading?: boolean) => void;
  /** Los márgenes acaban de cambiar: quien lleva la lectura la devuelve antes de pintar. */
  settled: () => void;
  onRange?: (first: number) => void;
  ref?: (api: VirtualThreadApi) => void;
  row: (key: string, index: Accessor<number>) => JSX.Element;
}) {
  const indexOf = createMemo(() => new Map(props.keys().map((key, index) => [key, index])));
  const rowState = new Map<string, Map<string, unknown>>();
  const [held, setHeld] = createSignal<ReadonlyMap<string, number>>(new Map());
  const virtualizer = createVirtualizer<HTMLElement, HTMLElement>({
    get count() { return props.keys().length; },
    get getItemKey() {
      const keys = props.keys();
      return (index: number) => keys[index];
    },
    getScrollElement: () => props.scroller,
    estimateSize: (index) => props.estimate(index),
    overscan: OVERSCAN,
    gap: THREAD_GAP,
    initialOffset: FROM_THE_END,
    anchorTo: "end",
    followOnAppend: false,
    // `seguirElFondo` es el único dueño de seguir el final: desactivar `wasAtEnd` en TanStack
    // impide que `resizeItem` sume `+delta` a su `scrollOffset` interno cuando un desplegable
    // crece cerca del fondo sin que la barra se mueva (lo que desmontaba filas visibles).
    scrollEndThreshold: -1,
    // `seguirElFondo` es el único dueño de `scrollTop`: TanStack nunca escribe la barra
    // por su cuenta (evita saltos a estimaciones viejas al anteponer o cambiar el conteo).
    scrollToFn: () => {},
    onChange: (instance) => {
      if (instance.range) props.onRange?.(instance.range.startIndex);
    },
    // Una pestaña escondida mide cero: aceptarlo desmontaría lo que se lee.
    observeElementRect: (instance, callback) => observeElementRect(instance, (rect) => {
      if (rect.width > 0 && rect.height > 0) callback(rect);
    }),
    measureElement: (element, _entry, instance) => {
      const height = element.getBoundingClientRect().height;
      if (height > 0 || element.offsetParent !== null) return height;
      const index = Number(element.dataset.index);
      return instance.measurementsCache[index]?.size ?? props.estimate(index);
    },
    get rangeExtractor() {
      const retained = [...props.retained(), ...held().keys()];
      const index = indexOf();
      return (range: Range) => {
        if (range.count <= VIRTUALIZE_ABOVE) {
          return Array.from({ length: range.count }, (_, at) => at);
        }
        const rows = new Set(defaultRangeExtractor(range));
        for (const key of retained) {
          const at = index.get(key);
          if (at !== undefined) rows.add(at);
        }
        return [...rows].sort((a, b) => a - b);
      };
    },
  });
  // `scrollToFn` es no-op, pero alinea el `scrollOffset` interno de TanStack cuando
  // cambia el alto de una fila por encima de la vista: sin esto, `calculateRange()`
  // lee el offset viejo tras `resizeItem` y monta filas hacia arriba en cascada.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) =>
    shouldAlignVirtualOffset(item.end, instance.scrollOffset);

  const placed = createMemo<Placed[]>(() => {
    const items = virtualizer.getVirtualItems();
    const total = virtualizer.getTotalSize();
    let end = 0;
    const rows = items.map((item, position) => {
      const before = item.start - end - (position ? THREAD_GAP : 0);
      end = item.end;
      return { index: item.index, key: String(item.key), before: Math.max(0, before), after: 0 };
    });
    const last = rows.at(-1);
    if (last) last.after = Math.max(0, total - end);
    return rows;
  });
  const order = createMemo(() => placed().map((row) => row.key), undefined, {
    equals: (a, b) => a.length === b.length && a.every((key, at) => key === b[at]),
  });
  const byKey = createMemo(() => new Map(placed().map((row) => [row.key, row])));

  const rowOf = (key: string) => props.scroller.querySelector<HTMLElement>(`[data-thread-key="${CSS.escape(key)}"]`);
  const nextFrame = () => new Promise(requestAnimationFrame);

  const topOf = (index: number) => {
    const key = props.keys()[index];
    if (key === undefined) return null;
    const box = props.scroller.getBoundingClientRect();
    const row = rowOf(key);
    if (row) return row.getBoundingClientRect().top - box.top;
    const item = virtualizer.measurementsCache[index];
    return item ? item.start - props.scroller.scrollTop : null;
  };

  // Sin rastreo: quien salta suele ser un efecto, y `held` lo volvería a disparar.
  const jump = (index: number, offset: number) => untrack(() => settle(index, offset));
  const settle = async (index: number, offset: number) => {
    const key = props.keys()[index];
    if (key === undefined) return;
    // Retenida hasta medirla: el rango no la suelta entre un cuadro y el siguiente.
    const token = (held().get(key) ?? 0) + 1;
    setHeld((all) => new Map(all).set(key, token));
    for (let frame = 0; frame < JUMP_FRAMES; frame++) {
      const top = topOf(indexOf().get(key) ?? index);
      if (top === null) break;
      const moved = top - offset;
      if (Math.abs(moved) < 1 && rowOf(key)) break;
      props.write(props.scroller.scrollTop + moved, true);
      await nextFrame();
    }
    setHeld((all) => {
      const next = new Map(all);
      if (next.get(key) === token) next.delete(key);
      return next;
    });
  };

  onMount(() => props.ref?.({ jump, topOf }));
  onCleanup(() => rowState.clear());

  const rows = mapArray(order, (key) => {
        const row = () => byKey().get(key);
        const index = createMemo<number>((previous) => row()?.index ?? previous, 0);
        const state = rowState.get(key) ?? new Map<string, unknown>();
        rowState.set(key, state);
        let slots = 0;
        let retained = 0;
        const scope = {
          state,
          nextSlot: () => slots++,
          retain: () => {
            if (++retained === 1) pin(key, true);
            return () => {
              if (--retained === 0) pin(key, false);
            };
          },
        };
        onCleanup(() => { if (state.size === 0) rowState.delete(key); });
        return (
          <div
            data-thread-key={key}
            data-index={index()}
            class="grid min-w-0 grid-cols-[minmax(0,1fr)]"
            style={{ "margin-top": `${row()?.before ?? 0}px`, "margin-bottom": `${row()?.after ?? 0}px` }}
          >
            {/* Sin rastreo: lo que lea al crearse no debe rehacer la fila, con su foco, selección e iframes. */}
            <ThreadRowContext.Provider value={scope}>{untrack(() => props.row(key, index))}</ThreadRowContext.Provider>
          </div>
        );
  }) as unknown as Accessor<HTMLElement[]>;

  // Conserva los nodos y solo mueve los que cambiaron de lugar al reconciliar sus claves.
  // Compensa el ancla contra los altos reales recién insertados ANTES de actualizar
  // las medidas en TanStack, evitando cascadas de rango con `scrollOffset` atrasado.
  const end = document.createComment("");
  let mounted = new Set<HTMLElement>();
  let prevMargins = "";
  createEffect(() => {
    const list = placed();
    const next = rows();
    const kept = new Set(next);
    let removed = false;
    for (const row of mounted) {
      if (!kept.has(row)) {
        row.remove();
        removed = true;
      }
    }
    const added: HTMLElement[] = [];
    let after: Node = end;
    const parent = end.parentNode as (Node & { moveBefore?: (node: Node, child: Node | null) => void }) | null;
    for (let at = next.length - 1; at >= 0; at--) {
      const row = next[at];
      if (!mounted.has(row)) added.push(row);
      if (parent && row.nextSibling !== after) {
        if (row.isConnected && typeof parent.moveBefore === "function") parent.moveBefore(row, after);
        else parent.insertBefore(row, after);
      }
      after = row;
    }
    mounted = kept;
    if (removed) virtualizer.measureElement(null);
    const nextMargins = list.map((item) => `${item.before}:${item.after}`).join(",");
    const layoutChanged = added.length > 0 || removed || nextMargins !== prevMargins;
    prevMargins = nextMargins;
    if (layoutChanged) {
      props.settled();
      // Alinea el offset interno de TanStack con el `scrollTop` real que acaba de escribir
      // `settled()` antes de medir filas recién montadas (el evento `scroll` llega después).
      if (virtualizer.scrollOffset !== null) {
        virtualizer.scrollOffset = props.scroller.scrollTop;
      }
    }
    if (added.length > 0) {
      batch(() => {
        for (const row of added) {
          if (!row.isConnected) continue;
          const index = Number(row.dataset.index);
          const key = row.dataset.threadKey;
          const height = row.getBoundingClientRect().height;
          virtualizer.measureElement(row);
          if (height > 0 && Number.isInteger(index) && key !== undefined) {
            const known = virtualizer.itemSizeCache.get(key) ?? virtualizer.measurementsCache[index]?.size;
            if (known === undefined || Math.abs(height - known) >= 0.5) {
              virtualizer.resizeItem(index, height);
            }
          }
        }
      });
    }
    if (virtualizer.range) props.onRange?.(virtualizer.range.startIndex);
  });
  onCleanup(() => {
    for (const row of mounted) row.remove();
    virtualizer.measureElement(null);
  });

  return end as unknown as JSX.Element;

  function pin(key: string, on: boolean) {
    setHeld((all) => {
      if (on === all.has(key)) return all;
      const next = new Map(all);
      if (on) next.set(key, -1);
      else next.delete(key);
      return next;
    });
  }
}
