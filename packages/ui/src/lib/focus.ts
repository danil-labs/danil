/**
 * Un `focus()` automático no le gana a quien está escribiendo. Lo que llega de
 * una tarea no es una acción de la persona: mover el foco ahí le borra el sitio
 * donde teclea. Quién tiene el foco solo se puede preguntar justo antes.
 */

const NO_SE_ESCRIBE = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/** Si esto tiene el foco, hay texto a medio escribir que se perdería. */
function escribible(el: Element): boolean {
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  if (el instanceof HTMLInputElement) {
    return !el.disabled && !el.readOnly && !NO_SE_ESCRIBE.has(el.type);
  }
  return el.matches("[contenteditable]:not([contenteditable='false'])");
}

/** El destino no cuenta: reenfocarlo no le quita nada a nadie. */
export function escribiendoEnOtroSitio(destino?: Element | null): boolean {
  const activo = document.activeElement;
  if (!activo || activo === destino || activo === document.body) return false;
  return escribible(activo);
}

/** `focus()` que cede ante quien ya estaba escribiendo en otro campo. */
export function enfocarSiNadieEscribe(el?: HTMLElement | null) {
  if (!el || escribiendoEnOtroSitio(el)) return;
  el.focus();
}

/**
 * Enfocar un campo al aparecer. Se usa como `ref`: `<Input ref={enfocar} … />`.
 * `autofocus` solo actúa al cargar el documento. El `queueMicrotask` espera a
 * que el elemento esté en el documento: sobre un nodo suelto no hace nada.
 */
export function enfocar(el: HTMLElement) {
  queueMicrotask(() => enfocarSiNadieEscribe(el));
}

/**
 * Enfocar un campo y dejar su texto seleccionado: el `ref` de un renombrado en
 * línea, donde el nombre se reemplaza más que editarse.
 */
export function enfocarYSeleccionar(el: HTMLInputElement) {
  queueMicrotask(() => {
    if (escribiendoEnOtroSitio(el)) return;
    el.focus();
    el.select();
  });
}

/**
 * Abrir una conversación para escribir deja el foco en su campo. Lo atiende el
 * primer compositor que puede: el que ya estaba o el que se monta en el mismo
 * tic. Después caduca, o un compositor montado más tarde lo robaría.
 */
let pedidos = 0;
let pendiente = 0;
const compositores = new Set<() => boolean>();

export function pedirElCampo() {
  const n = ++pedidos;
  pendiente = n;
  for (const atiende of compositores) {
    if (atiende()) {
      pendiente = 0;
      return;
    }
  }
  setTimeout(() => {
    if (pendiente === n) pendiente = 0;
  });
}

/** `atiende` enfoca su campo y dice si pudo. Devuelve la baja. */
export function atenderElCampo(atiende: () => boolean): () => void {
  if (pendiente && atiende()) pendiente = 0;
  compositores.add(atiende);
  return () => compositores.delete(atiende);
}
