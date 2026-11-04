/**
 * Lo que `overflow-anchor` hace solo en Chrome y Firefox, para Safari: lo que se está
 * leyendo no se mueve aunque el hilo cambie de alto por abajo. Recuerda el elemento
 * del centro y cuánto se movió es lo que se devuelve; por eso no acumula error
 * aunque la lista virtualizada vuelva a medir después de corregir.
 */
export const NEEDS_SCROLL_ANCHOR = typeof CSS !== "undefined" && !CSS.supports("overflow-anchor", "auto");

export type ScrollAnchor = { element: Element; top: number; id?: string } | null;

/**
 * Baja al final de la lista web. `scroll` y no `scrollTo`: react-native-web cambia el `scrollTo` del nodo por
 * el suyo (`{ x, y, animated }`), que con `top` entiende `y = 0` y sube al inicio del hilo.
 */
export function scrollToEnd(scroller: Element, animated: boolean) {
  if (animated) scroller.scroll({ top: scroller.scrollHeight, behavior: "smooth" });
  else scroller.scrollTop = scroller.scrollHeight;
}

/** El elemento del centro de `scroller`, para compararlo después. */
export function anchorOf(scroller: Element): ScrollAnchor {
  const { left, top, width, height } = scroller.getBoundingClientRect();
  const element = document.elementFromPoint(left + width / 2, top + height / 2);
  if (!element || !scroller.contains(element)) return null;
  const nearest = element.closest('[id^="chat-row:"]');
  const row = nearest && scroller.contains(nearest) ? nearest : element;
  return { element: row, top: row.getBoundingClientRect().top, ...(row.id ? { id: row.id } : {}) };
}

/** Devuelve el ancla a su sitio; la dirección del desplazamiento depende de si la lista está invertida. */
export function restoreAnchor(scroller: Element, anchor: ScrollAnchor, inverted = true): boolean {
  if (!anchor) return false;
  const element = anchor.element.isConnected && scroller.contains(anchor.element)
    ? anchor.element
    : anchor.id ? [...scroller.querySelectorAll("[id]")].find((row) => row.id === anchor.id) : null;
  if (!element || !scroller.contains(element)) return false;
  const moved = element.getBoundingClientRect().top - anchor.top;
  if (Math.abs(moved) >= 1) scroller.scrollTop += inverted ? -moved : moved;
  return Math.abs(element.getBoundingClientRect().top - anchor.top) < 1;
}
