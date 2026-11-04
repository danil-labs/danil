import { type SignalTone, taskSignalTone } from "@terminus/design";
import { cn } from "../lib/utils";

export { type SignalTone, taskSignalTone };

/**
 * La señal de toda la app: un punto de tamaño y color por token
 * (`--signal-dot-size`, `--signal-*` en `global.css`). Quien la usa elige sólo
 * el tono; la etiqueta accesible va en su contenedor.
 */
export function SignalDot(props: { tone: SignalTone; pulse?: boolean; class?: string; title?: string }) {
  return <span aria-hidden="true" title={props.title} class={cn("signal-dot", props.pulse && "animate-danil-pulse", props.class)} data-tone={props.tone} />;
}
