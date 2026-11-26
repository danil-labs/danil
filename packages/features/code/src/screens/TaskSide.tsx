import { type Accessor, type JSX, Match, Show, Switch, createEffect, createSignal, onCleanup } from "solid-js";
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

/**
 * Unified right-side docked panel frame beside the main chat (below the fixed top bar):
 * - Files ("files-split" / "files-expanded"): floating Danil card style (`rounded-lg border shadow-md`).
 * - Subtask thread, Search, and Subtasks list: full-height vertical split separated by `border-l border-border`,
 *   smoothly pushing the main chat (never overlaying content).
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
  const isFiles = () => props.dock === "files";
  const isFilesExpanded = () => props.layout === "files-expanded";
  const sideMode = () => sideModeOf(props.dock);
  createEffect(() => {
    const dismiss = props.onDismiss;
    if (!dismiss || (props.dock !== "subtasks" && props.dock !== "usage")) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });
  return (
    <section
      data-task-files
      data-task-dock={props.dock}
      data-task-side={sideMode()}
      data-task-panel={taskSidePanelKind(sideMode())}
      data-task-layout={props.layout}
      class={cn(
        "@container relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-surface",
        isFiles()
          ? cn("mb-3 rounded-lg border border-border shadow-md", isFilesExpanded() ? "mx-2" : "mr-2")
          : "h-full border-l border-border",
      )}
    >
      <div class="flex h-full min-h-0 min-w-0 flex-1" classList={{ hidden: props.dock !== "files" }}>
        {props.children}
      </div>
      <Show when={props.dock !== "files" && props.dock !== "none"}>
        <div class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Switch>
            <Match when={props.dock === "subtask"}>{props.subtaskSlot}</Match>
            <Match when={props.dock === "search"}>{props.searchSlot}</Match>
            <Match when={props.dock === "subtasks"}>{props.delegatedSlot}</Match>
            <Match when={props.dock === "usage"}>{props.usageSlot}</Match>
          </Switch>
        </div>
      </Show>
    </section>
  );
}
