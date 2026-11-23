/**
 * ⌘A / Ctrl+A fuera de un campo selecciona el bloque donde se hizo clic, no la
 * ventana entera: el mensaje, el bloque de código, el archivo abierto. Repetirlo
 * con el bloque ya entero sube al bloque que lo contiene.
 */

/** Bloques que acotan la selección; el más cercano al clic gana. */
const AMBITO = "[data-select-scope], pre, article, [role='dialog']";

let ultimoClic: Element | null = null;

function enCampo(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  return el.closest("[contenteditable]:not([contenteditable='false'])") !== null;
}

function conDesplazamiento(el: Element): boolean {
  const { overflowY, overflowX } = getComputedStyle(el);
  const desplaza = (v: string) => v === "auto" || v === "scroll";
  return (
    (desplaza(overflowY) && el.scrollHeight > el.clientHeight) ||
    (desplaza(overflowX) && el.scrollWidth > el.clientWidth)
  );
}

/** El primer bloque desde `desde` hacia arriba: uno marcado o una zona con scroll. */
function ambitoSobre(desde: Element | null): Element | null {
  for (let el = desde; el && el !== document.body; el = el.parentElement) {
    if (el.matches(AMBITO) || conDesplazamiento(el)) return el;
  }
  return null;
}

function cubre(sel: Selection, el: Element): boolean {
  if (sel.rangeCount === 0 || sel.isCollapsed) return false;
  const actual = sel.getRangeAt(0);
  const todo = document.createRange();
  todo.selectNodeContents(el);
  return (
    actual.compareBoundaryPoints(Range.START_TO_START, todo) <= 0 &&
    actual.compareBoundaryPoints(Range.END_TO_END, todo) >= 0
  );
}

function origen(sel: Selection): Element | null {
  if (ultimoClic?.isConnected) return ultimoClic;
  const nodo = sel.anchorNode;
  return nodo instanceof Element ? nodo : (nodo?.parentElement ?? null);
}

/** Selecciona el bloque que toca; devuelve `false` si no hay ninguno. */
function seleccionarElBloque(): boolean {
  const sel = document.getSelection();
  if (!sel) return false;
  let bloque = ambitoSobre(origen(sel));
  while (bloque && cubre(sel, bloque)) bloque = ambitoSobre(bloque.parentElement);
  if (!bloque) return false;
  const rango = document.createRange();
  rango.selectNodeContents(bloque);
  sel.removeAllRanges();
  sel.addRange(rango);
  return true;
}

function alPulsar(e: PointerEvent) {
  ultimoClic = e.target instanceof Element ? e.target : null;
}

function alTeclear(e: KeyboardEvent) {
  if (e.defaultPrevented || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
  if (e.key.toLowerCase() !== "a") return;
  const destino = e.target instanceof Element ? e.target : null;
  if (enCampo(destino) || enCampo(document.activeElement)) return;
  // Sin bloque tampoco se deja el comportamiento nativo: seleccionaría la ventana.
  e.preventDefault();
  seleccionarElBloque();
}

export function acotarSeleccionarTodo(win: Window) {
  win.addEventListener("pointerdown", alPulsar, true);
  win.addEventListener("keydown", alTeclear);
}
