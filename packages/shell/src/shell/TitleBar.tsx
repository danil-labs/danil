import { createEffect, createSignal, type JSX, on, onCleanup, onMount } from "solid-js";
import { cn } from "../../../ui/src/lib/utils";
import {
  createFullscreen,
  needsTrafficLightPadding,
  TRAFFIC_LIGHT_PADDING,
  toggleMaximizeFromHeader,
} from "../../../host/src/window";
import WindowControls from "./WindowControls";

/**
 * La franja de la ventana, a todo lo ancho: navegación a la izquierda, las
 * pestañas en medio y los controles de la app a la derecha. Lo que queda libre
 * es donde se arrastra la ventana.
 */
export default function TitleBar(props: {
  /** Ocultar la barra, el espacio y Personalizar. */
  izquierda: JSX.Element;
  /** El botón que va pegado al borde derecho de la barra lateral. */
  finDeIzquierda?: JSX.Element;
  /** Dónde termina la barra lateral, en px de ventana; `null` si está oculta. */
  bordeDeLaBarra: number | null;
  /** Las pestañas de la ventana. */
  centro?: JSX.Element;
  derecha: JSX.Element;
}) {
  const apartarSemaforo = needsTrafficLightPadding(() => true, createFullscreen());
  let grupo: HTMLDivElement | undefined;
  const [inicio, setInicio] = createSignal(0);
  const medir = () => setInicio(grupo?.getBoundingClientRect().left ?? 0);
  onMount(() => {
    medir();
    window.addEventListener("resize", medir);
    onCleanup(() => window.removeEventListener("resize", medir));
  });
  // El hueco del semáforo cambia después del `resize` (pantalla completa se lee aparte) y el
  // de `rem` con la escala, que no lo emite: sin volver a medir, las pestañas nacen fuera de la línea.
  createEffect(on([apartarSemaforo, () => props.bordeDeLaBarra], medir, { defer: true }));
  // El grupo llega justo al borde de la barra: Personalizar queda encima de ella y la primera pestaña nace en esa línea.
  const ancho = () => {
    const borde = props.bordeDeLaBarra;
    return borde === null ? undefined : `${Math.max(0, borde - inicio())}px`;
  };

  return (
    <div
      data-title-bar=""
      class={cn(
        "tab-veil window-frame flex min-h-[42px] shrink-0 items-center pt-1.5",
        apartarSemaforo() ? TRAFFIC_LIGHT_PADDING : "pl-2",
      )}
      data-tauri-drag-region=""
      onDblClick={toggleMaximizeFromHeader}
    >
      <div ref={grupo} class="flex min-w-0 shrink-0 items-center gap-1 pr-2 pb-1.5 max-[600px]:max-w-[calc(100%-2rem)] max-[600px]:shrink" style={{ width: ancho() }}>
        {props.izquierda}
        <span class="min-w-0 flex-1" data-tauri-drag-region="" />
        {props.finDeIzquierda}
      </div>
      {/* El margen vive aquí, fuera de la tira: si fuera su padding, el scroll horizontal se lo come y recorta la primera esquina. */}
      <div class="flex min-w-0 flex-1 items-center self-stretch pl-2">{props.centro}</div>
      <div class="flex shrink-0 items-center gap-1 pr-2 pb-1.5">
        {props.derecha}
        <WindowControls />
      </div>
    </div>
  );
}
