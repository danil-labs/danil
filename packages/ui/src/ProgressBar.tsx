import { For, Show, splitProps, type JSX } from "solid-js";
import { cn } from "./lib/utils";

/**
 * La barra de progreso, segmentada.
 *
 * El relleno por omisión es el **neutro**: la barra de consumo elige su tono
 * según cuánto queda, así que el que se usa sin decir nada no puede significar
 * nada.
 */

export type ProgressSegment = {
  /** Cuánto cubre este tramo, en las mismas unidades que `max`. */
  value: number;
  /** Utility de relleno respaldada por token (`bg-warning`, `bg-error`…). */
  class: string;
  /** Nombra el tramo en la descripción accesible. */
  label?: string;
};

export type ProgressBarProps = Omit<
  JSX.HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  /** Avance en unidades absolutas. Se recorta a `0..max`. */
  value: number;
  /** El total. `<= 0` pinta una pista vacía, sin dividir por cero. */
  max: number;
  /** Nombre accesible. OBLIGATORIO: una barra sin nombre no anuncia nada. */
  label: string;
  /**
   * Coloreado proporcional opcional. Cada tramo pinta su parte de la pista, de
   * izquierda a derecha, en lugar del relleno único. Sigue siendo UNA barra
   * semánticamente: `value` y `max` describen el total.
   */
  segments?: ProgressSegment[];
  /** Relleno respaldado por token, para la variante de relleno único. */
  barClass?: string;
};

/**
 * Avance determinado: pista fina y crisp, más relleno sólido.
 *
 * Genérica y sin acoplamiento al dominio. Quien la usa pasa `value` y `max`
 * absolutos y utilities de relleno. El ancho transiciona para que una lectura
 * nueva se lea como movimiento y no como un salto.
 */
export function ProgressBar(props: ProgressBarProps) {
  const [propios, resto] = splitProps(props, [
    "value",
    "max",
    "label",
    "segments",
    "barClass",
    "class",
  ]);

  const maxSeguro = () => (propios.max > 0 ? propios.max : 0);
  const pct = (v: number) =>
    maxSeguro() > 0 ? Math.min(100, Math.max(0, (v / maxSeguro()) * 100)) : 0;
  const recortado = () =>
    maxSeguro() > 0 ? Math.min(maxSeguro(), Math.max(0, propios.value)) : 0;

  return (
    <div
      role="progressbar"
      aria-label={propios.label}
      aria-valuemin={0}
      aria-valuemax={maxSeguro()}
      aria-valuenow={recortado()}
      class={cn(
        "flex h-1.5 w-full overflow-hidden rounded-full bg-surface-muted",
        propios.class,
      )}
      {...resto}
    >
      <Show
        when={propios.segments?.length}
        fallback={
          <span
            aria-hidden
            class={cn(
              "h-full transition-[width] duration-200",
              propios.barClass ?? "bg-neutral-500",
            )}
            style={{ width: `${pct(recortado())}%` }}
          />
        }
      >
        <For each={propios.segments}>
          {(s) => (
            <span
              aria-hidden
              class={cn("h-full transition-[width] duration-200", s.class)}
              style={{ width: `${pct(s.value)}%` }}
            />
          )}
        </For>
      </Show>
    </div>
  );
}
