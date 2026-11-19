import { createEffect, on, onCleanup } from "solid-js";

/**
 * Cierra un menú con Escape antes que quien esté detrás. Se escucha en fase de
 * captura para llegar antes que la hoja de Configuración; si no, Esc cierra la
 * hoja entera en vez del menú. El clic fuera lo maneja el popover.
 */
export function cerrarConEscape(abierto: () => boolean, cerrar: () => void) {
  createEffect(
    on(abierto, (a) => {
      if (!a) return;
      const tecla = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          cerrar();
        }
      };
      window.addEventListener("keydown", tecla, true);
      onCleanup(() => window.removeEventListener("keydown", tecla, true));
    }),
  );
}
