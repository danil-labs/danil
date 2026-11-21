import { createSignal, Show, type JSX } from "solid-js";
import { TOOL_MARKS, type ToolMark, type ToolMarkId } from "./lib/design";

let tabla: Record<ToolMarkId, ToolMark> | null = TOOL_MARKS;
const [marcas, setMarcas] = createSignal<Record<ToolMarkId, ToolMark> | null>(tabla);

export function MarcaServicio(props: { id: ToolMarkId | string; size?: number; class?: string; fallback?: JSX.Element }) {
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
      when={marcas()?.[props.id as ToolMarkId]}
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
