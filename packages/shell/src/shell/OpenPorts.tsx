import { SignalDot } from "../../../ui/src/SignalDot";
import { For, Show } from "solid-js";
import { isNoMachines } from "../../../host/src/platform";
import { t } from "../../../ui/src/lib/i18n";
import { cn } from "../../../ui/src/lib/utils";
import Plug from "lucide-solid/icons/plug";
import ChevronRight from "lucide-solid/icons/chevron-right";
import ChevronDown from "lucide-solid/icons/chevron-down";
import { Popover, PopoverContent, PopoverTrigger } from "../../../ui/src/Popover";
import { Pressable } from "../../../ui/src/Pressable";
import type { PuertosProps } from "./open-ports-types";
import { createPuertos } from "./open-ports-state";
import { createFilasDePuertos } from "./open-ports-rows";

/**
 * Qué puertos hay escuchando, quién los abrió y qué se puede hacer con ellos.
 *
 * Un turno que levanta un servidor deja un proceso escuchando **después de que
 * el turno acabe**. Sin esto no hay dónde verlo: el puerto sigue tomado, el
 * siguiente arranque falla con «address already in use» y no hay forma de saber
 * quién lo tiene ni de abrirlo sin buscar el pid a mano.
 *
 * **El control se ve siempre, aunque no haya ninguno nuestro.** La pregunta que
 * trae aquí a alguien es «¿quién tiene el 3000?», y esa se hace justo cuando
 * nosotros no tenemos ninguno abierto: escondido, la única respuesta es salir a
 * una terminal, que es lo que este producto existe para no pedir. El contador
 * enseña lo nuestro, que es lo accionable; el total sale en el panel.
 *
 * **Pregunta al montar, al terminar un turno —cuando puede haber aparecido un
 * servidor nuevo—, al abrir el panel y tras cerrar uno. Sin temporizador:** lo
 * que se desincroniza es un servidor que muere por su cuenta, y eso deja el
 * contador alto hasta que alguien abra el panel, que es donde se corrige y el
 * único momento en que a alguien le importa el número exacto.
 *
 * **Abrir tiene dos destinos y no son intercambiables.** El de una tarea abre
 * aquí, como una pestaña más del espacio principal (`features/sites/Site.tsx`),
 * para no salir de la app y perder de vista la tarea que levantó ese servidor.
 * El del navegador del sistema sigue al lado porque esa capa no comparte la
 * sesión de la persona: lo que pida un login lo quiere allá.
 *
 * **Los externos se ven, se abren y no se cierran.** Un puerto que no abrió
 * ninguna tarea de este workspace sale en su sección, plegada y con su cuenta:
 * se abre en el navegador y se copia, pero no se cierra ni se abre como pestaña
 * —una pestaña de sitio pertenece a una tarea, y este no tiene ninguna—. Matar
 * lo que la app no lanzó, con los permisos del usuario del sistema, es
 * destructivo y no es nuestro. La regla la aplica `environment/ports.rs` y no esta pantalla:
 * un `invoke` lo llama cualquiera.
 */

export default function PuertosAbiertos(props: PuertosProps) {
  const estado = createPuertos(props);
  const { datos, abierto, setAbierto, externosAbiertos, setExternosAbiertos, consultando, fallo } = estado;
  const { consultar, mios, externos, processes, hot } = estado;
  const { Fila, ProcessRow } = createFilasDePuertos(props, estado);

  return (
    <Popover
      open={abierto()}
      onOpenChange={(v: boolean) => {
        setAbierto(v);
        if (v) void consultar();
      }}
      placement={props.vertical ? "right-end" : "bottom-end"}
      gutter={6}
    >
      {/* El disparador **no lleva `onClick` propio**: Kobalte no compone
          manejadores como hacía Radix con `asChild`, así que el último gana y
          el panel dejaría de abrirse. Lo que hay que hacer al abrir va en
          `onOpenChange`. */}
      <PopoverTrigger
        as={(p: object) => (
          <Pressable
            {...p}
            class={cn(
              "flex shrink-0 items-center text-neutral-500 outline-none transition-colors hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary data-[expanded]:bg-surface-muted",
              props.vertical ? "relative size-8 justify-center rounded-md" : "gap-1 rounded-sm px-1.5 py-0.5",
            )}
            aria-label={`${t("shell.ports.aria", { mine: mios(), external: externos() })} · ${t("shell.ports.aria_processes", { processes: processes() })}`}
          >
            <Plug size={props.vertical ? 16 : 12} class={!props.vertical && hot() ? "text-warning-strong" : ""} aria-hidden />
            {/* En la columna la cifra no cabe al lado: un punto dice que hay algo abierto. */}
            <Show
              when={!props.vertical}
              fallback={
                <Show when={mios() + processes() > 0}>
                  <SignalDot tone={hot() ? "warning" : "success"} class="absolute top-1 right-1" />
                </Show>
              }
            >
              <span class={cn("font-mono tabular-nums", hot() && "text-warning-strong")}>
                {mios() + processes()}
              </span>
            </Show>
          </Pressable>
        )}
      />

      <PopoverContent
        class="flex max-h-[var(--kb-popper-content-available-height)] w-[340px] flex-col p-0"
        onOpenAutoFocus={(e: Event) => e.preventDefault()}
      >
        <div class="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h2 class="m-0 flex items-center gap-1.5 text-xs font-semibold text-neutral-950">
            <Plug size={12} class="text-neutral-500" aria-hidden />
            {t("shell.ports.title")}
          </h2>
        </div>

        <Show
          when={!datos()?.aviso}
          fallback={
            /* No se pudo preguntar. **Se dice, y no se enseña un panel vacío**:
               una lista sin filas se lee como «no hay puertos», que es otra
               cosa. Pasa en Linux sin `lsof`. */
            <p class="m-0 px-3 py-4 text-xs text-warning-strong">
              {datos()?.aviso}
            </p>
          }
        >
          <div class="min-h-0 flex-1 overflow-y-auto">
            <Show
              when={datos()?.tareas.length}
              fallback={
                <p class="m-0 px-3 py-4 text-center text-xs text-neutral-500">
                  {isNoMachines() ? t("shell.ports.no_machines") : consultando() ? t("shell.ports.checking") : t("shell.ports.none")}
                </p>
              }
            >
              <For each={datos()?.tareas ?? []}>
                {(tarea) => (
                  <section class="border-b border-border last:border-b-0">
                    <h3 class="m-0 truncate px-3 pt-2.5 pb-1 text-xs font-semibold text-neutral-950">
                      {tarea.tarea}
                      <Show when={tarea.proyecto}>
                        {(p) => (
                          <span class="font-normal text-neutral-500"> · {p()}</span>
                        )}
                      </Show>
                    </h3>
                    <ul class="m-0 list-none px-3 pb-2.5 pt-0.5">
                      <For each={tarea.puertos}>
                        {(p) => <Fila p={p} session={tarea.session} project={tarea.project} />}
                      </For>
                      {/* Un proceso no es un puerto: comparten panel, no lista. */}
                      <Show when={tarea.processes.length}>
                        <li class="pt-1.5 text-2xs font-semibold uppercase tracking-wide text-neutral-500">
                          {t("shell.processes.title")}
                        </li>
                      </Show>
                      <For each={tarea.processes}>
                        {(p) => <ProcessRow p={p} session={tarea.session} />}
                      </For>
                      {/* Lo que pasó cuando no se pudo cerrar, en la fila que lo
                          pidió: un botón que no hace nada y no dice por qué
                          manda a pulsarlo otra vez. */}
                      <For each={[...tarea.puertos, ...tarea.processes].filter((p) => fallo()[p.pid])}>
                        {(p) => (
                          <li class="py-0.5 text-xs text-warning-strong">
                            {fallo()[p.pid]}
                          </li>
                        )}
                      </For>
                    </ul>
                  </section>
                )}
              </For>
            </Show>

            <Show when={!isNoMachines()}>
            <section class="border-t border-border">
              {/* Plegada por omisión: son decenas y no son accionables. Se abre
                  para contestar «¿quién tiene el 3000?», que es la pregunta que
                  trae aquí a alguien cuando lo suyo está vacío. */}
              <Pressable
                class="flex w-full items-center gap-1.5 px-3 py-2 text-left text-caption font-semibold uppercase tracking-wide text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
                aria-expanded={externosAbiertos()}
                onClick={() => setExternosAbiertos((v) => !v)}
              >
                <Show
                  when={externosAbiertos()}
                  fallback={<ChevronRight size={12} aria-hidden />}
                >
                  <ChevronDown size={12} aria-hidden />
                </Show>
                <span>{t("shell.ports.external")}</span>
                <span class="ml-auto font-mono tabular-nums">{externos()}</span>
              </Pressable>
              <Show when={externosAbiertos()}>
                <Show
                  when={datos()?.externos.length}
                  fallback={
                    <p class="m-0 px-3 pb-2.5 text-xs text-neutral-500">
                      {t("shell.ports.external.none")}
                    </p>
                  }
                >
                  {/* Sin botón de cerrar: no los abrimos nosotros. El título
                      dice por qué no hay nada que pulsar. */}
                  <ul
                    class="m-0 list-none px-3 pb-2.5"
                    title={t("shell.ports.external.why")}
                  >
                    <For each={datos()?.externos ?? []}>
                      {(p) => <Fila p={p} />}
                    </For>
                  </ul>
                </Show>
              </Show>
            </section>
            </Show>
          </div>
        </Show>
      </PopoverContent>
    </Popover>
  );
}
