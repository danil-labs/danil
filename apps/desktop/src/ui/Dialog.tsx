import { Dialog as Kobalte } from "@kobalte/core/dialog";
import { splitProps, type ComponentProps } from "solid-js";
import { cn } from "../lib/utils";
import { InsideDialog } from "./layer";

/**
 * Una ventana modal: **atrapa el foco y se cierra con `Escape`**, que es
 * justo lo que los modales escritos a mano no hacen.
 *
 * Un `div role="dialog" aria-modal="true"` con un `onClick` en el fondo no lo
 * es: `aria-modal` es una **promesa** —le dice al lector de pantalla que fuera
 * no hay nada—, y tabular dentro saca el foco a la pantalla de detrás mientras
 * `Escape` no cierra porque nadie lo escucha. Nada de eso da error.
 *
 * Sale de `@kobalte/core`, el mismo motor que `Popover.tsx`, y hereda su
 * advertencia: los colores van por tokens de superficie y **nunca** con la
 * variante `dark:` sobre la escala cruda de Tailwind, porque aquí la escala ya
 * se invierte con el tema y `neutral-900` en oscuro es casi blanco.
 *
 * **`z-[80]`, por encima de los popovers.** `PopoverContent` está en `z-[70]`:
 * un diálogo abierto desde un desplegable —el `+` del riel— tiene que taparlo.
 * Al mover cualquiera de los números, ese orden es lo que hay que conservar.
 * `Portal` a `<body>` por lo mismo que en `Popover.tsx`: sin él el diálogo se
 * recorta dentro del contenedor que lo monta, y el riel tiene `overflow:hidden`.
 *
 * **`aria-modal` se pone aquí, y hay que comprobarlo al subir Kobalte.** La
 * 0.13.13 no lo emite: su `Dialog.Content` sale con `role="dialog"` y nada más
 * —comprobado sobre el DOM montado y sobre su bundle, donde la cadena no
 * aparece—. La trampa de foco y el overlay sí los pone; lo que falta es
 * decírselo al lector de pantalla. Si una versión futura lo emite, este atributo
 * sobra; si se quita antes de comprobarlo, el diálogo vuelve a leerse como una
 * región más de la página.
 */
export const Dialog = Kobalte;
export const DialogTitle = Kobalte.Title;

export function DialogContent(props: ComponentProps<typeof Kobalte.Content>) {
  const [propios, resto] = splitProps(props, ["class"]);

  return (
    <Kobalte.Portal>
      <Kobalte.Overlay class="fixed inset-0 z-[80] bg-black/40" />
      {/* El contenedor centra y el `Content` es la tarjeta: centrar sobre el
          propio `Content` obligaría a `translate`, y con eso la animación de
          entrada de Kobalte pelea contra la posición. */}
      <div class="fixed inset-0 z-[80] grid place-items-center p-6">
        <InsideDialog.Provider value={true}>
          <Kobalte.Content
            aria-modal="true"
            class={cn(
              "w-full max-w-[420px] rounded-lg border border-border bg-surface p-4 text-neutral-950 shadow-lg outline-none",
              propios.class,
            )}
            {...resto}
          />
        </InsideDialog.Provider>
      </div>
    </Kobalte.Portal>
  );
}
