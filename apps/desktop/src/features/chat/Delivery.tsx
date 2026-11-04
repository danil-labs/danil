import { For, Show, type Component } from "solid-js";
import { createRowSignal } from "./threadRow";
import { Dynamic } from "solid-js/web";
import FilePenLine from "lucide-solid/icons/file-pen-line";
import FilePlus2 from "lucide-solid/icons/file-plus-2";
import { peso } from "../../lib/format";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";

/** Un artefacto que un turno dejó en la carpeta de trabajo, según `workspace/artifacts.rs`. */
export type Producido = {
  /** Ruta relativa a la carpeta de la tarea. Es con lo que se abre. */
  rel: string;
  bytes: number;
  /** Ya existía: es una versión nueva, no un artefacto nuevo. */
  revision: boolean;
};

/**
 * Cuántos se enseñan antes de plegar el resto.
 *
 * Un turno que produce ocho archivos no puede empujar la respuesta fuera de la
 * pantalla: lo que se contesta de un vistazo es «entregó algo», y cuáles son se
 * pide.
 */
const TOPE = 4;

type Grupo = {
  revision: boolean;
  /** Uno solo. */
  verbo: string;
  /** Varios, con el número dentro. */
  plural: (n: number) => string;
  Icono: Component<{ size?: number; class?: string; "aria-hidden"?: boolean }>;
};

/**
 * **Nacer y cambiar no se anuncian igual**, y por eso son dos grupos y no una
 * lista con una marca al lado. Reescribir un artefacto es una versión nueva
 * (`workspace/versions.rs`): una tarea de cinco correcciones sobre el mismo documento
 * entregó **un** documento, y aplanarlas la haría leerse como cinco.
 *
 * **Es una función y no un arreglo.** Un `const GRUPOS = [{ verbo: t(…) }]` a
 * nivel de módulo se evalúa al importarse, así que se congela con la lengua de
 * ese instante: cambiar de idioma dejaría los dos verbos en la anterior, sin
 * error y sin nada en consola. Leído desde el `each` del `<For>`, que es una
 * expresión reactiva, se rehace con `lengua()`.
 */
const GRUPOS = (): Grupo[] => [
  {
    revision: false,
    verbo: t("chat.delivery.produced"),
    plural: (n) => t("chat.delivery.produced_many", { count: n }),
    Icono: FilePlus2,
  },
  {
    revision: true,
    verbo: t("chat.delivery.updated"),
    plural: (n) => t("chat.delivery.updated_many", { count: n }),
    Icono: FilePenLine,
  },
];

/**
 * Lo que el turno entregó, dicho en la conversación que lo pidió.
 *
 * **El artefacto es el entregable**, y sin esto nace en silencio: un ícono en la
 * franja de arriba y la persona sigue leyendo la respuesta sin enterarse de que
 * hay un archivo. Un documento recién escrito es exactamente
 * lo que `CLAUDE.md` deja decir —lo que el sistema hizo y su consecuencia—, así
 * que esto no es glosa: es la retroalimentación que faltaba.
 *
 * **Va en el hilo y no en un aviso flotante.** Un turno de hace media hora
 * también produjo algo, y una tarea es una sucesión de entregas: puesto en el
 * sitio donde ocurrió, la transcripción dice qué salió de cada turno — que es lo
 * que el gate tiene que poder revisar. Un toast se descarta y no deja rastro.
 *
 * Y **lleva a abrirlo**. Anunciar un documento sin poder abrirlo desde donde se
 * anuncia obliga a buscarlo en otra columna, que es el camino que hoy nadie
 * recorre porque nadie sabe que hay algo al final.
 */
export default function Entrega(props: {
  items: Producido[];
  onAbrir: (rel: string) => void;
}) {
  const [todos, setTodos] = createRowSignal("delivery", false);

  return (
    <div class="grid gap-1.5 rounded-md border border-border bg-surface-raised p-1.5 shadow-sm">
      <For each={GRUPOS()}>
        {(g) => {
          const items = () => props.items.filter((a) => a.revision === g.revision);
          const visibles = () =>
            todos() ? items() : items().slice(0, TOPE);
          const ocultos = () => items().length - visibles().length;

          return (
            <Show when={items().length > 0}>
              <div class="grid gap-0.5">
                {/* Con uno solo, el verbo va en la misma fila que el nombre: es
                    la gramática de la línea de tiempo —verbo en prosa, sujeto
                    como dato de máquina— y un renglón propio para decir
                    «Produjo» encima de un único archivo es un rótulo. */}
                <Show when={items().length > 1}>
                  <p class="m-0 px-1.5 pt-0.5 text-xs font-medium text-neutral-700">
                    {g.plural(items().length)}
                  </p>
                </Show>

                <For each={visibles()}>
                  {(a) => (
                    <button
                      type="button"
                      class={cn(
                        "flex w-full min-w-0 items-center gap-2 rounded-sm px-1.5 py-1 text-left transition-colors hover:bg-surface-muted",
                        items().length > 1 && "pl-3",
                      )}
                      onClick={() => props.onAbrir(a.rel)}
                      title={a.rel}
                    >
                      {/* El ícono va en el color del agente. El sistema visual reserva
                          el morado para sus acciones, y producir un documento es
                          la suya: es lo que distingue esta fila de un paso de la
                          línea de tiempo, que es fontanería y va en gris. */}
                      <Dynamic
                        component={g.Icono}
                        size={13}
                        class="shrink-0 text-primary"
                        aria-hidden={true}
                      />
                      <Show when={items().length === 1}>
                        <span class="shrink-0 text-xs font-medium text-neutral-700">
                          {g.verbo}
                        </span>
                      </Show>
                      {/* La ruta entera y no solo el nombre: es la misma con la
                          que se lista en la columna, y dos artefactos anidados
                          pueden llamarse igual. */}
                      <span class="min-w-0 truncate font-mono text-xs text-neutral-950">
                        {a.rel}
                      </span>
                      <span class="ml-auto shrink-0 font-mono text-caption text-neutral-500 tabular-nums">
                        {peso(a.bytes)}
                      </span>
                    </button>
                  )}
                </For>

                <Show when={ocultos() > 0}>
                  <button
                    type="button"
                    class="justify-self-start rounded-sm py-0.5 pr-1.5 pl-3 text-caption text-neutral-500 transition-colors hover:text-neutral-950"
                    onClick={() => setTodos(true)}
                  >
                    {t("chat.delivery.more", { count: ocultos() })}
                  </button>
                </Show>
              </div>
            </Show>
          );
        }}
      </For>
    </div>
  );
}
