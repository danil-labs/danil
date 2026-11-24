/**
 * El menú contextual del webview solo se deja donde hay texto que copiar o
 * pegar. En el resto trae Atrás, Adelante y Recargar, y Recargar tira la
 * ventana entera con lo que hubiera a medias.
 */
const EDITABLE = 'input, textarea, [contenteditable=""], [contenteditable="true"]';

function keepsNativeMenu(target: EventTarget | null, selection: string): boolean {
  if (selection.trim() !== "") return true;
  return Boolean((target as Element | null)?.closest?.(EDITABLE));
}

/** En desarrollo se conserva entero: de ahí sale «Inspect Element». */
export function trimNativeMenu(w: Window, development: boolean) {
  if (development) return;
  w.addEventListener("contextmenu", (e) => {
    if (e.defaultPrevented) return;
    if (!keepsNativeMenu(e.target, w.getSelection()?.toString() ?? "")) e.preventDefault();
  });
}
