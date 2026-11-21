import type { JSX } from "solid-js";

/** El botón de icono de la barra de un visor: mismo foco y misma altura que las demás. */
export function IconButton(props: { label: string; onClick: () => void; children: JSX.Element }) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
      class="grid size-6 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {props.children}
    </button>
  );
}
