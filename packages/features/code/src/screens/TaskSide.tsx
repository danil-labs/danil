import { type JSX, Match, Show, Switch } from "solid-js";
import { taskSidePanelKind, type TaskSideMode } from "../../../../ui/src/lib/taskFiles";
import { cn } from "../../../../ui/src/lib/utils";

/**
 * Full-height right-side split container separated from the main chat by a vertical border line.
 * Keeps Files & Search cleanly isolated from the dedicated Subtasks panel while only showing one at a time.
 */
export function TaskSideShell(props: { mode: TaskSideMode; covers?: boolean; side: JSX.Element; children: JSX.Element }) {
  return (
    <section
      data-task-files
      data-task-side={props.mode}
      data-task-panel={taskSidePanelKind(props.mode)}
      class={cn(
        "@container relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-surface",
        !props.covers && "border-l border-border",
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
