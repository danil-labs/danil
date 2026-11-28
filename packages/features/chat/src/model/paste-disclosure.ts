/**
 * Rastrea la interacción de la persona al abrir o cerrar un desplegable dentro del hilo
 * (`Pensando…`, `Trabajó durante…`, pasos, razonamiento, preguntas, visuales o historial),
 * para soltar el seguimiento en fase de captura y distinguir el cambio de altura resultante.
 */
export function crearRastreadorDeDesplegables(soltar: () => void) {
  let interaccionDesplegable: "abrir" | "cerrar" | null = null;
  let limpiarInteraccion = 0;

  const marcarInteraccion = (tipo: "abrir" | "cerrar") => {
    interaccionDesplegable = tipo;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(limpiarInteraccion);
    if (typeof requestAnimationFrame === "function") {
      limpiarInteraccion = requestAnimationFrame(() => {
        setTimeout(() => {
          if (interaccionDesplegable === tipo) interaccionDesplegable = null;
        }, 1);
      });
    } else {
      setTimeout(() => {
        if (interaccionDesplegable === tipo) interaccionDesplegable = null;
      }, 1);
    }
  };

  const alInteractuar = (e: Event) => {
    const target = e.target as Element | null;
    const control = target?.closest?.("[aria-expanded], [data-disclosure-toggle]");
    if (!control) return;
    const estado = control.getAttribute("aria-expanded") ?? control.getAttribute("data-disclosure-toggle");
    if (estado === "false" || estado === "open") {
      soltar();
      marcarInteraccion("abrir");
    } else if (estado === "true" || estado === "close") {
      marcarInteraccion("cerrar");
    }
  };

  return {
    actual: () => interaccionDesplegable,
    alInteractuar,
    limpiar: () => {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(limpiarInteraccion);
    },
  };
}
