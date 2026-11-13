import Check from "lucide-solid/icons/check";
import SlidersHorizontal from "lucide-solid/icons/sliders-horizontal";
import { For, type JSX, Show } from "solid-js";
import { t } from "../../lib/i18n";
import {
  type SidebarGrouping,
  type SidebarView,
  DEFAULT_SIDEBAR_VIEW,
  SORTS,
  groupingLabel,
  sameAgent,
  sortLabel,
} from "../../lib/sidebarView";
import { cn } from "../../lib/utils";
import { Button } from "../../ui/Button";
import { ITEM_DE_MENU, Popover, PopoverContent, PopoverTrigger } from "../../ui/Popover";
import { AstroAvatar } from "../projects/AstroAvatar";
import { FolderSquare } from "../projects/FolderChip";

export type SidebarFilterFolder = { id: string; name: string; count: number };
/** `installed` falso: ya no está instalado, pero tiene tareas. */
export type SidebarFilterAgent = { name: string; installed: boolean; body?: string | null; avatar?: string | null };

export type SidebarFilterProps = {
  view: SidebarView;
  onChange: (view: SidebarView) => void;
  /** Solo las carpetas que tienen tareas. */
  folders: SidebarFilterFolder[];
  agents: SidebarFilterAgent[];
  /** Con una sola máquina, «Por máquina» haría un solo grupo: no se ofrece. */
  machines?: boolean;
};

const GROUPINGS: SidebarGrouping[] = ["none", "folder", "status", "agent", "machine"];

const renglon = cn(ITEM_DE_MENU, "grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2 py-1");
const titulo = "flex items-center px-2 pt-1.5 pb-0.5 text-caption font-medium text-neutral-500";
const seccion = "px-2 pt-1.5 pb-1 text-xs font-semibold text-neutral-950";

function Casilla(props: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      class={cn(
        "grid size-3.5 place-items-center rounded-[3px] border",
        props.on ? "border-neutral-950 bg-neutral-950 text-surface-raised" : "border-neutral-500",
      )}
    >
      <Show when={props.on}><Check size={10} stroke-width={3} /></Show>
    </span>
  );
}

function Radio(props: { on: boolean }) {
  return (
    <span aria-hidden="true" class="grid size-3 place-items-center rounded-full border border-neutral-500">
      <Show when={props.on}><span class="size-1.5 rounded-full bg-neutral-950" /></Show>
    </span>
  );
}

function Opcion(props: {
  role: "menuitemcheckbox" | "menuitemradio";
  on: boolean;
  onSelect: () => void;
  children: JSX.Element;
  aside?: JSX.Element;
}) {
  return (
    <button type="button" role={props.role} aria-checked={props.on} class={renglon} onClick={() => props.onSelect()}>
      <Show when={props.role === "menuitemcheckbox"} fallback={<Radio on={props.on} />}>
        <Casilla on={props.on} />
      </Show>
      <span class="flex min-w-0 items-center gap-1.5 truncate">{props.children}</span>
      <span class="text-caption text-neutral-500 tabular-nums">{props.aside}</span>
    </button>
  );
}

/** Las secciones de «Filtrar y agrupar»: carpetas, agente, agrupar y ordenar. */
export function SidebarFilterSections(props: SidebarFilterProps) {
  const set = (patch: Partial<SidebarView>) => props.onChange({ ...props.view, ...patch });
  const total = () => props.folders.reduce((sum, f) => sum + f.count, 0);
  const alternarCarpeta = (id: string) =>
    set({
      folders: props.view.folders.includes(id)
        ? props.view.folders.filter((f) => f !== id)
        : [...props.view.folders, id],
    });

  return (
    <div role="menu" aria-label={t("shell.sidebar.view.trigger")} class="grid gap-0.5">
      <div role="group" aria-label={t("shell.sidebar.view.folders")} class="grid gap-0.5">
        <div class={titulo}>
          <span>{t("shell.sidebar.view.folders")}</span>
          <Show when={props.view.folders.length > 0}>
            <button
              type="button"
              class="ml-auto rounded-sm px-1 text-neutral-500 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
              onClick={() => set({ folders: [] })}
            >
              {t("shell.sidebar.view.all")}
            </button>
          </Show>
        </div>
        <Opcion role="menuitemcheckbox" on={props.view.folders.length === 0} onSelect={() => set({ folders: [] })} aside={total()}>
          {t("shell.sidebar.view.all_folders")}
        </Opcion>
        <For each={props.folders}>
          {(f) => (
            <Opcion role="menuitemcheckbox" on={props.view.folders.includes(f.id)} onSelect={() => alternarCarpeta(f.id)} aside={f.count}>
              <span class="flex min-w-0 items-center gap-1.5"><FolderSquare id={f.id} /><span class="truncate">{f.name}</span></span>
            </Opcion>
          )}
        </For>
      </div>

      <Show when={props.agents.length > 0}>
        <span class="my-1 h-px bg-border" />
        <div role="group" aria-label={t("shell.sidebar.view.agent")} class="grid gap-0.5">
          <div class={titulo}>{t("shell.sidebar.view.agent")}</div>
          <Opcion role="menuitemradio" on={props.view.agent === null} onSelect={() => set({ agent: null })}>
            {t("shell.sidebar.view.all_agents")}
          </Opcion>
          <For each={props.agents}>
            {(a) => (
              <Opcion
                role="menuitemradio"
                on={sameAgent(props.view.agent, a.name)}
                onSelect={() => set({ agent: a.name })}
                aside={a.installed ? undefined : t("shell.sidebar.view.agent_uninstalled")}
              >
                <AstroAvatar name={a.name} body={a.body} avatar={a.avatar} status="asleep" size={14} />
                <span class="truncate">{a.name}</span>
              </Opcion>
            )}
          </For>
        </div>
      </Show>

      <span class="my-1 h-px bg-border" />
      <div role="group" aria-label={t("shell.sidebar.view.group")} class="grid gap-0.5">
        <div class={titulo}>{t("shell.sidebar.view.group")}</div>
        <For each={GROUPINGS.filter((g) => g !== "machine" || props.machines || props.view.group === "machine")}>
          {(g) => (
            <Opcion
              role="menuitemradio"
              on={props.view.group === g}
              onSelect={() => set({ group: g })}
              aside={g === DEFAULT_SIDEBAR_VIEW.group ? t("shell.sidebar.view.default") : undefined}
            >
              {groupingLabel(g)}
            </Opcion>
          )}
        </For>
      </div>

      <span class="my-1 h-px bg-border" />
      <div role="group" aria-label={t("shell.sidebar.view.sort")} class="grid gap-0.5">
        <div class={titulo}>{t("shell.sidebar.view.sort")}</div>
        <For each={SORTS}>
          {(s) => (
            <Opcion
              role="menuitemradio"
              on={props.view.sort === s}
              onSelect={() => set({ sort: s })}
              aside={s === DEFAULT_SIDEBAR_VIEW.sort ? t("shell.sidebar.view.default") : undefined}
            >
              {sortLabel(s)}
            </Opcion>
          )}
        </For>
      </div>
    </div>
  );
}

/**
 * El botón Personalizar de la franja abre los filtros y la agrupación del riel.
 */
export function CustomizeMenu(props: { filter: SidebarFilterProps | null }) {
  return (
    <Popover placement="bottom-end" gutter={4}>
      <PopoverTrigger
        as={(p: object) => (
          <Button
            {...p}
            variant="ghost"
            size="icon"
            class="relative size-7 shrink-0 text-neutral-500"
            aria-haspopup="dialog"
            aria-label={t("shell.customize.trigger")}
            title={t("shell.customize.trigger")}
            data-personalize=""
          >
            <SlidersHorizontal size={15} />
          </Button>
        )}
      />
      <PopoverContent
        aria-label={t("shell.customize.trigger")}
        class="grid max-h-[var(--kb-popper-content-available-height)] w-72 gap-0.5 overflow-y-auto p-1.5"
        onOpenAutoFocus={(e: Event) => e.preventDefault()}
      >
        <Show when={props.filter}>
          {(filter) => (
            <>
              <div class={seccion}>{t("shell.sidebar.view.trigger")}</div>
              <SidebarFilterSections {...filter()} />
            </>
          )}
        </Show>
      </PopoverContent>
    </Popover>
  );
}
