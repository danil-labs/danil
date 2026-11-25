import { type JSX, Match, Show, Switch } from "solid-js";
import type { TaskSideMode } from "../../../../ui/src/lib/taskFiles";

/** The files window frame. Search, usage and delegated tasks reuse it instead of a second box. */
export function TaskSideShell(props: { mode: TaskSideMode; side: JSX.Element; children: JSX.Element }) {
  return (
    <section data-task-files data-task-side={props.mode}
      class="@container relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-surface shadow-md">
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
