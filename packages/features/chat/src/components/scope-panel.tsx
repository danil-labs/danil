import type { JSX } from "solid-js";
import { PopoverContent } from "../../../../ui/src/Popover";

/**
 * La caja de los dos desplegables de esta fila, en una sola pieza.
 *
 * **Sale por el átomo compartido `Popover`**, no por un `div` absoluto ni por un
 * `createEffect` con `document.addEventListener`. Un `div` no descarta nada —sin
 * listener de puntero, de `Escape` ni capa que intercepte el clic, lo único que
 * lo cierra es volver a pulsar el disparador—, y el listener a mano tendría que
 * reimplementar la exclusión del disparador, el foco de vuelta y el portal.
 * Kobalte excluye el disparador del «fuera» (`excludedElements`), así que
 * pulsarlo con el panel abierto **cierra y no reabre**, sin el parpadeo de
 * cerrar en `pointerdown` y reabrir en el `click` de detrás. Y sale del portal,
 * así que no se pinta detrás de la capa nativa de un sitio abierto
 * (`lib/sites.ts` esconde el webview cuando hay portal; un `div` no lo es).
 *
 * Dos cosas que le cambia al átomo:
 *
 * 1. **El foco no va al primer tabulable**, que aquí es el primer renglón de la
 *    lista: con el del átomo se pierde «abrir y escribir para filtrar». Se
 *    enfoca el buscador **solo si nadie dentro lo tomó ya** (`ref={enfocar}`),
 *    que resuelve el orden sin depender de quién corra primero. Entrar tiene que
 *    entrar: con el foco en el `textarea` del chat, `Escape` lo cobra su
 *    manejador, donde significa *vacía el borrador*.
 * 2. **Perder el foco de la ventana no cierra.** «Elegir una carpeta» abre un
 *    diálogo del sistema, que no es un clic en otra parte de la app; si cerrara,
 *    un fallo al traer la carpeta se quedaría sin dónde decirse.
 *
 * Queda **no modal**: el clic que cierra también activa lo que hay debajo, igual
 * que en `SelectorDeModelo`, `SelectorDeModo` y los menús del riel. Los dos
 * flotan sobre la caja de escribir y el clic que los cierra casi siempre es
 * «vuelvo a escribir»; tragarlo cobraría dos clics.
 */
function Panel(props: { children: JSX.Element }) {
  let caja: HTMLElement | undefined;

  return (
    <PopoverContent
      ref={caja}
      tabindex="-1"
      // Portado a `<body>`, así que no hereda el tamaño ni el color de la fila:
      // lo que allí venía del contenedor, aquí hay que decirlo.
      class="w-[300px] overflow-hidden p-0 text-caption text-neutral-500 shadow-lg"
      onOpenAutoFocus={(e: Event) => {
        e.preventDefault();
        queueMicrotask(() => {
          if (caja && !caja.contains(document.activeElement)) caja.focus();
        });
      }}
      onFocusOutside={(e: Event) => e.preventDefault()}
    >
      {props.children}
    </PopoverContent>
  );
}

export { Panel };
