import { For, Show, createMemo } from "solid-js";
import UnfoldVertical from "lucide-solid/icons/unfold-vertical";
import { cn } from "../../../../ui/src/lib/utils";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { ajuste } from "../../../../../apps/desktop/src/lib/wrap";
import { marcarLineas, type Hunk, type Linea, type Tramo } from "../model/diff";
import { Pressable } from "../../../../ui/src/Pressable";

/** Las clases del texto de una línea: una sola fila con scroll, o varias con ajuste. */
const textoDeLinea = () =>
  ajuste() ? "min-w-0 flex-1 whitespace-pre-wrap break-words pr-4 pl-1" : "whitespace-pre pr-4 pl-1";

/** Las líneas de un trozo en la vista unificada, con su número real a la izquierda. */
function Trozo(props: { hunk: Hunk }) {
  const tramos = createMemo(() => marcarLineas(props.hunk.lineas));
  return (
    <For each={props.hunk.lineas}>
      {(l, i) => (
        <div
          class={cn(
            "flex border-l-2",
            l.tipo === "add" && "border-success bg-diff-add",
            l.tipo === "del" && "border-error bg-diff-del",
            l.tipo === "ctx" && "border-transparent",
          )}
        >
          <Numero tipo={l.tipo} n={l.nueva ?? l.vieja} class="w-9" />
          <span class={textoDeLinea()}>
            <Texto linea={l} tramos={tramos()[i()]} />
          </span>
        </div>
      )}
    </For>
  );
}

/** Media fila de los dos paneles: número y texto, o el hueco del lado corto. */
function Lado(props: {
  hunk: Hunk;
  indice: number | null;
  tramos: Tramo[][];
  lado: "antes" | "despues";
}) {
  const linea = () => (props.indice === null ? null : props.hunk.lineas[props.indice]);
  return (
    <div
      class={cn(
        "flex min-w-0 border-l-2",
        linea()?.tipo === "add" && "border-success bg-diff-add",
        linea()?.tipo === "del" && "border-error bg-diff-del",
        (linea() === null || linea()?.tipo === "ctx") && "border-transparent",
        linea() === null && "bg-surface-raised",
        ajuste() && props.lado === "antes" && "border-r border-r-border",
      )}
    >
      <Show
        when={linea()}
        fallback={<span class="whitespace-pre"> </span>}
      >
        {(l) => (
          <>
            <Numero
              tipo={l().tipo}
              n={props.lado === "antes" ? l().vieja : l().nueva}
              class="w-11"
            />
            <span class={textoDeLinea()}>
              <Texto linea={l()} tramos={props.indice === null ? [] : props.tramos[props.indice]} />
            </span>
          </>
        )}
      </Show>
    </div>
  );
}

function Numero(props: { tipo: Linea["tipo"]; n: number | null; class: string }) {
  return (
    /* **El número también va de color, y no es adorno.** Es lo que
       distingue las dos filas cuando el fondo es tan tenue como debe ser,
       y lo que dice de qué archivo es ese número: el de una borrada es su
       línea en el archivo de antes, el de una añadida en el de ahora. Sin
       color, dos filas seguidas con el mismo 112 se leen como un error.

       `tabular-nums` para que la columna no baile al pasar de 99 a 100, y
       `select-none` para que copiar el bloque no se lleve los números. */
    <span
      class={cn(
        "shrink-0 select-none pr-2 text-right tabular-nums",
        props.tipo === "add" && "text-success-strong",
        props.tipo === "del" && "text-error-strong",
        props.tipo === "ctx" && "text-neutral-500",
        props.class,
      )}
    >
      {props.n}
    </span>
  );
}

/** El texto de la línea, con los tramos que cambiaron sobre un fondo más fuerte. */
function Texto(props: { linea: Linea; tramos: Tramo[] }) {
  return (
    <Show when={props.tramos.length > 0} fallback={props.linea.texto || " "}>
      {cortar(props.linea.texto, props.tramos).map(([trozo, marcado]) =>
        marcado ? (
          <span
            class={cn(
              "rounded-[2px]",
              props.linea.tipo === "add" ? "bg-diff-add-word" : "bg-diff-del-word",
            )}
          >
            {trozo}
          </span>
        ) : (
          trozo
        ),
      )}
    </Show>
  );
}

function cortar(texto: string, tramos: Tramo[]): [string, boolean][] {
  const piezas: [string, boolean][] = [];
  let desde = 0;
  for (const [inicio, fin] of tramos) {
    if (inicio > desde) piezas.push([texto.slice(desde, inicio), false]);
    piezas.push([texto.slice(inicio, fin), true]);
    desde = fin;
  }
  if (desde < texto.length) piezas.push([texto.slice(desde), false]);
  return piezas;
}

/** El tramo que git no mandó, y el gesto para traerlo. */
function Salto(props: { cuantas: number; onDesplegar: () => void; eco?: boolean }) {
  return (
    <Show when={props.cuantas > 0}>
      <Pressable
        class="col-span-full flex w-full items-center gap-2 border-y border-border bg-surface-raised px-2 py-1 text-left text-caption text-neutral-500 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        onClick={props.onDesplegar}
        title={t("code.gap.title")}
        tabindex={props.eco ? -1 : undefined}
        aria-hidden={props.eco ? true : undefined}
      >
        <UnfoldVertical size={12} class="shrink-0" />
        {t("code.gap.lines", { count: props.cuantas })}
      </Pressable>
    </Show>
  );
}

export { Lado, Salto, Trozo };
