import type { JSX } from "solid-js";
import { Dynamic } from "solid-js/web";

/** El rótulo de una sección de panel: pequeño, en mayúsculas y sin peso visual. */
export function SectionLabel(props: { as?: "h2" | "h3"; children: JSX.Element }) {
  return (
    <Dynamic component={props.as ?? "h2"} class="m-0 text-caption font-medium tracking-wide text-neutral-500 uppercase">
      {props.children}
    </Dynamic>
  );
}
