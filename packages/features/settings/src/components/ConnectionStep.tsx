import type { JSX } from "solid-js";

/** Un paso de la conexión: el número, qué hacer, y con qué. */
export function Paso(props: { numero: number; titulo: string; children: JSX.Element }) {
  return (
    <section class="flex gap-3">
      <span class="grid size-5 shrink-0 place-items-center rounded-full bg-surface-muted text-caption font-semibold text-neutral-700">
        {props.numero}
      </span>
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <h3 class="m-0 text-xs font-semibold text-neutral-950">{props.titulo}</h3>
        {props.children}
      </div>
    </section>
  );
}
