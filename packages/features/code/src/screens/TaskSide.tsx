import { type JSX, Match, Show, Switch } from "solid-js";
import { taskSidePanelKind, type TaskSideLayout, type TaskSideMode } from "../../../../ui/src/lib/taskFiles";
import { cn } from "../../../../ui/src/lib/utils";

/**
 * Right-side task panel frame:
 * - "replace" (Files) and "floating" (Search / Usage / Subtasks list): native Danil card frame.
 * - "split-thread" (active Subtask thread): vertical split separated by a clean border line below the fixed top bar.
 */
export function TaskSideShell(props: { mode: TaskSideMode; layout: TaskSideLayout; side: JSX.Element; children: JSX.Element }) {
  const split = () => props.layout === "split-thread";
  return (
    <section
      data-task-files
      data-task-side={props.mode}
      data-task-panel={taskSidePanelKind(props.mode)}
      data-task-layout={props.layout}
      class={cn(
        "@container relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-surface",
        split()
          ? "border-l border-border"
          : "rounded-lg border border-border shadow-md",
      )}
    >
      <div class="flex h-full min-h-0 min-w-0 flex-1" classList={{ hidden: props.mode !== "files" }}>
        {props.children}
      </div>
      <Show when={props.mode !== "files"}>
        <div class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {props.side}
        </div>
      </Show>
    </section>
  );
}

export function TaskSide(props: {
  mode: TaskSideMode;
  searchSlot: JSX.Element;
  usageSlot: JSX.Element;
  delegatedSlot: JSX.Element;
}) {
  return (
    <Switch>
      <Match when={props.mode === "search"}>
        {props.searchSlot}
      </Match>
      <Match when={props.mode === "usage"}>
        {props.usageSlot}
      </Match>
      <Match when={props.mode === "delegated"}>
        {props.delegatedSlot}
      </Match>
    </Switch>
  );
}
