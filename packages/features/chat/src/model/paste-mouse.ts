/** El ratón visto desde el documento: un único estado compartido por todos los hilos. Ver `paste.ts`. */

/**
 * Si el botón del ratón está abajo en cualquier parte del documento.
 *
 * Global: la selección también lo es. El `mouseup` que termina un arrastre
 * puede caer fuera del contenedor, incluso fuera de la ventana; un manejador
 * colgado del contenedor no lo vería, y el hilo dejaría de seguir al agente
 * para siempre creyendo que hay un botón pulsado.
 *
 * Los oyentes se cuelgan en la primera llamada a [`seguirElFondo`], no en el
 * cuerpo del módulo: `node --test` corre los archivos de `lib/` sin `document`,
 * y un efecto de importación rompería todos esos archivos.
 */
let botonAbajo = false;
let vigilandoElRaton = false;
function vigilarElRaton() {
  if (vigilandoElRaton || typeof document === "undefined") return;
  vigilandoElRaton = true;
  document.addEventListener("mousedown", () => {
    botonAbajo = true;
  });
  document.addEventListener("mouseup", () => {
    botonAbajo = false;
  });
  // El `click` también: un `mouseup` sobre otra ventana no llega, y el
  // siguiente clic dentro sí.
  document.addEventListener("click", () => {
    botonAbajo = false;
  });
}

/** Si la rueda hacia arriba sobre `el` lo desplaza a él y no al hilo. */
const subePorDentro = (el: Element) =>
  el.scrollTop > 0 &&
  el.scrollHeight > el.clientHeight &&
  ["scroll", "auto"].includes(getComputedStyle(el).overflowY);

export { botonAbajo, subePorDentro, vigilarElRaton };
