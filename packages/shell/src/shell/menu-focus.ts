/** Flechas arriba y abajo entre las filas de un menú; el buscador cuenta como la primera. */
export function menuArrows(e: KeyboardEvent) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const menu = e.currentTarget as HTMLElement;
  const items = [...menu.querySelectorAll<HTMLElement>('input[type="search"], [role="menuitem"]:not(:disabled), [data-show-workspace]')];
  if (!items.length) return;
  e.preventDefault();
  const at = items.indexOf(document.activeElement as HTMLElement);
  const step = e.key === "ArrowDown" ? 1 : -1;
  items[at < 0 ? (step > 0 ? 0 : items.length - 1) : (at + step + items.length) % items.length]?.focus();
}

/** Devuelve una fila a la barra sin perder el foco: pasa a la vecina o, si no queda, a la primera del menú. */
export function showKeepingFocus(row: HTMLElement, show: () => void) {
  const neighbor = row.nextElementSibling ?? row.previousElementSibling;
  const menu = row.closest<HTMLElement>('[role="menu"]');
  show();
  const target = neighbor?.isConnected ? neighbor.querySelector<HTMLElement>("[data-show-workspace]") : menu?.querySelector<HTMLElement>('[role="menuitem"]');
  target?.focus();
}
