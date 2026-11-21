import { For, Show, createEffect, createSignal, on, onCleanup } from "solid-js";
import Check from "lucide-solid/icons/check";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ShieldCheck from "lucide-solid/icons/shield-check";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import type { ModoDePermiso } from "../../../../../apps/desktop/src/lib/model";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../../../../ui/src/Popover";
import { prosa } from "../../../../../apps/desktop/src/lib/prose";

type Props = {
  modo: string;
  modos: ModoDePermiso[];
  disabled?: boolean;
  onChange: (id: string) => void;
  /**
   * Cuántas veces se ha cambiado el modo. No es el modo: es el pulso que hace
   * visible el cambio. Va como prop porque el atajo de teclado vive en la caja
   * de texto, fuera de este componente: sin un contador que suba también desde
   * allí, cambiar con `shift+tab` no acusaría nada.
   */
  pulso: number;
};

/**
 * Con cuánta vigilancia trabaja el agente, elegible aquí y con `shift+tab`
 * desde la caja de texto.
 *
 * - El modo activo se lee sin abrir nada.
 * - Los modos que este agente no puede se enseñan apagados, con su motivo:
 *   esconderlos dejaría a quien viene de otro agente sin saber qué se llevó el
 *   cambio; ofrecerlos sin más prometería un control que no existe.
 * - El cambio acusa recibo donde está el control: el atajo mueve un rótulo
 *   lejos del cursor, y un rótulo que cambia fuera de la mirada no ha cambiado
 *   para quien escribe. El pulso dura lo justo para verse.
 */
export default function SelectorDeModo(props: Props) {
  const [abierto, setAbierto] = createSignal(false);
  const [acusando, setAcusando] = createSignal(false);
  let reloj: ReturnType<typeof setTimeout> | undefined;

  const elegido = () => props.modos.find((m) => m.id === props.modo);

  // **El efecto declara qué observa**, que es la regla de Solid de este repo:
  // rastrear solo, aquí, correría también al cambiar `modos` o `disabled` y el
  // control parpadearía al cambiar de agente sin que nadie tocara el modo.
  createEffect(
    on(
      () => props.pulso,
      () => {
        setAcusando(true);
        clearTimeout(reloj);
        reloj = setTimeout(() => setAcusando(false), 900);
      },
      // Sin esto pulsaría al montarse, y abrir una tarea no es un cambio de
      // modo: es enterarse de cuál tenía.
      { defer: true },
    ),
  );
  onCleanup(() => clearTimeout(reloj));

  return (
    <Popover open={abierto()} onOpenChange={setAbierto}>
      <PopoverTrigger
        as={(p: object) => (
          <button
            {...p}
            type="button"
            disabled={props.disabled}
            class={cn(
              "flex min-h-8 min-w-0 items-center gap-1 rounded-sm px-1.5 text-xs text-neutral-500 outline-none transition-colors hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60",
              acusando() && "bg-surface-muted text-neutral-950",
            )}
            aria-label={t("chat.mode.aria", {
              mode: elegido() ? prosa(elegido()!.label) : t("chat.mode.none"),
            })}
          >
            <ShieldCheck size={14} class="shrink-0" aria-hidden="true" />
            <span class="truncate">
              {elegido() ? prosa(elegido()!.label) : t("chat.mode.placeholder")}
            </span>
            <ChevronDown size={13} class="shrink-0" />
          </button>
        )}
      />

      <PopoverContent class="w-64 p-1">
        <div role="listbox" aria-label={t("chat.mode.listbox")}>
          <For each={props.modos}>
            {(m) => (
              <button
                type="button"
                role="option"
                aria-selected={m.id === props.modo}
                disabled={!!m.falta}
                class={cn(
                  "grid w-full grid-cols-[16px_minmax(0,1fr)] items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-neutral-950",
                  !m.falta && "hover:bg-surface-muted",
                  m.falta && "cursor-not-allowed opacity-60",
                )}
                onClick={() => {
                  if (m.falta) return;
                  setAbierto(false);
                  props.onChange(m.id);
                }}
              >
                <span class="mt-0.5 text-primary">
                  <Show when={m.id === props.modo}>
                    <Check size={14} />
                  </Show>
                </span>
                <span class="min-w-0">
                  <span class="block truncate">{prosa(m.label)}</span>
                  {/* Solo cuando NO se puede: es lo que pasó y qué lo impide,
                      no una descripción de lo que el modo hace. */}
                  <Show when={m.falta}>
                    {(porque) => (
                      <span class="mt-0.5 block text-xs text-neutral-500">
                        {prosa(porque())}
                      </span>
                    )}
                  </Show>
                </span>
              </button>
            )}
          </For>
        </div>
      </PopoverContent>
    </Popover>
  );
}
