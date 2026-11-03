import { createEffect, createSignal, on, onCleanup, type JSX } from "solid-js";
import { cn } from "../../lib/utils";

export const QUIETO = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** Las dos columnas de «Preparar» y «Conecta tu IA»: el texto a la izquierda y el trabajo a la derecha. */
export function Escenario(props: { izquierda: JSX.Element; derecha: JSX.Element }) {
  return (
    <div class="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,44%)_minmax(0,56%)] md:overflow-hidden">
      <section class="flex min-h-0 flex-col px-8 py-8 md:overflow-y-auto">{props.izquierda}</section>
      <section class="relative flex min-h-[520px] min-w-0 flex-col gap-2.5 px-6 pb-6 md:min-h-0 md:py-5 md:pr-5 md:pl-0">
        {props.derecha}
      </section>
    </div>
  );
}

/** El título; al cambiar se apaga, se reemplaza y vuelve a encenderse. */
export function TituloCambiante(props: { titulo: string; ref?: (el: HTMLHeadingElement) => void }) {
  const [visible, setVisible] = createSignal({ titulo: props.titulo });
  const [apagado, setApagado] = createSignal(false);
  createEffect(
    on(
      () => props.titulo,
      (titulo) => {
        if (QUIETO()) return void setVisible({ titulo });
        setApagado(true);
        const id = setTimeout(() => {
          setVisible({ titulo });
          setApagado(false);
        }, 220);
        onCleanup(() => clearTimeout(id));
      },
      { defer: true },
    ),
  );
  return (
    <div class={cn("transition-opacity duration-200 motion-reduce:transition-none", apagado() && "opacity-0")}>
      <h1
        ref={props.ref}
        tabindex="-1"
        class="m-0 max-w-[14ch] text-3xl leading-[1.12] font-display font-bold tracking-[-0.03em] text-neutral-950 outline-none"
      >
        {visible().titulo}
      </h1>
    </div>
  );
}
