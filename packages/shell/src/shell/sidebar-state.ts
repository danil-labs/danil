import { createSignal, onCleanup } from "solid-js";
import { createPref } from "../../../session/src/prefs";


/**
 * Abierto o cerrado, y nada más.
 *
 * **Ni el ancho ni el arrastre viven aquí.** Los dos son de `ColumnaLateral`,
 * que es lo que las dos columnas comparten. Aquí queda lo
 * que **no** comparten: que el historial recuerda entre sesiones de la app si
 * estaba plegado, mientras la columna de artefactos se cierra al cambiar de
 * tarea porque es de ella.
 */
export function createSidebar() {
  const [savedCollapsed, setSavedCollapsed] = createPref("sidebar.collapsed", false);
  const media = window.matchMedia("(max-width: 600px)");
  const [narrow, setNarrow] = createSignal(media.matches);
  const [narrowCollapsed, setNarrowCollapsed] = createSignal(true);
  const update = () => {
    setNarrow(media.matches);
    if (media.matches) setNarrowCollapsed(true);
  };
  media.addEventListener("change", update);
  onCleanup(() => media.removeEventListener("change", update));
  // El teléfono abre sin historial y no cambia la preferencia del escritorio.
  const colapsado = () => narrow() ? narrowCollapsed() : savedCollapsed();

  return {
    colapsado,
    alternar: () => narrow()
      ? setNarrowCollapsed(!narrowCollapsed())
      : setSavedCollapsed(!savedCollapsed()),
  };
}
