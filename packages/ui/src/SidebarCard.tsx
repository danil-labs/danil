import { Show, type JSX } from "solid-js";
import { Pressable } from "./Pressable";
import { cn } from "./lib/utils";

/**
 * Shared card primitive for the left sidebar (Projects, Agents, Tasks, etc.).
 * Gives every rail item the same subtle card surface, border, hover/active states,
 * and slot geometry (`leading`, `title`, `subtitle`, `trailing`).
 */
export function SidebarCard(props: {
  leading?: JSX.Element;
  title: JSX.Element;
  subtitle?: JSX.Element;
  trailing?: JSX.Element;
  active?: boolean;
  onClick?: (event: MouseEvent) => void;
  ariaLabel?: string;
  titleAttr?: string;
  class?: string;
  "data-sidebar-card"?: string;
  "data-dock-agent"?: string;
  "data-sidebar-project"?: string;
}) {
  return (
    <div
      role={props.onClick ? "button" : undefined}
      tabIndex={props.onClick ? 0 : undefined}
      aria-label={props.ariaLabel}
      aria-current={props.active ? "true" : undefined}
      title={props.titleAttr}
      data-sidebar-card={props["data-sidebar-card"] ?? ""}
      data-dock-agent={props["data-dock-agent"]}
      data-sidebar-project={props["data-sidebar-project"]}
      class={cn(
        "group/sidebar-card flex w-full min-w-0 items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary",
        props.onClick && "cursor-pointer",
        props.active
          ? "border-border-strong bg-surface-raised text-neutral-950"
          : "border-border/70 bg-surface-muted/70 text-neutral-950 hover:border-border hover:bg-surface-muted",
        props.class,
      )}
      onClick={(event) => props.onClick?.(event)}
      onKeyDown={(event) => {
        if (!props.onClick) return;
        if (event.target !== event.currentTarget) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        props.onClick(event as unknown as MouseEvent);
      }}
    >
      <Show when={props.leading}>
        <div class="relative flex shrink-0 items-center justify-center">{props.leading}</div>
      </Show>
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="truncate text-ui leading-tight font-medium text-neutral-950">{props.title}</span>
        <Show when={props.subtitle}>
          <span class="truncate text-caption leading-tight text-neutral-500">{props.subtitle}</span>
        </Show>
      </div>
      <Show when={props.trailing}>
        <div class="flex shrink-0 items-center gap-1 text-neutral-500">{props.trailing}</div>
      </Show>
    </div>
  );
}

/** Compact icon action inside a `SidebarCard`'s trailing slot (e.g. `+` to create a task in a project). */
export function SidebarCardAction(props: {
  ariaLabel: string;
  title?: string;
  onClick: (event: MouseEvent) => void;
  class?: string;
  children: JSX.Element;
}) {
  return (
    <Pressable
      aria-label={props.ariaLabel}
      title={props.title ?? props.ariaLabel}
      class={cn(
        "grid size-6 shrink-0 place-items-center rounded-md border border-border/60 bg-surface text-neutral-600 transition-colors hover:border-border-strong hover:bg-neutral-950 hover:text-neutral-50 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary",
        props.class,
      )}
      onClick={(event) => {
        event.stopPropagation();
        props.onClick(event);
      }}
    >
      {props.children}
    </Pressable>
  );
}
