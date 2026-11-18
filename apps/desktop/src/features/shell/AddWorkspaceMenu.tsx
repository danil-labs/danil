import Eye from "lucide-solid/icons/eye";
import Plus from "lucide-solid/icons/plus";
import { type Component, createSignal, For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { t } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import { SEPARADOR_DE_MENU, TITULO_DE_GRUPO } from "../../ui/ContextMenu";
import { ITEM_DE_MENU, Popover, PopoverContent, PopoverTrigger } from "../../ui/Popover";
import { type AttentionState, type TaskAttention, topState } from "./attention";
import { matchesName } from "./hidden-workspaces";
import WorkspaceSearch, { SEARCH_FROM } from "./WorkspaceSearch";

/** Flechas arriba y abajo entre las filas de un menú; el buscador cuenta como la primera. */
export function menuArrows(e: KeyboardEvent) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const menu = e.currentTarget as HTMLElement;
  const items = [...menu.querySelectorAll<HTMLElement>('input[type="search"], [role="menuitem"]:not(:disabled)')];
  if (!items.length) return;
  e.preventDefault();
  const at = items.indexOf(document.activeElement as HTMLElement);
  const step = e.key === "ArrowDown" ? 1 : -1;
  items[at < 0 ? (step > 0 ? 0 : items.length - 1) : (at + step + items.length) % items.length]?.focus();
}

/** Devuelve una fila a la barra sin perder el foco: pasa a la vecina o, si no queda, a la primera del menú. */
export function showKeepingFocus(row: HTMLElement, show: () => void) {
  const neighbor = row.nextElementSibling ?? row.previousElementSibling;
  const menu = row.closest<HTMLElement>('[role="menu"]');
  show();
  const target = neighbor?.isConnected ? neighbor.querySelector<HTMLElement>("[data-show-workspace]") : menu?.querySelector<HTMLElement>('[role="menuitem"]');
  target?.focus();
}

type Hidden = { id: string; name: string };

/** El «+» del riel: crear uno nuevo y, debajo, los ocultos para abrirlos o devolverlos a la barra. */
export default function AddWorkspaceMenu(props: {
  hidden: Hidden[];
  open: string | null;
  tasksOf: (id: string) => TaskAttention[];
  badge: Component<{ state: AttentionState; class?: string }>;
  /** Cómo se dice un estado junto al nombre, para quien no ve el distintivo. */
  labelOf: (state: AttentionState) => string;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onShow: (id: string) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const rows = () => props.hidden.filter((w) => matchesName(w.name, query()));
  // El abierto ya enseña su distintivo en su cuadro.
  const waiting = () => topState(props.hidden.filter((w) => w.id !== props.open).flatMap((w) => props.tasksOf(w.id)));
  const label = () => {
    const state = waiting();
    return state ? t("shell.workspaces.add_hidden_state", { state: props.labelOf(state) }) : t("shell.workspaces.add");
  };
  return (
    <Popover
      open={open()}
      onOpenChange={(value) => (value ? setOpen(true) : close())}
      placement="right-start"
      gutter={4}
    >
      <PopoverTrigger
        type="button"
        data-add-workspace=""
        data-attention={waiting() ?? undefined}
        class="relative mt-1 grid size-8 shrink-0 place-items-center rounded-md border border-dashed border-neutral-500 text-neutral-500 outline-none hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        aria-label={label()}
        title={label()}
      >
        <Plus size={16} aria-hidden="true" />
        <Show when={waiting()}>{(s) => <Dynamic component={props.badge} state={s()} class="absolute -top-1 -right-1" />}</Show>
      </PopoverTrigger>
      <PopoverContent role="menu" class="w-64 p-1" onKeyDown={menuArrows}>
          <button
            type="button"
            role="menuitem"
            class={ITEM_DE_MENU}
            onClick={() => {
              close();
              props.onCreate();
            }}
          >
            {t("shell.workspaces.create")}
          </button>
          <Show when={props.hidden.length > 0}>
            <span aria-hidden="true" class={cn(SEPARADOR_DE_MENU, "block")} />
            <p class={cn("m-0", TITULO_DE_GRUPO)}>{t("shell.workspaces.hidden_title")}</p>
            <Show when={props.hidden.length >= SEARCH_FROM}>
              <WorkspaceSearch value={query()} onInput={setQuery} />
            </Show>
            <div class="max-h-64 overflow-y-auto" data-hidden-workspaces="">
              <For each={rows()}>
                {(w) => {
                  const state = () => (w.id === props.open ? null : topState(props.tasksOf(w.id)));
                  const name = () => w.name || t("shell.directory.unnamed");
                  return (
                    <div class="flex items-center gap-0.5" data-hidden-workspace={w.id}>
                      <button
                        type="button"
                        role="menuitem"
                        class={cn(ITEM_DE_MENU, "flex min-w-0 flex-1 items-center gap-2")}
                        aria-label={state() ? t("shell.workspaces.tile_with_state", { name: name(), state: props.labelOf(state() as AttentionState) }) : name()}
                        title={name()}
                        onClick={() => {
                          close();
                          props.onOpen(w.id);
                        }}
                      >
                        <span class="min-w-0 flex-1 truncate">{name()}</span>
                        <Show when={state()}>{(s) => <Dynamic component={props.badge} state={s()} />}</Show>
                      </button>
                      <button
                        type="button"
                        class="grid size-7 shrink-0 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
                        aria-label={t("shell.workspaces.show", { name: name() })}
                        title={t("shell.workspaces.show", { name: name() })}
                        data-show-workspace={w.id}
                        onClick={(e) => showKeepingFocus(e.currentTarget.closest<HTMLElement>("[data-hidden-workspace]") as HTMLElement, () => props.onShow(w.id))}
                      >
                        <Eye size={13} aria-hidden="true" />
                      </button>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
      </PopoverContent>
    </Popover>
  );
}
