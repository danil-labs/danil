import { createVirtualizer, defaultRangeExtractor, observeElementRect, type Range } from "@tanstack/solid-virtual";
import { createEffect, createMemo, createSignal, mapArray, onCleanup, onMount, untrack, type Accessor, type JSX } from "solid-js";
import { ThreadRowContext } from "./threadRow";

export const THREAD_GAP = 16;
const OVERSCAN = 6;
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
  // Lo que pidió TanStack antes de que los márgenes crecieran: el navegador lo acotó y se repite.
  let wanted: number | null = null;
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
    scrollToFn: (offset, { adjustments = 0 }) => {
      wanted = offset + adjustments;
      props.write(wanted);
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
        const rows = new Set(defaultRangeExtractor(range));
        for (const key of retained) {
          const at = index.get(key);
          if (at !== undefined) rows.add(at);
        }
        return [...rows].sort((a, b) => a - b);
      };
    },
  });
  // La lectura la devuelve `seguirElFondo`: dos correcciones del mismo cambio de alto se sumarían.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = () => false;

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

  createMemo(() => {
    const first = placed()[0];
    if (first) props.onRange?.(first.index);
  });

  createEffect(() => {
    placed();
    if (wanted !== null && Math.abs(props.scroller.scrollTop - wanted) >= 1) props.write(wanted);
    wanted = null;
    props.settled();
  });

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
            ref={(element) => queueMicrotask(() => element.isConnected && virtualizer.measureElement(element))}
          >
            {/* Sin rastreo: lo que lea al crearse no debe rehacer la fila, con su foco, selección e iframes. */}
            <ThreadRowContext.Provider value={scope}>{untrack(() => props.row(key, index))}</ThreadRowContext.Provider>
          </div>
        );
  }) as unknown as Accessor<HTMLElement[]>;

  // Una fila que sigue no se toca: `For` la reemplaza al saltar lejos, y sacarla del árbol colapsa la selección y le quita el foco.
  const end = document.createComment("");
  let mounted = new Set<HTMLElement>();
  createEffect(() => {
    const next = rows();
    const kept = new Set(next);
    for (const row of mounted) if (!kept.has(row)) row.remove();
    let after: Node = end;
    for (let at = next.length - 1; at >= 0; at--) {
      const row = next[at];
      if (!mounted.has(row)) end.parentNode?.insertBefore(row, after);
      after = row;
    }
    mounted = kept;
  });
  onCleanup(() => {
    for (const row of mounted) row.remove();
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
