import { createSignal, Show, type JSX } from "solid-js";
import type { ToolMark, ToolMarkId } from "@terminus/design";

/**
 * Pinta una marca de servicio con los trazos de `@terminus/design`.
 *
 * **Los trazos se piden al pintar la primera marca, no al arrancar.** Son ~35 KB
 * de trazos y casi ninguna pantalla pinta una: en la carga inicial pesaban de
 * más (el techo de `tests/perf/`), así que viven en su propio trozo y llegan
 * cuando hacen falta. Mientras llegan, el hueco lo ocupa lo que pase `fallback`
 * —el glifo de la clase— y la fila no se mueve: el hueco ya mide lo suyo.
 */
let tabla: Record<ToolMarkId, ToolMark> | null = null;
let pedido = false;
const [marcas, setMarcas] = createSignal<Record<ToolMarkId, ToolMark> | null>(tabla);

function pedir() {
  if (tabla || pedido) return;
  pedido = true;
  void import("@terminus/design/toolMarksData").then((m) => {
    tabla = m.TOOL_MARKS;
    setMarcas(tabla);
  });
}

export function MarcaServicio(props: { id: ToolMarkId; size?: number; class?: string; fallback?: JSX.Element }) {
  pedir();
  const lado = () => props.size ?? 14;
  const caja = (marca: ToolMark, paths: ToolMark["paths"], clase: string) => (
    <svg
      class={clase}
      width={lado()}
      height={lado()}
      viewBox={marca.viewBox}
      fill="currentColor"
      aria-hidden="true"
    >
      {paths.map((trazo) => (
        <path d={trazo.d} fill={trazo.fill ?? undefined} />
      ))}
    </svg>
  );
  return (
    <Show
      when={marcas()?.[props.id]}
      fallback={props.fallback ?? <span class="block shrink-0" style={{ width: `${lado()}px`, height: `${lado()}px` }} />}
    >
      {(marca) => (
        <Show
          when={marca().dark}
          fallback={caja(marca(), marca().paths, props.class ?? "block shrink-0")}
        >
          {(dark) => (
            <>
              {caja(marca(), marca().paths, `${props.class ?? "block shrink-0"} dark:hidden`)}
              {caja(marca(), dark(), `hidden shrink-0 dark:block`)}
            </>
          )}
        </Show>
      )}
    </Show>
  );
}
