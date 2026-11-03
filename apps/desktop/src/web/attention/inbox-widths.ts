/** De qué lado del tirador está el panel: a la derecha el gesto va al revés. */
export type InboxSide = 'left' | 'right';

/** El ancho que se pinta: entero y dentro de los topes. */
export function inboxWidth(px: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, px)));
}

/** El ancho tras un arrastre desde el ancho pintado `start`. */
export function inboxDrag(start: number, delta: number, side: InboxSide, min: number, max: number): number {
  return inboxWidth(start + (side === 'left' ? delta : -delta), min, max);
}
