import { splitProps, type JSX } from "solid-js";
import { cn } from "../../../../apps/desktop/src/lib/utils";

export type ProgressRingProps = Omit<
  JSX.HTMLAttributes<HTMLSpanElement>,
  "children"
> & {
  /** Avance en unidades absolutas. Se recorta a `0..max`. */
  value: number;
  /** El total. `<= 0` pinta una pista vacía, sin dividir por cero. */
  max: number;
  /** Nombre accesible. OBLIGATORIO: un anillo sin nombre no anuncia nada. */
  label: string;
  /** Trazo respaldado por token (`stroke-warning`, `stroke-error`…). */
  ringClass?: string;
};

/**
 * La misma medida que [`ProgressBar`], en anillo: un medidor de ocupación se
 * lee de reojo y una barra fina no se ve de reojo.
 *
 * Quien usa el anillo ofrece el detalle numérico junto a él o en un tooltip.
 *
 * Genérico y sin acoplamiento al dominio, igual que `ProgressBar`: `value` y
 * `max` absolutos, y el tono como utility respaldada por token. El relleno por
 * omisión es el neutro.
 *
 * El trazo se normaliza con `pathLength={100}` en vez de calcular `2πr`: el
 * radio y el grosor se cambian sin que el porcentaje se descuadre — el defecto
 * clásico de los anillos a mano, que se desincronizan sin dar error.
 *
 * Semánticamente es una barra de progreso (`role="progressbar"`): cambia la
 * forma, no lo que mide.
 */
export function ProgressRing(props: ProgressRingProps) {
  const [propios, resto] = splitProps(props, [
    "value",
    "max",
    "label",
    "ringClass",
    "class",
  ]);

  const maxSeguro = () => (propios.max > 0 ? propios.max : 0);
  const recortado = () =>
    maxSeguro() > 0 ? Math.min(maxSeguro(), Math.max(0, propios.value)) : 0;
  const pct = () => (maxSeguro() > 0 ? (recortado() / maxSeguro()) * 100 : 0);

  return (
    <span
      role="progressbar"
      aria-label={propios.label}
      aria-valuemin={0}
      aria-valuemax={maxSeguro()}
      aria-valuenow={recortado()}
      class={cn("inline-flex size-3.5 shrink-0", propios.class)}
      {...resto}
    >
      <svg viewBox="0 0 16 16" fill="none" aria-hidden class="size-full">
        <circle
          cx="8"
          cy="8"
          r="6"
          stroke-width="3"
          class="stroke-surface-muted"
        />
        {/* Desde arriba y en el sentido de las agujas, que es como se lee un
            medidor. Sin el giro empezaría a las tres en punto. */}
        <circle
          cx="8"
          cy="8"
          r="6"
          stroke-width="3"
          stroke-linecap="round"
          pathLength="100"
          stroke-dasharray={`${pct()} 100`}
          transform="rotate(-90 8 8)"
          class={cn(
            "transition-[stroke-dasharray] duration-200",
            propios.ringClass ?? "stroke-neutral-500",
          )}
        />
      </svg>
    </span>
  );
}
