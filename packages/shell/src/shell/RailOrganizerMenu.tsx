import Check from "lucide-solid/icons/check";
import ChevronDown from "lucide-solid/icons/chevron-down";
import ChevronUp from "lucide-solid/icons/chevron-up";
import SlidersHorizontal from "lucide-solid/icons/sliders-horizontal";
import { createMemo, For, Show } from "solid-js";
import { t } from "../../../ui/src/lib/i18n";
import { cn } from "../../../ui/src/lib/utils";
import { Button } from "../../../ui/src/Button";
import { Popover, PopoverContent, PopoverTrigger } from "../../../ui/src/Popover";
import { Pressable } from "../../../ui/src/Pressable";
import {
  isRailLayoutCustomized,
  moveRailSection,
  RAIL_LAYOUT_KEY,
  railLayout,
  registeredRailSections,
  resetRailLayout,
  resolvedRailSections,
  toggleRailSectionVisible,
} from "./rail-layout";

const MOVE_BUTTON =
  "grid size-6 shrink-0 place-items-center rounded-sm text-neutral-500 outline-none hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-500";

/**
 * Organizador del riel izquierdo en la barra superior (`data-personalize`).
 *
 * Permite elegir qué secciones mostrar u ocultar y en qué orden aparecen
 * («Tus agentes», «Tareas» y cualquier plugin que se registre en el riel).
 */
export function RailOrganizerMenu(props: { layoutKey?: string }) {
  const key = () => props.layoutKey ?? RAIL_LAYOUT_KEY;
  const sections = createMemo(() => resolvedRailSections(key()));
  const customized = createMemo(() =>
    isRailLayoutCustomized(railLayout(key()), registeredRailSections()),
  );

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
            title={t("shell.rail_organizer.title")}
            data-personalize=""
          >
            <SlidersHorizontal size={15} aria-hidden="true" />
          </Button>
        )}
      />
      <PopoverContent
        aria-label={t("shell.rail_organizer.title")}
        data-rail-organizer=""
        class="grid max-h-[var(--kb-popper-content-available-height)] w-72 gap-1.5 overflow-y-auto p-2"
        onOpenAutoFocus={(e: Event) => e.preventDefault()}
      >
        <div class="flex items-center justify-between gap-2 px-1.5 pt-0.5">
          <span class="text-xs font-semibold text-neutral-950">
            {t("shell.rail_organizer.title")}
          </span>
          <Show when={customized()}>
            <Pressable
              data-rail-organizer-reset=""
              class="rounded-sm px-1.5 py-0.5 text-caption text-neutral-500 hover:bg-surface-muted hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
              onClick={() => resetRailLayout(key())}
            >
              {t("shell.rail_organizer.reset")}
            </Pressable>
          </Show>
        </div>

        <ul
          role="list"
          aria-label={t("shell.rail_organizer.sections")}
          class="m-0 grid list-none gap-0.5 p-0"
        >
          <For each={sections()}>
            {(section) => {
              const title = () => section.descriptor.label();
              return (
                <li
                  data-rail-organizer-item={section.id}
                  class="flex items-center gap-1 rounded-md px-1 py-1 hover:bg-surface-muted"
                >
                  <Pressable
                    role="switch"
                    aria-checked={section.visible}
                    aria-label={
                      section.visible
                        ? t("shell.rail_organizer.hide", { name: title() })
                        : t("shell.rail_organizer.show", { name: title() })
                    }
                    disabled={!section.canHide}
                    data-rail-organizer-toggle={section.id}
                    class="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-1 py-0.5 text-left text-ui outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                    onClick={() => toggleRailSectionVisible(section.id, key())}
                  >
                    <span
                      aria-hidden="true"
                      class={cn(
                        "grid size-3.5 shrink-0 place-items-center rounded-[3px] border transition-colors",
                        section.visible
                          ? "border-neutral-950 bg-neutral-950 text-surface-raised"
                          : "border-neutral-500 bg-transparent",
                      )}
                    >
                      <Show when={section.visible}>
                        <Check size={10} stroke-width={3} />
                      </Show>
                    </span>
                    <span
                      class={cn(
                        "min-w-0 flex-1 truncate",
                        section.visible ? "font-medium text-neutral-950" : "text-neutral-500",
                      )}
                    >
                      {title()}
                    </span>
                    <Show when={section.descriptor.source === "plugin"}>
                      <span class="shrink-0 rounded-sm bg-neutral-200 px-1.5 py-0.5 text-2xs font-medium text-neutral-700">
                        {t("shell.rail_organizer.plugin_badge")}
                      </span>
                    </Show>
                  </Pressable>

                  <div class="flex shrink-0 items-center gap-0.5">
                    <Pressable
                      class={MOVE_BUTTON}
                      data-rail-organizer-up={section.id}
                      aria-label={t("shell.rail_organizer.move_up", { name: title() })}
                      title={t("shell.rail_organizer.move_up", { name: title() })}
                      disabled={!section.canMoveUp}
                      onClick={() => moveRailSection(section.id, "up", key())}
                    >
                      <ChevronUp size={13} aria-hidden="true" />
                    </Pressable>
                    <Pressable
                      class={MOVE_BUTTON}
                      data-rail-organizer-down={section.id}
                      aria-label={t("shell.rail_organizer.move_down", { name: title() })}
                      title={t("shell.rail_organizer.move_down", { name: title() })}
                      disabled={!section.canMoveDown}
                      onClick={() => moveRailSection(section.id, "down", key())}
                    >
                      <ChevronDown size={13} aria-hidden="true" />
                    </Pressable>
                  </div>
                </li>
              );
            }}
          </For>
        </ul>
      </PopoverContent>
    </Popover>
  );
}
