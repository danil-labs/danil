import { type Accessor, type JSX, Match, Switch, createEffect, createSignal, onCleanup } from "solid-js";
import { taskSidePanelKind, type TaskDockMode, type TaskSideLayout, type TaskSideMode } from "../../../../ui/src/lib/taskFiles";
import { cn } from "../../../../ui/src/lib/utils";

/** Duration in ms matching the CSS push-drawer transition so closing panels fade/slide before unmounting. */
export const PANEL_SLIDE_MS = 240;

/**
 * Keeps the last non-"none" dock rendered while the panel slides closed (`PANEL_SLIDE_MS`),
 * so close transitions animate out smoothly before unmounting heavy child views (e.g. Subtask chat).
 */
export function createDockMotion(dock: Accessor<TaskDockMode>, open: Accessor<boolean>) {
  const [rendered, setRendered] = createSignal<TaskDockMode>(dock());
  let timer: ReturnType<typeof setTimeout> | undefined;
  createEffect(() => {
    const current = dock();
    const isOpen = open();
    clearTimeout(timer);
    if (isOpen && current !== "none") {
      setRendered(current);
      return;
    }
    if (rendered() === "none") return;
    timer = setTimeout(() => setRendered("none"), PANEL_SLIDE_MS);
  });
  onCleanup(() => clearTimeout(timer));
  return rendered;
}

function sideModeOf(dock: TaskDockMode): TaskSideMode {
  if (dock === "subtask" || dock === "subtasks") return "delegated";
  if (dock === "search") return "search";
  if (dock === "usage") return "usage";
  return "files";
}

/** True for panels that size to their own content instead of stretching to the full viewport height. */
export const isCompactDock = (dock: TaskDockMode): dock is "search" | "subtasks" | "usage" =>
  dock === "search" || dock === "subtasks" || dock === "usage";

/** Dedicated full-height files panel frame (kept mounted while hidden so open tabs survive panel switches). */
export function TaskFilesFrame(props: { active: boolean; layout: TaskSideLayout; children: JSX.Element }) {
  const expanded = () => props.layout === "files-expanded";
  return (
    <section
      data-task-files
      data-task-dock="files"
      data-task-side="files"
      data-task-panel={taskSidePanelKind("files")}
      data-task-layout={props.layout}
      class={cn(
        "@container relative mb-3 flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-surface shadow-md",
        expanded() ? "mx-2" : "mr-2",
        !props.active && "hidden",
      )}
    >
      {props.children}
    </section>
  );
}

/** Dedicated full-height vertical split frame for a live subtask thread beside the main chat. */
export function TaskSubtaskFrame(props: { layout: TaskSideLayout; children: JSX.Element }) {
  return (
    <section
      data-task-dock="subtask"
      data-task-side="delegated"
      data-task-panel={taskSidePanelKind("delegated")}
      data-task-layout={props.layout}
      class="@container relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-border bg-surface"
    >
      {props.children}
    </section>
  );
}

/**
 * Dedicated compact, content-height card frame for Search, Subtasks list, and Usage.
 * Never stretches to full viewport height: grows only as tall as its own content up to a scrollable cap,
 * while living inside the animated push-drawer beside the chat (never overlaying messages).
 */
export function TaskCompactPanel(props: {
  dock: "search" | "subtasks" | "usage";
  layout: TaskSideLayout;
  onDismiss?: () => void;
  children: JSX.Element;
}) {
  const sideMode = () => sideModeOf(props.dock);
  createEffect(() => {
    const dismiss = props.onDismiss;
    if (!dismiss) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });
  return (
    <section
      data-task-dock={props.dock}
      data-task-side={sideMode()}
      data-task-panel={taskSidePanelKind(sideMode())}
      data-task-layout={props.layout}
      class={cn(
        "@container relative mb-3 flex max-h-[min(468px,calc(100%-12px))] min-h-0 w-full flex-col self-start overflow-hidden rounded-lg border border-border bg-surface shadow-md",
        props.layout === "panel-full" ? "mx-2" : "mr-2",
      )}
    >
      {props.children}
    </section>
  );
}

/**
 * Orchestrates each docked right-hand panel in its own dedicated component inside the fluid push-drawer:
 * - Files: `TaskFilesFrame` (full-height files card, preserved across switches).
 * - Subtask thread: `TaskSubtaskFrame` (full-height vertical split with `border-l`).
 * - Search, Subtasks list, Usage: `TaskCompactPanel` (compact content-height card, never full-height).
 */
export function TaskSideShell(props: {
  dock: TaskDockMode;
  layout: TaskSideLayout;
  onDismiss?: () => void;
  subtaskSlot: JSX.Element;
  searchSlot?: JSX.Element;
  delegatedSlot?: JSX.Element;
  usageSlot?: JSX.Element;
  children: JSX.Element;
}) {
  return (
    <>
      <TaskFilesFrame active={props.dock === "files"} layout={props.layout}>
        {props.children}
      </TaskFilesFrame>
      <Switch>
        <Match when={props.dock === "subtask"}>
          <TaskSubtaskFrame layout={props.layout}>{props.subtaskSlot}</TaskSubtaskFrame>
        </Match>
        <Match when={props.dock === "search"}>
          <TaskCompactPanel dock="search" layout={props.layout} onDismiss={props.onDismiss}>
            {props.searchSlot}
          </TaskCompactPanel>
        </Match>
        <Match when={props.dock === "subtasks"}>
          <TaskCompactPanel dock="subtasks" layout={props.layout} onDismiss={props.onDismiss}>
            {props.delegatedSlot}
          </TaskCompactPanel>
        </Match>
        <Match when={props.dock === "usage"}>
          <TaskCompactPanel dock="usage" layout={props.layout} onDismiss={props.onDismiss}>
            {props.usageSlot}
          </TaskCompactPanel>
        </Match>
      </Switch>
    </>
  );
}
