import { For, Match, Show, Switch, createMemo } from "solid-js";
import { comparado, doblar, type Linea, type Salto } from "../model/diff";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { cn } from "../../../../ui/src/lib/utils";

/**
 * Un diff, pintado. Vive aparte porque lo usan dos sitios que tienen que verse
 * igual: la fila de la conversación y el panel que revisa el conjunto antes de
 * publicar.
 *
 * Comparte con `features/code/` los tokens `diff-add`/`diff-del` —con valor
 * propio por tema—, la barra de la izquierda y el número del color de su lado:
 * si uno cambia, hay que mover el otro. El signo `+`/`−` solo va aquí, porque
 * una edición suelta no tiene cabecera que diga de qué lado va cada línea.
 *
 * Siguen siendo dos renderizadores porque el dato de entrada es distinto: aquí
 * llegan dos versiones de un archivo y se comparan (`lib/diff.ts`); allí llega
 * un patch de git ya calculado (`features/code/diff.ts`). Si convergen, este
 * es el que se va.
 *
 * El estrechamiento del tipo va en el `when`, no antes: `Trozo` es
 * `Linea | Salto`, y la forma es `when={t.tipo === "salto" ? t : null}` — el
 * ternario estrecha y el hijo recibe el tipo concreto. Un `when` booleano deja
 * al hijo con la unión entera y obliga a un `!` por campo.
 */
export default function BloqueDeDiff(props: {
  cambio: { before: string | null; after: string };
  /**
   * Los números solo salen cuando se sabe dónde caen: un `Edit` manda el trozo
   * viejo y el nuevo sin decir en qué parte del archivo estaban, y contar desde
   * uno le pondría «línea 1» a lo que puede ser la 400.
   */
  numerar: boolean;
  alto?: string;
}) {
  // `createMemo` y no una función suelta: la tabla de subsecuencia común es
  // cara y aquí se leería una vez por línea pintada. Se memoriza por edición.
  const trozos = createMemo(() => doblar(comparado(props.cambio)));

  return (
    <div class="min-w-0 overflow-hidden rounded-sm border border-border">
      <div
        class={cn(
          "overflow-auto font-mono text-caption leading-[1.6]",
          props.alto ?? "max-h-96",
        )}
      >
        <For each={trozos()}>
          {(trozo) => (
            <Switch>
              <Match when={trozo.tipo === "salto" ? (trozo as Salto) : null}>
                {(s) => <SaltoDeDiff salto={s()} />}
              </Match>
              <Match when={trozo.tipo !== "salto" ? (trozo as Linea) : null}>
                {(l) => <LineaDeDiff linea={l()} numerar={props.numerar} />}
              </Match>
            </Switch>
          )}
        </For>
      </div>
    </div>
  );
}

function SaltoDeDiff(props: { salto: Salto }) {
  return (
    <div class="bg-surface-muted px-2 py-0.5 text-center text-neutral-500 tabular-nums">
      {t("chat.diff.collapsed", { count: props.salto.lineas })}
    </div>
  );
}

function LineaDeDiff(props: { linea: Linea; numerar: boolean }) {
  const pone = () => props.linea.tipo === "pone";
  const quita = () => props.linea.tipo === "quita";

  return (
    <div
      class={cn(
        "flex min-w-max items-baseline gap-2 border-l-2 px-2",
        pone() && "border-success bg-diff-add",
        quita() && "border-error bg-diff-del",
        !pone() && !quita() && "border-transparent",
      )}
    >
      <Show when={props.numerar}>
        <span
          class={cn(
            "w-8 shrink-0 text-right tabular-nums select-none",
            pone() && "text-success-strong",
            quita() && "text-error-strong",
            !pone() && !quita() && "text-neutral-500",
          )}
        >
          {props.linea.b ?? ""}
        </span>
      </Show>
      <span
        class={cn(
          "w-2 shrink-0 select-none",
          pone() && "text-success-strong",
          quita() && "text-error-strong",
        )}
      >
        {pone() ? "+" : quita() ? "−" : ""}
      </span>
      <span class="whitespace-pre text-neutral-950">
        {props.linea.texto || " "}
      </span>
    </div>
  );
}
