import Globe from "lucide-solid/icons/globe";
import Plus from "lucide-solid/icons/plus";
import SquarePen from "lucide-solid/icons/square-pen";
import X from "lucide-solid/icons/x";
import { For, Show } from "solid-js";
import { t } from "../../../../../apps/desktop/src/lib/i18n";
import { ariaDeAtajo, textoDeAtajo } from "../../../../ui/src/lib/shortcuts";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "../../../../ui/src/ContextMenu";
import { Atajo } from "../../../../ui/src/Shortcut";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../../ui/src/DropdownMenu";
import { Pressable } from "../../../../ui/src/Pressable";
import { type TabStripProps } from "./tabs-model";
import { createTabStrip } from "./tabs-state";
import { createRenderTab } from "./tabs-tab";

// Tira de pestañas; lib/tabs.ts determina su persistencia y el cierre en bloque.
// Cerrar una pestaña deja su tarea y su turno vivos.
export default function TabStrip(props: TabStripProps) {
  const { strip, gitRows, profiles, separators, labels, reveal, move, wheel, scrolled, orderedTabs, setSelectedTab, keptTabs, previewTabs, selected, closeBatch, group } = createTabStrip(props);
  const renderTab = createRenderTab(props, { gitRows, profiles, separators, labels, reveal });

  return (
    <ContextMenu>
    <ContextMenuTrigger
      ref={strip}
      data-tab-scroll=""
      onKeyDown={move}
      onWheel={wheel}
      onScroll={scrolled}
      onContextMenu={(e: MouseEvent) => {
        const element = (e.target as HTMLElement).closest<HTMLElement>("[data-envoltorio]");
        const p = element ? orderedTabs()[Number(element.dataset.envoltorio)] : undefined;
        if (!p) e.preventDefault();
        setSelectedTab(p?.id ?? null);
      }}
      // La pestaña activa toca el borde inferior para fundirse con su panel bajo el velo.
      // flex-1 separaría el botón de añadir de la última pestaña.
      // Con touchpad en Windows, el rebote elástico al tope desplaza el texto sin el fondo de la pestaña.
      class="group/strip relative flex min-w-0 items-end gap-0.5 self-stretch overflow-x-auto overflow-y-hidden overscroll-x-none px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div role="tablist" aria-label={t("projects.tabs.label")} class="flex shrink-0 items-end gap-0.5 self-stretch">
        <For each={keptTabs()}>{renderTab}</For>
      <Show when={props.dropIndex === keptTabs().length}>
        <span
          aria-hidden="true"
          class="h-5 w-0.5 shrink-0 self-center rounded-full bg-primary"
        />
      </Show>
      </div>
      {/* Tras las conservadas: al lanzarse, su pestaña conservada aparece en este mismo sitio.
          Fuera del tablist y sin rol de pestaña, como las vistas: no es una pestaña guardada. */}
      <Show when={props.draftLabel}>
        {(label) => (
          <div
            data-borrador=""
            class="tab-active ml-0.5 group flex h-[30px] w-[220px] shrink-0 items-center rounded-sm pr-1 text-ui font-semibold text-neutral-950 select-none"
          >
            <div
              aria-current="page"
              title={label()}
              class="flex h-full min-w-0 flex-1 cursor-default items-center gap-1.5 pl-2"
            >
              <SquarePen size={12} class="shrink-0 text-neutral-500" aria-hidden={true} />
              <span class="min-w-0 flex-1 truncate">{label()}</span>
            </div>
            <Show when={props.onCloseDraft}>
              {(close) => (
                <Pressable
                  tabindex={-1}
                  aria-label={t("projects.tabs.close_named", { title: label() })}
                  title={`${t("projects.tabs.close")} (${textoDeAtajo("closeTab")})`}
                  aria-keyshortcuts={ariaDeAtajo("closeTab")}
                  onClick={() => close()()}
                  class="grid size-5 shrink-0 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-neutral-200 hover:text-neutral-950 focus-visible:opacity-100"
                >
                  <X size={13} />
                </Pressable>
              )}
            </Show>
          </div>
        )}
      </Show>
      <Show when={previewTabs().length > 0}>
      <div data-preview-header="" class="ml-0.5 flex shrink-0 items-end self-stretch">
        <For each={previewTabs()}>{(p, i) => renderTab(p, () => keptTabs().length + i())}</For>
      </div>
      </Show>
    </ContextMenuTrigger>
    <ContextMenuContent>
      <Show when={selected() && props.pinnedIds && !props.pinnedIds.has(selected()!)}>
        <ContextMenuItem onSelect={() => selected() && props.onPin?.(selected()!)}>
          {t("projects.tabs.keep")}
        </ContextMenuItem>
      </Show>
      <ContextMenuItem onSelect={() => closeBatch("esta")}>
        {t("projects.tabs.close")}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={group("demas").length === 0}
        onSelect={() => closeBatch("demas")}
      >
        {t("projects.tabs.close_others")}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={group("derecha").length === 0}
        onSelect={() => closeBatch("derecha")}
      >
        {t("projects.tabs.close_right")}
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => closeBatch("todas")}>
        {t("projects.tabs.close_all")}
      </ContextMenuItem>
      <ContextMenuItem disabled={!props.canReopen} onSelect={() => props.onReopen()}>
        <Atajo accion="reopenTab" etiqueta={t("projects.tabs.reopen")} />
      </ContextMenuItem>
    </ContextMenuContent>
    </ContextMenu>
  );
}

// El botón de añadir se monta aparte para conservarlo cuando la tira se vuelve a montar.
export function NewTabButton(props: {
  projects: { id: string; name: string }[];
  onNewTask: (project: string) => void;
  onBrowser: () => void;
}) {
  let selected = false;
  // Un menú modal impediría enfocar la barra del navegador recién abierto.
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={t("projects.tabs.new")}
        title={t("projects.tabs.new")}
        class="ml-0.5 grid size-6 shrink-0 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary data-[expanded]:bg-surface-muted data-[expanded]:text-neutral-950"
      >
        <Plus size={14} />
      </DropdownMenuTrigger>
      {/* Restaurar el foco al botón impediría enfocar el contenido que acaba de abrirse. */}
      <DropdownMenuContent
        class="max-w-[280px]"
        onCloseAutoFocus={(e) => {
          if (selected) e.preventDefault();
          selected = false;
        }}
      >
        <Show when={props.projects.length > 0}>
          <DropdownMenuGroup>
            <DropdownMenuGroupLabel>{t("projects.tabs.new_task_in")}</DropdownMenuGroupLabel>
            <For each={props.projects}>
              {(c) => (
                <DropdownMenuItem
                  class="flex items-center gap-2"
                  onSelect={() => {
                    selected = true;
                    props.onNewTask(c.id);
                  }}
                >
                  <SquarePen size={13} class="shrink-0 text-neutral-500" aria-hidden={true} />
                  <span class="min-w-0 truncate">{c.name}</span>
                </DropdownMenuItem>
              )}
            </For>
          </DropdownMenuGroup>
        </Show>
        <Show when={props.projects.length > 0}>
          <DropdownMenuSeparator />
        </Show>
        <DropdownMenuItem
          class="flex items-center gap-2"
          onSelect={() => {
            selected = true;
            props.onBrowser();
          }}
        >
          <Globe size={13} class="shrink-0 text-neutral-500" aria-hidden={true} />
          <span>{t("projects.tabs.new_browser")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
