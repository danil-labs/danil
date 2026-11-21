import { Show } from "solid-js";

/*
 * Desacoplado: en el desktop esto importaba `t`, `prosa` y el modelo `Failure`
 * de lib/. Aquí reciben props ya resueltas: el llamador traduce `what` y
 * `detail`, y pasa la etiqueta del desplegable. El modelo de error y su
 * traducción se quedan en apps/desktop/src/lib/failure.ts.
 */
export function FailureNote(props: {
  what: string;
  detail?: string;
  /** Etiqueta del desplegable del detalle. */
  detailLabel?: string;
}) {
  return (
    <div class="flex flex-col gap-1 py-3 pr-3.5 font-mono text-xs text-error-strong">
      <span class="font-sans text-ui">{props.what}</span>
      <Show when={props.detail}>
        <details>
          <summary class="cursor-pointer font-sans text-caption text-neutral-500">
            {props.detailLabel ?? "Detalle"}
          </summary>
          <p class="m-0 mt-1 font-mono text-caption break-all whitespace-pre-wrap text-neutral-500">
            {props.detail}
          </p>
        </details>
      </Show>
    </div>
  );
}
