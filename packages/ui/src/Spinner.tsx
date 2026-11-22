import RefreshCw from "lucide-solid/icons/refresh-cw";
import { splitProps, type ComponentProps } from "solid-js";
import { cn } from "../../../apps/desktop/src/lib/utils";

/**
 * El loader de toda la app: una pista tenue y un arco que gira continuo (a 24
 * pasos por segundo en WebKit), al reloj común (`lib/sharedClock.ts`). Toma el
 * color del texto.
 *
 * `speed="slow"` es el giro lento de la tarjeta del riel (`--animate-spin-lento`),
 * quieto con movimiento reducido.
 */
export function Spinner(props: { size?: number; class?: string; label?: string; speed?: "slow" }) {
  const size = () => props.size ?? 16;
  return (
    <svg
      class={cn(
        "block shrink-0 animate-spin",
        props.speed === "slow" && "motion-safe:animate-spin-lento motion-reduce:animate-none",
        props.class,
      )}
      width={size()}
      height={size()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={size() > 24 ? 2 : 2.6}
      stroke-linecap="round"
      role={props.label ? "img" : undefined}
      aria-label={props.label}
      aria-hidden={props.label ? undefined : "true"}
      data-spinner
    >
      <circle cx="12" cy="12" r="9.5" opacity="0.18" />
      <path d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5" />
    </svg>
  );
}

/**
 * El ícono de refrescar que gira mientras se actualiza (`spinning`). Es el
 * `RefreshCw` de lucide tal cual: el resto de las props pasa al ícono.
 */
export function RefreshSpinner(props: ComponentProps<typeof RefreshCw> & { spinning?: boolean }) {
  const [propios, resto] = splitProps(props, ["spinning", "class"]);
  return <RefreshCw {...resto} class={cn(propios.spinning && "animate-spin", propios.class)} />;
}

/** El anillo punteado que gira lento: la tarea que el motor todavía registra. */
export function DashedRing(props: { size?: number }) {
  return (
    <svg data-spinner viewBox="0 0 16 16" width={props.size ?? 14} height={props.size ?? 14} class="animate-spin-lento text-neutral-500 motion-reduce:animate-none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.2 2.4" />
    </svg>
  );
}
