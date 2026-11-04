import { getCurrentWindow } from "@tauri-apps/api/window";
import { type Accessor, createSignal, onCleanup, onMount } from "solid-js";
import { capabilities } from "./platform.ts";

// Resolver macOS de forma asíncrona taparía los controles durante el primer render.
export const isMac = () =>
  typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);

export const isWindows = () =>
  typeof navigator !== "undefined" && /Windows/.test(navigator.userAgent);

export function toggleMaximizeFromHeader(event: MouseEvent) {
  if (!isWindows()) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest("button, a, input, select, textarea")) return;
  try {
    void getCurrentWindow().toggleMaximize().catch(() => {});
  } catch {
  }
}

// El semáforo medido termina en x=77,5 pt: 84 px dejan 6,5 pt de separación.
// Su posición no se puede consultar; hay que volver a medir si macOS la cambia.
export const TRAFFIC_LIGHT_PADDING = "pl-[84px]";

// La caja de «Nueva tarea» mide 30 px. La franja usa la misma: el semáforo
// queda a 1 px de su centro (y=15,75 pt) y los controles llenan la fila.
export const HEADER_HEIGHT = "h-[30px]";

// La fila de máquina, carpeta y herramientas es el aire de arriba (`pt-2`, 8 px)
// más esta caja. La ventana de archivos empieza debajo. Con 36 px (`pt-9`) le
// comía 2 px a esa fila desde que la caja pasó de 22 px a 30 px.
// La fila entera, con su altura fija: aunque la ubicación todavía no cargue, el
// hueco ya está y el primer mensaje no sube debajo de las herramientas.
export const LOCATION_BAR = "h-[38px]";
// El panel lateral (archivos, consumo, agentes) deja 10 px más bajo la fila: si
// empieza justo en 38 px, su borde toca los botones y el contador de agentes.
export const BELOW_LOCATION = "pt-[48px]";
export const BELOW_LOCATION_MARGIN = "mt-[48px]";

export const needsTrafficLightPadding = (
  ownsCorner: () => boolean,
  fullscreen: Accessor<boolean>,
) => () => isMac() && capabilities().nativeWindow && !fullscreen() && ownsCorner();

// Tauri no emite cambios de pantalla completa; el cambio de tamaño permite consultarla.
export function createFullscreen(): Accessor<boolean> {
  const [fullscreen, setFullscreen] = createSignal(false);

  onMount(() => {
    // getCurrentWindow() puede lanzar antes de crear la promesa y abortar otros onMount.
    try {
      const window = getCurrentWindow();
      const check = () =>
        window
          .isFullscreen()
          .then(setFullscreen)
          .catch(() => {});
      void check();
      const off = window.onResized(() => void check());
      onCleanup(() => void off.then((f) => f()).catch(() => {}));
    } catch {
    }
  });

  return fullscreen;
}

export const COMPACT_VIEWPORT_QUERY =
  "(max-width: 900px), (orientation: portrait) and (max-width: 1100px)";

// Devolver el valor en vez del getter impediría que Solid rastreara los cambios.
export function createCompactViewport() {
  const media = window.matchMedia(COMPACT_VIEWPORT_QUERY);
  const [compact, setCompact] = createSignal(media.matches);

  const update = () => setCompact(media.matches);
  media.addEventListener("change", update);
  onCleanup(() => media.removeEventListener("change", update));

  return compact;
}
