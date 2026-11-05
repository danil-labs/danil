import Check from "lucide-solid/icons/check";
import ChevronDown from "lucide-solid/icons/chevron-down";
import Lock from "lucide-solid/icons/lock";
import Search from "lucide-solid/icons/search";
import Star from "lucide-solid/icons/star";
import { createMemo, createSignal, For, Show } from "solid-js";
import { t } from "../../lib/i18n";
import { invoke } from "../../lib/invoke.ts";
import { left, type Query } from "../../lib/limits";
import {
  agruparModelos,
  effortOptions,
  effortValue,
  esFavorito,
  favoritosDeModelos,
  type GrupoDeModelos,
  type OpcionDeModelo,
} from "../../lib/models";
import { createPref } from "../../lib/prefs";
import { prosa } from "../../lib/prose";
import { cn } from "../../lib/utils";
import { MarcaAgente } from "../../ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/Popover";
import type { AccountList } from "../settings/accounts-store";

type SelectorDeModeloProps = {
  invokeOptions?: { headers: Record<string, string> };
  models: OpcionDeModelo[];
  superficie: string;
  model: string;
  missingModelLabel?: string;
  disabled?: boolean;
  disabledReason?: string;
  onChange: (model: OpcionDeModelo) => void;
  /** El agente de la tarea: los demás se ven, pero el candado dice por qué no se eligen. */
  lockedAgent?: string;
  lockedReason?: string | null;
  /** La píldora de la caja del chat; sin ella, el disparador fantasma. */
  pildora?: boolean;
  /** El agente que responde, para pintar su marca en el disparador. */
  marca?: string;
  /** Los niveles del modelo elegido. Sin `onEffort` no se ofrecen. */
  efforts?: readonly string[];
  defaultEffort?: string | null;
  effort?: string;
  onEffort?: (id: string) => void;
};

/** Los niveles que el catálogo sabe nombrar; otro sale como lo llama el agente. */
const NIVELES_CON_NOMBRE = ["minimal", "low", "medium", "high", "xhigh", "max"];

function nombreDeNivel(id: string | null | undefined): string {
  if (!id) return t("chat.effort.agent_decides");
  return NIVELES_CON_NOMBRE.includes(id) ? t(`chat.effort.level.${id}`) : id;
}

const DISPARADOR =
  "flex min-w-0 items-center text-xs text-neutral-500 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60";

/** Selector buscable; el proveedor sigue visible incluso al filtrar. */
export default function SelectorDeModelo(props: SelectorDeModeloProps) {
  const [abierto, setAbierto] = createSignal(false);
  const [busqueda, setBusqueda] = createSignal("");
  const [activo, setActivo] = createSignal("");
  const [seccion, setSeccion] = createSignal("favorites");
  const [favoritos, setFavoritos] = createPref<string[]>("chat.model.favorites", []);
  const [cupoGo, setCupoGo] = createSignal<Query | null>(null);
  const filas = new Map<string, HTMLElement>();
  let campo: HTMLInputElement | undefined;

  const elegido = () =>
    props.models.find(
      (opcion) =>
        opcion.superficie === props.superficie && opcion.model.id === props.model,
    );
  const todosLosGrupos = createMemo(() => agruparModelos(props.models, busqueda()));
  const bloqueado = (opcion: OpcionDeModelo) =>
    !!props.lockedAgent && opcion.agent !== props.lockedAgent;
  const disponible = (opcion: OpcionDeModelo) => opcion.usable && !bloqueado(opcion);
  const grupos = createMemo<GrupoDeModelos[]>(() => {
    const busquedaActiva = busqueda().trim().length > 0;
    const actual = seccion();
    // Buscar es transversal: al escribir, se descubren los modelos sin tener
    // que adivinar primero en qué proveedor viven.
    if (busquedaActiva && actual === "favorites") return todosLosGrupos();
    if (actual === "favorites") {
      const elegibles = favoritosDeModelos(props.models, favoritos());
      return agruparModelos(elegibles, busqueda());
    }
    return todosLosGrupos().filter((grupo) => grupo.id === actual);
  });
  const visibles = () =>
    grupos()
      .flatMap((grupo) => grupo.models)
      .filter(disponible);

  // Un glifo que se repite no distingue nada: OpenCode da Zen, Go y Free con el
  // mismo dibujo, y en un riel de solo iconos no hay forma de saber cuál es cuál
  // sin pasar el ratón. A los que repiten logo se les pone debajo su nombre
  // corto; a los demás, ninguno.
  const repetidos = createMemo(() => {
    const cuenta = new Map<string, number>();
    for (const grupo of todosLosGrupos()) {
      cuenta.set(grupo.logo, (cuenta.get(grupo.logo) ?? 0) + 1);
    }
    return new Set(
      [...cuenta.entries()].filter(([, n]) => n > 1).map(([logo]) => logo),
    );
  });

  // Los gratuitos se nombran por catálogo: `proveedorDe` corre también en node, sin `t()`.
  const rotulo = (grupo: GrupoDeModelos) =>
    grupo.id === "opencode-free" ? t("surfaces.label.free") : grupo.label;
  const corto = (grupo: GrupoDeModelos) =>
    grupo.id === "opencode-free"
      ? t("surfaces.label.free_short")
      : (grupo.label.split(" ").at(-1) ?? grupo.label);

  const niveles = createMemo(() =>
    props.onEffort && props.efforts?.length
      ? effortOptions(props.efforts, props.defaultEffort ?? null)
      : [],
  );
  const nivel = () => effortValue(props.effort ?? "", props.defaultEffort ?? null);
  const rotuloDeNivel = () => {
    const opcion = niveles().find((o) => o.value === nivel());
    return opcion ? nombreDeNivel(opcion.label) : undefined;
  };
  const nombre = () => elegido()?.model.label ?? (props.model || props.missingModelLabel || t("chat.model.none"));

  const mostrarActivo = () => {
    queueMicrotask(() => filas.get(activo())?.scrollIntoView({ block: "nearest" }));
  };

  const abrir = (next: boolean) => {
    if (next && props.disabled) return;
    setAbierto(next);
    if (next) {
      const options = props.invokeOptions;
      setCupoGo(null);
      if (props.models.some((m) => m.proveedor.id === "opencode-go")) {
        void invoke<AccountList>("list_accounts", { provider: "opencode-zen" }, options)
          .then((accounts) => {
            if (!accounts.active) return null;
            return invoke<Query>("account_limits", { provider: "opencode-zen", id: accounts.active, force: false }, options);
          })
          .then(setCupoGo)
          .catch(() => setCupoGo(null));
      }
    }
    if (!next) {
      setBusqueda("");
      setActivo("");
      return;
    }
    const inicial = elegido()?.usable ? elegido()!.key : visibles()[0]?.key ?? "";
    const proveedorElegido = elegido()?.proveedor.id;
    setSeccion(proveedorElegido ?? (favoritos().length > 0 ? "favorites" : todosLosGrupos()[0]?.id ?? "favorites"));
    setActivo(inicial);
    setTimeout(() => {
      campo?.focus();
      mostrarActivo();
    });
  };

  const buscar = (value: string) => {
    setBusqueda(value);
    setActivo(
      agruparModelos(props.models, value)
        .flatMap((grupo) => grupo.models)
        .find(disponible)?.key ?? "",
    );
  };

  const mover = (delta: number) => {
    const opciones = visibles();
    if (opciones.length === 0) return;
    const i = opciones.findIndex((opcion) => opcion.key === activo());
    const inicio = i < 0 ? 0 : i;
    setActivo(opciones[(inicio + delta + opciones.length) % opciones.length].key);
    mostrarActivo();
  };

  const elegir = (key: string) => {
    if (props.disabled) return;
    const opcion = props.models.find((item) => item.key === key && disponible(item));
    if (!opcion) return;
    props.onChange(opcion);
    abrir(false);
  };

  const alternarFavorito = (key: string) => {
    setFavoritos(
      esFavorito(key, favoritos())
        ? favoritos().filter((favorito) => favorito !== key)
        : [...favoritos(), key],
    );
  };

  return (
    <Popover
      open={abierto()}
      onOpenChange={abrir}
      placement="top-end"
      gutter={6}
    >
      <PopoverTrigger
        as={(p: object) => (
          <button
            {...p}
            type="button"
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
              {elegido()?.model.label ?? (props.model || props.missingModelLabel || t("chat.model.placeholder"))}
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
          </button>
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
              } else if (event.key === "Enter" && activo()) {
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
            <button
              type="button"
              class={cn("flex size-9 shrink-0 items-center justify-center rounded-sm text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary", seccion() === "favorites" && "bg-surface-muted text-primary")}
              aria-label={t("chat.model.favorites")}
              title={t("chat.model.favorites")}
              onClick={() => setSeccion("favorites")}
            >
              <Star size={17} fill={seccion() === "favorites" ? "currentColor" : "none"} />
            </button>
            <For each={todosLosGrupos()}>
              {(grupo) => (
                <button
                  type="button"
                  class={cn("flex size-9 shrink-0 flex-col items-center justify-center gap-px rounded-sm text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary", seccion() === grupo.id && "bg-surface-muted text-neutral-950")}
                  aria-label={rotulo(grupo)}
                  title={rotulo(grupo)}
                  onClick={() => setSeccion(grupo.id)}
                >
                  <MarcaAgente
                    id={grupo.logo}
                    size={repetidos().has(grupo.logo) ? 13 : 17}
                  />
                  <Show when={repetidos().has(grupo.logo)}>
                    <span class="text-[0.5625rem] font-medium leading-none">
                      {corto(grupo)}
                    </span>
                  </Show>
                </button>
              )}
            </For>
          </nav>
          <div class="scroll-visible min-h-0 overflow-y-auto p-1" role="listbox" aria-label={t("chat.model.listbox")}>
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
                <section role="group" aria-label={rotulo(grupo)}>
                  <div class="flex items-center gap-1.5 px-2 pb-1 pt-2 text-xs font-medium text-neutral-500">
                    <span class="flex size-4 shrink-0 items-center justify-center text-neutral-950">
                      <MarcaAgente id={grupo.logo} size={14} />
                    </span>
                    <span>{rotulo(grupo)}</span>
                    <Show when={grupo.id === "opencode-go" && cupoGo()?.mode === "read"}>
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
                          <span class="truncate">{opcion.model.label}</span>
                        </span>
                        <button
                          type="button"
                          class={cn("rounded-sm p-0.5 text-neutral-500 outline-none hover:text-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary", esFavorito(opcion.key, favoritos()) && "text-primary")}
                          aria-label={esFavorito(opcion.key, favoritos()) ? t("chat.model.unfavorite", { model: opcion.model.label }) : t("chat.model.favorite", { model: opcion.model.label })}
                          title={esFavorito(opcion.key, favoritos()) ? t("chat.model.unfavorite", { model: opcion.model.label }) : t("chat.model.favorite", { model: opcion.model.label })}
                          onClick={(event) => {
                            event.stopPropagation();
                            alternarFavorito(opcion.key);
                          }}
                        >
                          <Star size={15} fill={esFavorito(opcion.key, favoritos()) ? "currentColor" : "none"} />
                        </button>
                        <Show when={opcion.model.gratis === true}>
                          <span class="rounded-sm border border-border px-1 text-xs text-neutral-500">
                            {t("chat.model.free")}
                          </span>
                        </Show>
                      </div>
                    )}
                  </For>
                </section>
              )}
            </For>
          </Show>
        </div>
        </div>

        <Show when={niveles().length > 0}>
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
                  <button
                    type="button"
                    aria-pressed={o.value === nivel()}
                    class={cn(
                      "h-6 shrink-0 rounded-sm px-2 text-xs text-neutral-500 outline-none hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary",
                      o.value === nivel() && "bg-surface-raised font-semibold text-neutral-950 shadow-sm",
                    )}
                    onClick={() => props.onEffort?.(o.value)}
                  >
                    {nombreDeNivel(o.label)}
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>
      </PopoverContent>
    </Popover>
  );
}
