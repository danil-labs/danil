import ChevronDown from "lucide-solid/icons/chevron-down";
import { For, Show, type JSX } from "solid-js";
import { t } from "../../../ui/src/lib/i18n";
import { cn } from "../../../ui/src/lib/utils";
import { Pressable } from "../../../ui/src/Pressable";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "../../../ui/src/sidebar";
import type { ResolvedRailSection } from "./rail-layout";

/**
 * Sección plegable estándar del riel izquierdo (estilo claude.ai).
 *
 * Comparte la misma cabecera con chevron y ranura de acciones a la derecha entre
 * secciones de núcleo («Tus agentes», «Tareas») y futuros plugins del riel.
 */
export function RailSection(props: {
  id: string;
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  badge?: JSX.Element;
  actions?: JSX.Element;
  children: JSX.Element;
}) {
  return (
    <section
      data-rail-section={props.id}
      data-collapsed={props.collapsed ? "true" : undefined}
      aria-label={props.title}
      class="flex min-w-0 shrink-0 flex-col"
    >
      <div class="group/rail-section flex h-7 min-w-0 items-center justify-between gap-1 px-1">
        <Pressable
          class="flex min-w-0 items-center gap-1 rounded-sm px-1 py-0.5 text-caption font-medium text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary"
          data-rail-section-toggle={props.id}
          aria-expanded={!props.collapsed}
          aria-label={
            props.collapsed
              ? t("shell.sidebar.rail.expand_section", { name: props.title })
              : t("shell.sidebar.rail.collapse_section", { name: props.title })
          }
          onClick={() => props.onToggle()}
        >
          <span class="truncate">{props.title}</span>
          <ChevronDown
            size={12}
            aria-hidden="true"
            class={cn(
              "shrink-0 text-neutral-500 transition-transform duration-150 motion-reduce:transition-none",
              props.collapsed && "-rotate-90",
            )}
          />
          <Show when={props.badge}>{props.badge}</Show>
        </Pressable>
        <Show when={props.actions}>
          <div class="flex shrink-0 items-center gap-0.5">{props.actions}</div>
        </Show>
      </div>
      <Show when={!props.collapsed}>
        <div class="mt-1 min-w-0">{props.children}</div>
      </Show>
    </section>
  );
}

/**
 * Acceso directo de una sola fila en el riel izquierdo (estilo claude.ai).
 *
 * Participa en el organizador del riel igual que una sección (orden y
 * visibilidad), pero se pinta como un botón limpio con ícono y etiqueta.
 */
export function RailButton(props: {
  id: string;
  title: string;
  active?: boolean;
  icon?: JSX.Element;
  onActivate: () => void;
}) {
  return (
    <SidebarMenu class="shrink-0 gap-0.5" data-rail-section={props.id}>
      <SidebarMenuItem>
        <SidebarMenuButton
          isActive={props.active}
          selectionMark={false}
          aria-label={props.title}
          data-rail-button={props.id}
          class="font-medium text-neutral-700 hover:text-neutral-950"
          onClick={() => props.onActivate()}
        >
          <Show when={props.icon}>{props.icon}</Show>
          <span class="truncate">{props.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/** Versión colapsada (solo ícono con tooltip) de los botones del riel. */
export function CollapsedRailButtons(props: {
  sections: ResolvedRailSection[];
  onAfterActivate?: () => void;
}) {
  return (
    <For each={props.sections.filter((s) => s.descriptor.kind === "button" && s.descriptor.onActivate)}>
      {(section) => (
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={section.descriptor.isActive?.()}
            selectionMark={false}
            tooltip={section.descriptor.label()}
            aria-label={section.descriptor.label()}
            data-rail-button={section.id}
            onClick={() => {
              section.descriptor.onActivate?.();
              props.onAfterActivate?.();
            }}
          >
            <Show when={section.descriptor.renderIcon}>{(icon) => icon()()}</Show>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )}
    </For>
  );
}
