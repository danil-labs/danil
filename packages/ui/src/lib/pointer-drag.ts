import { type Accessor, batch, createEffect, createSignal, on, onCleanup } from "solid-js";

export type DragPoint = { x: number; y: number };
export type DragScroll = { element: HTMLElement; axis: "x" | "y" };

// El arrastre HTML5 no llega al front de WebView2 con dragDropEnabled activo.
export function createPointerDrag<T>(options: {
  scope: Accessor<string>;
  canStart: (id: string) => boolean;
  locate: (point: DragPoint, id: string) => T | null;
  drop: (id: string, destination: T) => void;
  scroll?: (point: DragPoint) => DragScroll | null;
}) {
  const [source, setSource] = createSignal<string | null>(null);
  const [cursor, setCursor] = createSignal<DragPoint | null>(null);
  const [destination, setDestination] = createSignal<T | null>(null);
  let stop: (() => void) | undefined;
  onCleanup(() => stop?.());
  createEffect(on(options.scope, () => stop?.(), { defer: true }));

  const start = (id: string, event: PointerEvent) => {
    if (event.button !== 0 || event.isPrimary === false || !options.canStart(id)) return;
    stop?.();
    const target = event.currentTarget as HTMLElement;
    const scope = options.scope();
    const pointer = event.pointerId;
    const origin = { x: event.clientX, y: event.clientY };
    let point = origin;
    let dragging = false;
    let cancelled = false;
    let frame = 0;
    let clickTimer: ReturnType<typeof setTimeout> | undefined;
    const previousCursor = document.body.style.cursor;
    const previousSelection = document.body.style.userSelect;

    const locate = () => batch(() => {
      setCursor(point);
      setDestination(() => options.locate(point, id));
    });
    const scroll = () => {
      const track = options.scroll?.(point);
      if (track) {
        const rect = track.element.getBoundingClientRect();
        if (point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) {
          const position = track.axis === "x" ? point.x : point.y;
          const low = track.axis === "x" ? rect.left : rect.top;
          const high = track.axis === "x" ? rect.right : rect.bottom;
          const delta = position < low + 24 ? -8 : position > high - 24 ? 8 : 0;
          if (track.axis === "x") track.element.scrollLeft += delta;
          else track.element.scrollTop += delta;
        }
      }
      locate();
      frame = requestAnimationFrame(scroll);
    };
    const swallowClick = (click: MouseEvent) => {
      click.preventDefault();
      click.stopImmediatePropagation();
    };
    const resetFeedback = () => {
      cancelAnimationFrame(frame);
      if (dragging) {
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousSelection;
      }
      batch(() => {
        setSource(null);
        setCursor(null);
        setDestination(null);
      });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", cancel);
      if (target.hasPointerCapture?.(pointer)) target.releasePointerCapture(pointer);
      resetFeedback();
    };
    stop = () => {
      cleanup();
      clearTimeout(clickTimer);
      window.removeEventListener("click", swallowClick, true);
      stop = undefined;
    };
    const end = () => {
      cleanup();
      if (dragging) clickTimer = setTimeout(() => stop?.(), 0);
      else stop?.();
    };
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointer || cancelled) return;
      if (next.buttons === 0 || options.scope() !== scope || !options.canStart(id)) {
        cancel();
        return;
      }
      point = { x: next.clientX, y: next.clientY };
      if (!dragging && Math.hypot(point.x - origin.x, point.y - origin.y) < 5) return;
      if (!dragging) {
        dragging = true;
        setSource(id);
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
        target.setPointerCapture?.(pointer);
        window.addEventListener("click", swallowClick, true);
        frame = requestAnimationFrame(scroll);
      }
      next.preventDefault();
      locate();
    };
    const finish = (next: PointerEvent) => {
      if (next.pointerId !== pointer) return;
      point = { x: next.clientX, y: next.clientY };
      const drop = dragging && !cancelled && options.scope() === scope && options.canStart(id)
        ? options.locate(point, id)
        : null;
      end();
      if (drop !== null) options.drop(id, drop);
    };
    const cancel = (next?: Event) => {
      if (next instanceof PointerEvent && next.pointerId !== pointer) return;
      end();
    };
    const escape = (key: KeyboardEvent) => {
      if (key.key !== "Escape") return;
      key.preventDefault();
      key.stopImmediatePropagation();
      cancelled = true;
      resetFeedback();
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("blur", cancel);
  };

  return { source, cursor, destination, start };
}
