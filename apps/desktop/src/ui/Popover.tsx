import { Popover as Kobalte } from "@kobalte/core/popover";
import { splitProps, type ComponentProps } from "solid-js";
import { cn } from "../lib/utils";
import { insideDialog } from "./layer";

/**
 * Popover común sobre `@kobalte/core` **0.13.13**. Al subir esa versión hay que
 * volver a comprobar el portal, el posicionamiento y los atributos de estado.
 *
 * **`Portal` es la razón de que este átomo exista.** Sin él, el panel se recorta
 * dentro del contenedor que lo monta —el riel del sidebar tiene
 * `overflow:hidden`—; con él sale a `<body>` como hermano del riel, comprobado
 * en un DOM real.
 *
 * **Los colores no salen de la escala cruda de Tailwind.** Aquí la escala de
 * neutros **ya se invierte con el tema**: en oscuro `neutral-900` es `#c6cbe2`,
 * casi blanco, así que un `bg-white … dark:bg-neutral-900` pinta blanco en los
 * dos temas. La forma correcta es la de `Tooltip.tsx`: tokens de superficie, sin
 * ninguna variante `dark:`.
 *
 * Kobalte posiciona con floating-ui: `placement` expresa lado y alineación, y
 * `gutter` la separación — los únicos términos que usa este repo. Y pone
 * `data-expanded` en el trigger abierto y `data-closed` en el cerrado: una clase
 * `data-[state=open]:…` no da error, **deja de pintar en silencio**.
 */
export const Popover = Kobalte;
export const PopoverTrigger = Kobalte.Trigger;
/** Con qué se alinea el panel cuando el disparador no sirve de referencia: un
 * disparador ancho arrastra `top-start` hasta donde acaba, no donde empieza. */
export const PopoverAnchor = Kobalte.Anchor;

/**
 * La forma de un renglón de menú dentro de un `PopoverContent role="menu"`.
 *
 * **Vive aquí y no en cada pantalla** porque son cuatro las que lo montan —el
 * menú de una tarea, el de un proyecto, el de workspace y el de material— y tres
 * copias de la misma cadena de utilities es cómo acaban siendo tres alturas de
 * fila distintas.
 */
export const ITEM_DE_MENU =
  "block w-full rounded-sm px-2 py-1.5 text-left text-ui text-neutral-950 outline-none hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function PopoverContent(props: ComponentProps<typeof Kobalte.Content>) {
  const [propios, resto] = splitProps(props, ["class"]);
  // Dentro de un diálogo (z-[80]) el panel tiene que quedar encima de él.
  const capa = insideDialog() ? "z-[90]" : "z-[70]";

  return (
    <Kobalte.Portal>
      <Kobalte.Content
        class={cn(
          capa,
          "w-72 rounded-lg border border-border bg-surface-raised p-4 text-neutral-950 shadow-md outline-none",
          propios.class,
        )}
        {...resto}
      />
    </Kobalte.Portal>
  );
}
