const visibles = new WeakMap<Element, number>();

function contenedor(target: EventTarget | null, teclado: boolean): Element | null {
  let node = target instanceof Element ? target : null;
  while (node) {
    const style = getComputedStyle(node);
    const vertical = /auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight;
    const horizontal = /auto|scroll/.test(style.overflowX) && node.scrollWidth > node.clientWidth;
    if (vertical || horizontal) return node;
    if (teclado && node.matches("input, textarea")) return null;
    node = node.parentElement;
  }
  return document.scrollingElement;
}

function mostrar(target: EventTarget | null, teclado = false) {
  const node = contenedor(target, teclado);
  if (!node) return;
  node.setAttribute("data-scroll-active", "");
  const anterior = visibles.get(node);
  if (anterior !== undefined) window.clearTimeout(anterior);
  visibles.set(node, window.setTimeout(() => {
    node.removeAttribute("data-scroll-active");
    visibles.delete(node);
  }, 1000));
}

export function activarBarrasAlDesplazar() {
  window.addEventListener("wheel", event => mostrar(event.target), { capture: true, passive: true });
  window.addEventListener("touchmove", event => mostrar(event.target), { capture: true, passive: true });
  window.addEventListener("keydown", event => {
    if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) {
      mostrar(document.activeElement, true);
    }
  }, true);
}
