import { createEffect, createSignal, onCleanup } from "solid-js";

/** El ratón arrastra la tira; touch, trackpad y teclado conservan el scroll nativo. */
export function createGrabScroll(element: () => HTMLElement | undefined) {
  const [dragging, setDragging] = createSignal(false);
  let stop: (() => void) | undefined;
  let suppressClick = false;
  let resetClick: ReturnType<typeof setTimeout> | undefined;
  const blockClick = (event: MouseEvent) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  createEffect(() => {
    const node = element();
    node?.addEventListener("click", blockClick, true);
    onCleanup(() => node?.removeEventListener("click", blockClick, true));
  });
  onCleanup(() => { stop?.(); clearTimeout(resetClick); });

  const start = (event: PointerEvent) => {
    const node = element();
    if (!node || event.pointerType !== "mouse" || event.button !== 0 || !event.isPrimary) return;
    // No capturar la barra de scroll: el navegador maneja su propio tirador.
    if (event.clientY >= node.getBoundingClientRect().top + node.clientHeight) return;
    stop?.();
    clearTimeout(resetClick);
    suppressClick = false;
    const pointer = event.pointerId;
    const origin = event.clientX;
    const initial = node.scrollLeft;
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointer) return;
      if (!dragging() && Math.abs(next.clientX - origin) < 5) return;
      if (!dragging()) {
        setDragging(true);
        suppressClick = true;
        node.setPointerCapture(pointer);
      }
      next.preventDefault();
      node.scrollLeft = initial + origin - next.clientX;
    };
    const finish = (next?: Event) => {
      if (next instanceof PointerEvent && next.pointerId !== pointer) return;
      stop?.();
      resetClick = setTimeout(() => { suppressClick = false; }, 0);
    };
    stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
      if (node.hasPointerCapture(pointer)) node.releasePointerCapture(pointer);
      setDragging(false);
      stop = undefined;
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", finish);
  };
  return { dragging, start };
}
