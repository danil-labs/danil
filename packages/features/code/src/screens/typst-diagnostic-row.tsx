import CircleAlert from "lucide-solid/icons/circle-alert";
import TriangleAlert from "lucide-solid/icons/triangle-alert";
import { Show } from "solid-js";
import { type DiagnosticoTypst, lugarDe } from "../queries/typst";
import { Pressable } from "../../../../ui/src/Pressable";

function FilaDiagnostico(props: { d: DiagnosticoTypst; onIrA: (d: DiagnosticoTypst) => void }) {
  return (
    <li>
      <Pressable
        class="flex w-full items-start gap-2 px-3 py-1 text-left hover:bg-surface-muted disabled:cursor-default"
        disabled={props.d.line === null}
        onClick={() => props.onIrA(props.d)}
      >
        {props.d.severity === "error" ? (
          <CircleAlert size={12} class="mt-0.5 shrink-0 text-error-strong" aria-hidden="true" />
        ) : (
          <TriangleAlert size={12} class="mt-0.5 shrink-0 text-warning-strong" aria-hidden="true" />
        )}
        <Show when={lugarDe(props.d)}>
          <span class="shrink-0 font-mono text-neutral-500">{lugarDe(props.d)}</span>
        </Show>
        <span class="min-w-0 break-words text-neutral-950">{props.d.message}</span>
      </Pressable>
    </li>
  );
}

export { FilaDiagnostico };
