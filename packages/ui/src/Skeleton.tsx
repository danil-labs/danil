import { For } from "solid-js";
import { cn } from "../../../apps/desktop/src/lib/utils";

/**
 * Que viene algo, dicho con forma en vez de con prosa.
 *
 * **Sustituye a los «Cargando cuentas…».** Un texto que anuncia una carga es la
 * interfaz narrando lo que hace, y eso no se lee: se ve. Un bloque del tamaño de
 * lo que va a aparecer dice lo mismo, no hay que traducirlo a ningún idioma, y
 * además dice **cuánto** viene.
 *
 * Los tres estados se distinguen —cargando, vacío, error—: dejar la lista como
 * estaba mientras se recarga hace pasar por vigente algo que no lo es.
 *
 * Se para con `prefers-reduced-motion`. Quien lo pide no quiere nada latiendo en
 * la pantalla, y el bloque sigue diciendo lo mismo quieto.
 */
export function Skeleton(props: {
  class?: string;
  /** Cuántos bloques. Que sean varios es la única pista de cuánto viene. */
  filas?: number;
}) {
  const filas = () => Array.from({ length: props.filas ?? 1 }, (_, i) => i);

  return (
    <div class="flex flex-col gap-2" aria-busy="true" aria-live="polite">
      <For each={filas()}>
        {(i) => (
          <div
            class={cn(
              "h-8 rounded-md bg-surface-muted",
              "motion-safe:animate-skeleton",
              props.class,
            )}
            // Desfasadas: a la vez parecen un solo bloque parpadeando, y en
            // cascada se leen como filas de una lista que todavía no llegó.
            style={{ "animation-delay": `${(i * 1000) / 12}ms` }}
          />
        )}
      </For>
    </div>
  );
}
