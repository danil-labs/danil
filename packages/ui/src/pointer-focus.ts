import { mergeProps } from "solid-js";

/**
 * Al abrir, Kobalte enfoca la primera fila del panel. WebKit pinta `:focus-visible` en ese foco
 * aunque el panel se haya abierto con el mouse, y la fila sale con el anillo como si se hubiera
 * llegado con el teclado. Con el puntero, el foco va al panel (`tabIndex=-1`, sin anillo): las
 * flechas siguen funcionando y la primera flecha marca la fila. Con el teclado no cambia nada.
 * Un buscador al principio del panel sí recibe el foco, para poder escribir enseguida.
 */
let pointer = false;
if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", () => (pointer = true), true);
  document.addEventListener("keydown", () => (pointer = false), true);
}

const TABBABLE = 'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
const TYPES = /^(INPUT|TEXTAREA|SELECT)$/;

function pointerOpenFocus(e: Event) {
  const panel = e.currentTarget as HTMLElement | null;
  if (!pointer || e.defaultPrevented || !panel) return;
  const first = panel.querySelector<HTMLElement>(TABBABLE);
  if (first && (TYPES.test(first.tagName) || first.isContentEditable)) return;
  e.preventDefault();
  setTimeout(() => panel.focus({ preventScroll: true }), 0);
}

type AutoFocus = { onOpenAutoFocus?: (e: Event) => void };

/** Las props del panel con `pointerOpenFocus` después del `onOpenAutoFocus` de quien lo monta. */
export function withPointerFocus<T extends AutoFocus>(props: T): T {
  return mergeProps(props, {
    onOpenAutoFocus: (e: Event) => {
      props.onOpenAutoFocus?.(e);
      pointerOpenFocus(e);
    },
  }) as T;
}
