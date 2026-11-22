import Check from "lucide-solid/icons/check";
import ChevronDown from "lucide-solid/icons/chevron-down";
import Lock from "lucide-solid/icons/lock";
import Search from "lucide-solid/icons/search";
import Star from "lucide-solid/icons/star";
import { For, Show, lazy } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { left, type Query } from "../../../../../apps/desktop/src/lib/limits";
import { modelPresentation, esFavorito } from "../../../../../apps/desktop/src/lib/models";
import { prosa } from "../../../../../apps/desktop/src/lib/prose";
import { cn } from "../../../../../apps/desktop/src/lib/utils";
import { MarcaAgente } from "../../../../ui/src/icons";
import { Popover, PopoverContent, PopoverTrigger } from "../../../../ui/src/Popover";
import { Pressable } from "../../../../ui/src/Pressable";
import { DISPARADOR, nombreDeNivel, type SelectorDeModeloProps } from "./model-picker-types";
import { createSelectorDeModelo } from "./model-picker-state";

const DanilServices = lazy(() => import("./DanilServices"));

/** Selector buscable; el proveedor sigue visible incluso al filtrar. */
export default function SelectorDeModelo(props: SelectorDeModeloProps) {
  let campo: HTMLInputElement | undefined;
  const { abierto, busqueda, activo, setActivo, seccion, setSeccion, favoritos, cupoGo, filas, consent, estadoRouter, elegido, todosLosGrupos, bloqueado, disponible, creditsModel, routerModel, servicio, grupos, visibles, niveles, nivel, rotuloDeNivel, selectedName, nombre, abrir, buscar, mover, elegir, alternarFavorito } = createSelectorDeModelo(props, { campo: () => campo });

  return (
    <>
    {consent.dialogo()}
    <Popover
      open={abierto()}
      onOpenChange={abrir}
      placement="top-end"
      gutter={6}
    >
      <PopoverTrigger
        as={(p: object) => (
          <Pressable
            {...p}
            disabled={props.disabled}
            class={cn(
              DISPARADOR,
              props.pildora
                ? "h-8 max-w-[15rem] gap-1.5 rounded-full bg-surface-muted px-2 hover:bg-neutral-200 hover:text-neutral-950 data-[expanded]:bg-neutral-200 data-[expanded]:text-neutral-950"
                : "min-h-8 max-w-[11rem] gap-1 rounded-sm px-1.5 hover:bg-neutral-100 hover:text-neutral-950",
            )}
            title={props.disabledReason ?? t("chat.model.title")}
            aria-label={
              rotuloDeNivel()
                ? t("chat.model.aria_effort", { model: nombre(), effort: rotuloDeNivel()! })
                : t("chat.model.aria", { model: nombre() })
            }
          >
            <Show when={props.marca}>
              {(marca) => (
                <span class="flex size-4 shrink-0 items-center justify-center text-neutral-950">
                  <MarcaAgente id={marca()} size={14} />
                </span>
              )}
            </Show>
            <span class={cn("min-w-0 truncate", props.pildora && "font-medium text-neutral-950")}>
              {selectedName() ?? (props.missingModelLabel || t("chat.model.placeholder"))}
            </span>
            <Show when={rotuloDeNivel()}>
              {(rotulo) => (
                <>
                  <span class="shrink-0" aria-hidden="true">·</span>
                  <span class="shrink-0">{rotulo()}</span>
                </>
              )}
            </Show>
            <ChevronDown size={13} class="shrink-0" />
          </Pressable>
        )}
      />

      {/* 22rem en una ventana normal; en una baja, 70%. La lista se desplaza
          y la barra se ve: el resto de la app la esconde hasta que te mueves. */}
      <PopoverContent class="flex h-[min(22rem,70vh)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden p-0" data-owns-escape>
        <div class="flex min-h-9 items-center gap-2 border-b border-border px-3 text-neutral-500">
          <Search size={15} class="shrink-0" />
          <input
            ref={(element) => (campo = element)}
            value={busqueda()}
            placeholder={t("chat.model.search")}
            class="min-w-0 flex-1 border-0 bg-transparent text-sm text-neutral-950 outline-none placeholder:text-neutral-500"
            spellcheck={false}
            autocomplete="off"
            onInput={(event) => buscar(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                mover(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                mover(-1);
              } else if (event.key === "Enter" && visibles().some((opcion) => opcion.key === activo())) {
                event.preventDefault();
                elegir(activo());
              }
            }}
          />
        </div>

        {/* El motivo del candado, visible aunque la lista siga a la vista: los
            otros agentes no se esconden, se leen con su porqué. */}
        <Show when={props.lockedReason}>
          {(motivo) => (
            <p class="m-0 flex items-start gap-1.5 border-b border-border px-3 py-2 text-xs text-neutral-500" role="note" data-agent-locked>
              <Lock size={12} class="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{motivo()}</span>
            </p>
          )}
        </Show>

        <div class="grid min-h-0 flex-1 grid-cols-[2.75rem_minmax(0,1fr)]">
          <nav class="scroll-visible flex min-h-0 flex-col gap-1 overflow-y-auto border-r border-border p-1" aria-label={t("chat.model.providers")}>
            <Pressable
              class={cn("flex size-9 shrink-0 items-center justify-center rounded-sm text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary", seccion() === "favorites" && "bg-surface-muted text-primary")}
              aria-label={t("chat.model.favorites")}
              title={t("chat.model.favorites")}
              onClick={() => setSeccion("favorites")}
            >
              <Star size={17} fill={seccion() === "favorites" ? "currentColor" : "none"} />
            </Pressable>
            <Pressable
              class={cn("flex size-9 shrink-0 items-center justify-center rounded-sm text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary", seccion() === "danil" && "bg-surface-muted text-neutral-950")}
              aria-label={t("chat.services.label")}
              aria-pressed={seccion() === "danil"}
              title={t("chat.services.label")}
              onClick={() => { setSeccion("danil"); setActivo(""); }}
            >
              <MarcaAgente id="danil" size={17} />
            </Pressable>
            <For each={todosLosGrupos()}>
              {(grupo) => (
                <Pressable
                  class={cn("flex size-9 shrink-0 flex-col items-center justify-center gap-px rounded-sm text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary", seccion() === grupo.id && "bg-surface-muted text-neutral-950")}
                  aria-label={grupo.label}
                  title={grupo.label}
                  onClick={() => setSeccion(grupo.id)}
                >
                  <MarcaAgente id={grupo.logo} size={17} />
                </Pressable>
              )}
            </For>
          </nav>
          <div class="scroll-visible min-h-0 overflow-y-auto p-1" role={seccion() === "danil" ? undefined : "listbox"} aria-label={t("chat.model.listbox")}>
          <Show when={seccion() === "danil"} fallback={
          <Show
            when={grupos().some((grupo) => grupo.models.length > 0)}
            fallback={
              <p class="m-0 px-2 py-3 text-sm text-neutral-500">
                {t("chat.model.empty")}
              </p>
            }
          >
            <For each={grupos()}>
              {(grupo) => (
                <section role="group" aria-label={grupo.label}>
                  <div class="flex items-center gap-1.5 px-2 pb-1 pt-2 text-xs font-medium text-neutral-500">
                    <span class="flex size-4 shrink-0 items-center justify-center text-neutral-950">
                      <MarcaAgente id={grupo.logo} size={14} />
                    </span>
                    <span>{grupo.label}</span>
                    <Show when={grupo.models.some((opcion) => opcion.proveedor.id === "opencode-go") && cupoGo()?.mode === "read"}>
                      <span class="ml-auto truncate font-normal">
                        {t("chat.model.go_remaining", {
                          left: Math.min(...((cupoGo() as Extract<Query, { mode: "read" }>).windows.map(left))),
                        })}
                      </span>
                    </Show>
                  </div>
                  <For each={grupo.models}>
                    {(opcion) => (
                      <div
                        ref={(element) => filas.set(opcion.key, element)}
                        role="option"
                        tabindex={disponible(opcion) ? 0 : -1}
                        aria-selected={opcion.key === elegido()?.key}
                        aria-disabled={!disponible(opcion)}
                        class={cn(
                          "grid w-full grid-cols-[16px_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-neutral-950",
                          activo() === opcion.key && "bg-surface-muted",
                          !disponible(opcion) && "cursor-not-allowed opacity-50",
                        )}
                        title={
                          bloqueado(opcion)
                            ? props.lockedReason ?? t("chat.model.locked")
                            : opcion.model.note ? prosa(opcion.model.note) : undefined
                        }
                        onMouseEnter={() => disponible(opcion) && setActivo(opcion.key)}
                        onClick={() => elegir(opcion.key)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            elegir(opcion.key);
                          }
                        }}
                      >
                        <span class="text-primary">
                          <Show when={opcion.key === elegido()?.key}>
                            <Check size={14} />
                          </Show>
                        </span>
                        <span class="flex min-w-0 items-center gap-1 truncate">
                          <Show when={bloqueado(opcion)}>
                            <Lock size={12} class="shrink-0" aria-hidden="true" />
                          </Show>
                          <span class="truncate">{modelPresentation(opcion.model.id, opcion.model.label).label}</span>
                        </span>
                        <Pressable
                          class={cn("rounded-sm p-0.5 text-neutral-500 outline-none hover:text-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary", esFavorito(opcion.key, favoritos()) && "text-primary")}
                          aria-label={esFavorito(opcion.key, favoritos()) ? t("chat.model.unfavorite", { model: modelPresentation(opcion.model.id, opcion.model.label).label }) : t("chat.model.favorite", { model: modelPresentation(opcion.model.id, opcion.model.label).label })}
                          title={esFavorito(opcion.key, favoritos()) ? t("chat.model.unfavorite", { model: modelPresentation(opcion.model.id, opcion.model.label).label }) : t("chat.model.favorite", { model: modelPresentation(opcion.model.id, opcion.model.label).label })}
                          onClick={(event) => {
                            event.stopPropagation();
                            alternarFavorito(opcion.key);
                          }}
                        >
                          <Star size={15} fill={esFavorito(opcion.key, favoritos()) ? "currentColor" : "none"} />
                        </Pressable>
                        <Show when={modelPresentation(opcion.model.id, opcion.model.label).creator}>
                          <span class="rounded-sm border border-border px-1 text-xs text-neutral-500">
                            {modelPresentation(opcion.model.id, opcion.model.label).creator}
                          </span>
                        </Show>
                      </div>
                    )}
                  </For>
                </section>
              )}
            </For>
          </Show>
          }><DanilServices
            onPrepare={props.onCreditsPrepare}
            credits={servicio(creditsModel())}
            router={{
              ...servicio(routerModel()),
              state: estadoRouter(),
              activating: consent.guardando(),
              onActivate: () => { abrir(false); void consent.preguntar(); },
            }}
          /></Show>
        </div>
        </div>

        <Show when={seccion() !== "danil" && niveles().length > 0}>
          <div class="flex min-h-10 items-center gap-3 border-t border-border px-3 py-1.5">
            <span class="shrink-0 text-xs font-medium text-neutral-700">
              {t("chat.effort.label")}
            </span>
            <div
              role="group"
              aria-label={t("chat.effort.title")}
              class="ml-auto flex min-w-0 gap-0.5 overflow-x-auto rounded-md bg-surface-muted p-0.5"
            >
              <For each={niveles()}>
                {(o) => (
                  <Pressable
                    aria-pressed={o.value === nivel()}
                    class={cn(
                      "h-6 shrink-0 rounded-sm px-2 text-xs text-neutral-500 outline-none hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary",
                      o.value === nivel() && "bg-surface-raised font-semibold text-neutral-950 shadow-sm",
                    )}
                    onClick={() => props.onEffort?.(o.value)}
                  >
                    {nombreDeNivel(o.label)}
                  </Pressable>
                )}
              </For>
            </div>
          </div>
        </Show>
      </PopoverContent>
    </Popover>
    </>
  );
}
