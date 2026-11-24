import Lock from "lucide-solid/icons/lock";
import Sparkles from "lucide-solid/icons/sparkles";
import { For, Show, createEffect, on, type JSX } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import type { HandlerStatus } from "../../../../ui/src/lib/model";
import { cn } from "../../../../ui/src/lib/utils";
import { MarcaAgente } from "../../../../ui/src/icons";
import { Pressable } from "../../../../ui/src/Pressable";

/** Una fila del menú. `clave` es lo que se inserta al elegirla. */
export type Suggestion = {
  value: string;
  title: string;
  /** Grupo al que pertenece: el alcance de la skill, el tipo de la fuente. */
  label?: string;
  detail?: string;
  /**
   * El grupo bajo cuya cabecera va la fila. Las filas de un grupo llegan
   * seguidas: la cabecera se pinta sobre la primera.
   */
  group?: string;
  /** Lo que la cabecera del grupo avisa con un candado: sus filas no se cambian aquí. */
  groupHint?: string;
  /** Quién resuelve la fila: el CLI de ese agente, o una skill que el agente carga. */
  mark?: { agent: string } | "skill";
  /**
   * La cara del encargado, cuando la fila nombra a alguien y no a algo.
   * Es la señal de especie: con el icono del material, un destinatario se lee
   * como un archivo más y quien llamó a alguien cree que adjuntó algo.
   */
  avatar?: { name: string; status: HandlerStatus; image?: string | null };
  disabled?: boolean;
};

/**
 * El menú que se abre sobre la caja al escribir `@` o `/`. Uno solo para los
 * dos disparadores: dos listas flotantes con el mismo gesto y el mismo teclado
 * se separan al primer retoque.
 *
 * Sin cabecera de «N resultados» ni tira de atajos: una lista con una fila
 * resaltada ya dice cómo se recorre. Lo que sí se queda es lo que el sistema
 * hizo — sin coincidencias, o la lista cortada en su tope.
 */
export default function Suggestions(props: {
  items: Suggestion[];
  index: number;
  /** Qué decir cuando nada coincide. */
  empty: string;
  /** La lista de origen no cabía entera. */
  truncated?: boolean;
  renderAvatar: (props: { name: string; status: HandlerStatus; avatar?: string | null; size?: number; body?: string | null }) => JSX.Element;
  onPick: (s: Suggestion) => void;
}) {
  let list: HTMLUListElement | undefined;

  // Con el teclado, la fila elegida tiene que estar a la vista: sin esto la
  // selección se va por debajo del borde y el menú parece no responder.
  createEffect(
    on(
      () => props.index,
      (i) => list?.children[i]?.scrollIntoView({ block: "nearest" }),
    ),
  );

  return (
    <div class="absolute bottom-full left-0 z-50 mb-2 w-full overflow-hidden rounded-lg border border-border bg-surface-raised shadow-lg">
      <Show
        when={props.items.length > 0}
        fallback={
          <p class="m-0 px-3 py-2 text-xs text-neutral-500">{props.empty}</p>
        }
      >
        <ul ref={list} class="m-0 max-h-64 list-none overflow-y-auto p-1">
          <For each={props.items}>
            {(s, i) => (
              <li>
                <Show when={s.group && s.group !== props.items[i() - 1]?.group}>
                  <p class="m-0 flex items-center gap-2 px-2.5 pt-1.5 pb-0.5 text-caption font-semibold tracking-[0.3px] text-neutral-500 uppercase">
                    <span class="min-w-0 truncate">{s.group}</span>
                    <Show when={s.groupHint}>
                      {(hint) => (
                        <span class="ml-auto flex shrink-0 items-center gap-1 font-medium tracking-normal normal-case">
                          <Lock size={10} aria-hidden="true" />
                          {hint()}
                        </span>
                      )}
                    </Show>
                  </p>
                </Show>
                <Pressable
                  disabled={s.disabled}
                  // `mousedown` y no `click`: el clic quitaría el foco de la
                  // caja antes de insertar, y el cursor volvería al principio.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    props.onPick(s);
                  }}
                  aria-selected={i() === props.index}
                  class={cn(
                    "flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left",
                    s.disabled && "cursor-default opacity-60",
                    s.mark && "h-[34px] items-center gap-2.5 px-2.5 py-0",
                    i() === props.index
                      ? s.mark ? "bg-primary/[0.08]" : "bg-surface-muted"
                      : "hover:bg-surface-muted/60",
                  )}
                >
                  <Show when={s.mark}>
                    {(m) => (
                      <span class="flex size-[18px] shrink-0 items-center justify-center self-center text-neutral-950">
                        <Show when={m() !== "skill"} fallback={<Sparkles size={15} class="text-neutral-500" />}>
                          <MarcaAgente id={(m() as { agent: string }).agent} size={15} />
                        </Show>
                      </span>
                    )}
                  </Show>
                  <Show when={s.avatar}>
                    {(a) => (
                      <span class="shrink-0 self-center">
                        {props.renderAvatar({ name: a().name, status: a().status, avatar: a().image, size: 18 })}
                      </span>
                    )}
                  </Show>
                  <span class={cn("min-w-0 flex-1 truncate font-mono text-xs text-neutral-950", s.mark && "text-ui font-medium")}>
                    {s.title}
                  </span>
                  <Show when={s.detail}>
                    {(d) => (
                      <span class={cn("min-w-0 flex-[2] truncate text-xs text-neutral-500", s.mark && "text-neutral-700")}>
                        {d()}
                      </span>
                    )}
                  </Show>
                  <Show when={s.label}>
                    {(e) => (
                      <span class="shrink-0 rounded-sm bg-surface-muted px-1.5 py-0.5 text-[0.62rem] font-semibold tracking-wide text-neutral-700 uppercase">
                        {e()}
                      </span>
                    )}
                  </Show>
                </Pressable>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={props.truncated}>
        <p class="m-0 border-t border-border px-3 py-1.5 text-caption text-neutral-500">
          {t("chat.suggestions.truncated")}
        </p>
      </Show>
    </div>
  );
}
